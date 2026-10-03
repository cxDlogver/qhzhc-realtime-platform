import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import {
  PROTOCOL_VERSION,
  WS_CLOSE,
  isClientMessage,
  serializeServerMessage,
  type ClientMessage,
  type DeliveryPointLimit,
  type ServerMessage,
  type TelemetryBucketStatus,
  type TelemetryPoint,
  type TelemetrySecondBucket,
} from "../shared/index.js";
import { AuthError, AuthService, type AuthPrincipal } from "./auth.js";
import { TelemetryStreamService } from "./telemetry-stream.js";

// 心跳发送间隔；握手时随 welcome 下发，客户端据此推导超时阈值（见 realtimeClient）。
const HEARTBEAT_INTERVAL_MS = 8_000;
// 应用层判活时限：约为心跳间隔的 3.75 倍，容忍连续丢 3 次心跳，避免偶发抖动误杀连接。
const CLIENT_STALE_AFTER_MS = 30_000;
// 单次重放/补发的点数上限：客户端可能已断线很久，不能让它一次性拖走整表数据。
const MAX_REPLAY_BUCKETS = 5_000;

interface ClientContext {
  /** 连接唯一标识，随 welcome 下发给客户端，便于前后端日志对齐。 */
  id: string;
  socket: WebSocket;
  /** 校验通过后的身份主体；未握手前为 null，握手后由心跳线程周期性重验。 */
  principal: AuthPrincipal | null;
  /** 当前绑定的 access token，心跳会持续重验，过期即断开。 */
  accessToken: string | null;
  /** 订阅的机器人，取自 URL 路径；authenticate 报文中的 robotId 必须与之一致。 */
  robotId: string;
  /** 是否已完成握手：未握手的连接收不到 publish 的实时广播。 */
  initialized: boolean;
  /** 正在异步校验令牌，用于阻止并发重复握手。 */
  authenticating: boolean;
  /** 当前连接每个自然秒最多接收的点数；0 表示发送该秒全部点。 */
  maxPointsPerSecond: DeliveryPointLimit;
  /** 补发期间暂停普通实时投递，避免 live 与 replay 交叉。 */
  replaying: boolean;
  /** 最近一次收到任意消息或 pong 的时间，应用层存活着判据。 */
  lastSeenAt: number;
  /** 协议层存活判据：发出 ping 后置 false，收到 pong 置回 true。 */
  protocolAlive: boolean;
  /** 握手倒计时，5 秒内未完成 authenticate 即按协议错误断开。 */
  authTimer: NodeJS.Timeout;
}

/**
 * 单机器人的实时数据广播中枢。
 *
 * 一条连接的生命周期：HTTP upgrade 解析 robotId → accept 建立上下文并起 5s 握手倒计时 →
 * authenticate 校验令牌并绑定订阅参数 → 按客户端提交的起始时间补发 →
 * 置为 initialized，此后纳入 publish 广播与心跳巡检。
 */
export class RobotSocketHub {
  /** noServer 模式：upgrade 由 http server 手动接管，便于与既有中间件共用同一端口。 */
  private readonly webSocketServer = new WebSocketServer({ noServer: true });
  /** socket → 上下文；以 socket 为 key，close 时可 O(1) 摘除。 */
  private readonly clients = new Map<WebSocket, ClientContext>();
  /** 心跳巡检定时器；未 unref，进程退出前必须显式调用 close()。 */
  private readonly heartbeatTimer: NodeJS.Timeout;

  constructor(
    server: Server,
    private readonly auth: AuthService,
    private readonly stream: TelemetryStreamService,
  ) {
    server.on("upgrade", (request, socket, head) => {
      // request.url 只有 path + query，需要补一个 base 才能交给 URL 解析。
      const url = new URL(request.url ?? "/", "http://localhost");
      const match = /^\/ws\/robots\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
      // 路径不匹配时 ws 尚未接管，无法用关闭帧回应，只能直接销毁裸 socket。
      if (!match) {
        socket.destroy();
        return;
      }
      const robotId = match[1];
      if (!robotId) {
        socket.destroy();
        return;
      }

      /** handleUpgrade 方法：负责将 socket 升级为 WebSocket 连接。
       * 回调函数用于处理 WebSocket 连接
       * @param request 请求对象
       * @param socket 套接字对象
       * @param head 请求头
       * @param callback 回调函数
       */
      this.webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
        this.accept(webSocket, robotId);
      });
    });
    this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), HEARTBEAT_INTERVAL_MS);
  }

  /** 当前在线连接数，包含尚未完成握手的连接。 */
  connectionCount(): number {
    return this.clients.size;
  }

  /**
   * 向所有已完成握手的连接广播最新遥测。
   *
   * 每条连接根据自己的每秒点数上限独立抽样，抽样结果保持采样时间顺序。
   */
  publish(bucket: TelemetrySecondBucket): void {
    for (const context of this.clients.values()) {
      // 未握手的连接跳过后期的实时流：它缺的那段会由重放计划补齐，两边不会重复。
      if (!context.initialized || context.replaying) continue;
      const matching = bucket.points.filter((point) => point.robotId === context.robotId);
      const sampled = this.samplePoints(
        matching,
        context.maxPointsPerSecond,
        context.robotId,
        bucket.bucketStartMs,
      );
      this.sendTelemetrySecond(
        context,
        bucket.bucketStartMs,
        bucket.bucketEndMs,
        bucket.status,
        sampled,
        false,
      );
    }
  }

  /** 断线恢复测试：以 1012（服务重启）批量断开并返回受影响连接数，清理交给各自的 close 事件。 */
  disconnectAll(reason = "模拟网络中断"): number {
    const count = this.clients.size;
    for (const context of this.clients.values()) {
      context.socket.close(1012, reason);
    }
    return count;
  }

  /** 优雅关停：停心跳 → 逐个正常关闭 → 关闭 server。不调用的话心跳定时器会一直持活事件循环。 */
  close(): void {
    clearInterval(this.heartbeatTimer);
    for (const context of this.clients.values()) {
      context.socket.close(WS_CLOSE.NORMAL, "服务关闭");
    }
    this.webSocketServer.close();
  }

  /** 建立连接上下文并挂载生命周期事件；真正的准入控制（令牌、robotId 一致性）在 onMessage 中。 */
  private accept(
    socket: WebSocket,
    robotId: string,
  ): void {
    const context: ClientContext = {
      id: randomUUID(),
      socket,
      principal: null,
      accessToken: null,
      robotId,
      initialized: false,
      authenticating: false,
      maxPointsPerSecond: 0,
      replaying: false,
      lastSeenAt: Date.now(),
      protocolAlive: true,
      // 回调延时执行，届时 context 必定已赋值完毕，闭包引用是安全的。
      authTimer: setTimeout(() => {
        if (!context.initialized) {
          socket.close(WS_CLOSE.PROTOCOL_ERROR, "authentication timeout");
        }
      }, 5_000),
    };
    this.clients.set(socket, context);
    socket.on("message", (raw) => {
      // onMessage 是 async，任何漏出的异常都降级成 SERVER_ERROR 关闭，避免 unhandledRejection 拖垮进程。
      void this.onMessage(context, raw).catch(() => {
        socket.close(WS_CLOSE.SERVER_ERROR, "server error");
      });
    });
    socket.on("pong", () => {
      context.protocolAlive = true;
      context.lastSeenAt = Date.now();
    });
    socket.on("close", () => {
      // close 是唯一清理出口：error 之后必定跟随 close，因此清理逻辑不重复。
      clearTimeout(context.authTimer);
      this.clients.delete(socket);
    });
    socket.on("error", () => {
      // close 是统一清理入口；error 在浏览器和 Node 中都不携带稳定的业务语义。
    });
  }

  /** 协议前置校验：入站消息需依次通过「可解析 → 形状合法 → 握手状态一致」三道闸门后才分发。 */
  private async onMessage(context: ClientContext, raw: RawData): Promise<void> {
    // 即便是非法报文也算应用层存活信号：能发包说明对端进程还在。
    context.lastSeenAt = Date.now();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      context.socket.close(WS_CLOSE.PROTOCOL_ERROR, "invalid json");
      return;
    }
    if (!isClientMessage(parsed)) {
      context.socket.close(WS_CLOSE.PROTOCOL_ERROR, "invalid message");
      return;
    }
    // 握手前只放行 authenticate，握手后不再接受它，杜绝重复握手。
    if (!context.initialized && parsed.type !== "authenticate") {
      context.socket.close(WS_CLOSE.PROTOCOL_ERROR, "authentication required");
      return;
    }
    // 令牌校验是异步的，并发的第二条 authenticate 会让两条核验互相覆盖，直接拒绝。
    if (!context.initialized && context.authenticating) {
      context.socket.close(WS_CLOSE.PROTOCOL_ERROR, "authentication in progress");
      return;
    }
    if (context.initialized && parsed.type === "authenticate") {
      context.socket.close(WS_CLOSE.PROTOCOL_ERROR, "already authenticated");
      return;
    }
    await this.routeMessage(context, parsed);
  }

  /** 按消息类型分发；其中只有 authenticate 是异步的（涉及令牌校验）。 */
  private async routeMessage(context: ClientContext, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case "authenticate":
        await this.handleAuthenticate(context, message);
        break;
      case "ping":
        this.send(context, {
          type: "pong",
          nonce: message.nonce,
          serverTime: Date.now(),
          latestBucketStartMs: this.stream.getLatestBucketStartMs(context.robotId),
        });
        break;
      case "resend_time_range":
        this.handleResend(context, message.fromBucketStartMs);
        break;
    }
  }

  /** 处理握手：校验令牌、绑定每秒抽样配置，并从客户端提交的时间继续发送。 */
  private async handleAuthenticate(
    context: ClientContext,
    message: Extract<ClientMessage, { type: "authenticate" }>,
  ): Promise<void> {
    // robotId 以 URL 路径为准；报文里若声称订阅另一个机器人，一律视为非法握手。
    if (context.initialized || message.robotId !== context.robotId) {
      context.socket.close(WS_CLOSE.PROTOCOL_ERROR, "invalid authentication");
      return;
    }
    context.authenticating = true;
    let principal: AuthPrincipal;
    try {
      principal = await this.auth.verifyAccessToken(message.accessToken);
    } catch (error) {
      // 校验失败要放开 authenticating，否则该连接再也无法重试握手，只能等超时被踢。
      clearTimeout(context.authTimer);
      context.authenticating = false;
      const reason = error instanceof AuthError ? error.code : "ACCESS_TOKEN_INVALID";
      context.socket.close(WS_CLOSE.AUTHENTICATION_EXPIRED, reason);
      return;
    }
    // await 期间连接可能已被对端关闭，下发 welcome 前必须重查一次。
    if (context.socket.readyState !== WebSocket.OPEN) return;
    clearTimeout(context.authTimer);
    context.principal = principal;
    context.accessToken = message.accessToken;
    context.maxPointsPerSecond = message.maxPointsPerSecond;
    context.authenticating = false;
    const latest = this.stream.getLatestBucketStartMs(context.robotId);
    this.send(context, {
      type: "welcome",
      protocolVersion: PROTOCOL_VERSION,
      connectionId: context.id,
      robotId: context.robotId,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      latestBucketStartMs: latest,
      resumedFromBucketStartMs: message.resumeFromBucketStartMs,
    });

    if (latest !== null && message.resumeFromBucketStartMs <= latest) {
      this.replayBuckets(context, message.resumeFromBucketStartMs, latest);
    }
    context.initialized = true;
  }

  /** 从请求起点补到服务端最近处理完的自然秒；补发期间暂停该连接的 live 投递。 */
  private handleResend(context: ClientContext, fromBucketStartMs: number): void {
    const latest = this.stream.getLatestBucketStartMs(context.robotId);
    if (latest === null || fromBucketStartMs > latest) return;
    this.replayBuckets(context, fromBucketStartMs, latest);
  }

  private replayBuckets(
    context: ClientContext,
    fromBucketStartMs: number,
    throughBucketStartMs: number,
  ): void {
    const bucketCount = Math.floor((throughBucketStartMs - fromBucketStartMs) / 1_000) + 1;
    const earliest = this.stream.earliestTelemetryBucketStartMs(context.robotId);
    if (bucketCount > MAX_REPLAY_BUCKETS) {
      this.sendGap(context, fromBucketStartMs, earliest, throughBucketStartMs);
      return;
    }

    context.replaying = true;
    for (
      let bucketStartMs = fromBucketStartMs;
      bucketStartMs <= throughBucketStartMs;
      bucketStartMs += 1_000
    ) {
      const bucket = this.stream.readBucket(context.robotId, bucketStartMs);
      const sampled = this.samplePoints(
        bucket.points,
        context.maxPointsPerSecond,
        context.robotId,
        bucketStartMs,
      );
      this.sendTelemetrySecond(
        context,
        bucketStartMs,
        bucketStartMs + 1_000,
        bucket.status,
        sampled,
        true,
      );
    }
    this.send(context, { type: "replay_complete", throughBucketStartMs });
    context.replaying = false;
  }

  /** 请求范围超过留存或补发预算时，明确跳到最新自然秒。 */
  private sendGap(
    context: ClientContext,
    requestedFromBucketStartMs: number,
    earliestAvailableBucketStartMs: number | null,
    latestBucketStartMs: number,
  ): void {
    this.send(context, {
      type: "gap",
      requestedFromBucketStartMs,
      earliestAvailableBucketStartMs,
      latestBucketStartMs,
      action: "skip-to-latest",
    });
    context.replaying = false;
  }

  private sendTelemetrySecond(
    context: ClientContext,
    bucketStartMs: number,
    bucketEndMs: number,
    status: TelemetryBucketStatus,
    points: TelemetryPoint[],
    replay: boolean,
  ): void {
    this.send(context, {
      type: "telemetry_second",
      batchId: `${context.robotId}:${bucketStartMs}:${context.maxPointsPerSecond}:v1`,
      bucketStartMs,
      bucketEndMs,
      status,
      points,
      sentAt: Date.now(),
      replay,
    });
  }

  /** 同一车辆、自然秒与抽样数量始终选出相同点，补发与首次发送保持一致。 */
  private samplePoints(
    points: TelemetryPoint[],
    limit: DeliveryPointLimit,
    robotId: string,
    bucketStartMs: number,
  ): TelemetryPoint[] {
    const ordered = points.toSorted((left, right) =>
      left.sampledAt.localeCompare(right.sampledAt) || left.sequence - right.sequence,
    );
    if (limit === 0 || ordered.length <= limit) return ordered;
    const seed = `${robotId}:${bucketStartMs}:${limit}:v1`;
    return ordered
      .map((point) => ({ point, score: this.stableHash(`${seed}:${point.sampledAt}`) }))
      .toSorted((left, right) => left.score - right.score)
      .slice(0, limit)
      .map(({ point }) => point)
      .toSorted((left, right) => left.sampledAt.localeCompare(right.sampledAt));
  }

  private stableHash(value: string): number {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  private send(context: ClientContext, message: ServerMessage): void {
    if (context.socket.readyState !== WebSocket.OPEN) return;
    // 背压保护：积压超 2MB 说明客户端消费不动，断开后从最新批次时间继续补发，
    // 也不能让服务端缓冲区无限膨胀。
    if (context.socket.bufferedAmount > 2 * 1024 * 1024) {
      context.socket.close(1013, "client backpressure");
      return;
    }
    context.socket.send(serializeServerMessage(message));
  }

  /**
   * 每轮巡检做两件事：
   *
   * 1. 对已认证连接重验 access token——长连接不应活得比令牌久，令牌轮换 / 封禁后能及时踢掉；
   * 2. 用「协议层未完成 ping-pong」+「应用层超时」双判据淘汰僵尸连接，清掉半开占位。
   */
  private async checkHeartbeats(): Promise<void> {
    const now = Date.now();
    // 串行 await：连接数大时单轮耗时会随客户端数量线性增长，当前规模下可接受。
    for (const context of this.clients.values()) {
      if (context.initialized && context.accessToken) {
        try {
          context.principal = await this.auth.verifyAccessToken(context.accessToken);
        } catch {
          context.socket.close(WS_CLOSE.AUTHENTICATION_EXPIRED, "access token expired");
          continue;
        }
      }
      // 上一轮 ping 未被应答，或应用层超时 ⇒ 半开连接；terminate 直接断 TCP，不走关闭握手。
      if (!context.protocolAlive || now - context.lastSeenAt > CLIENT_STALE_AFTER_MS) {
        context.socket.terminate();
        continue;
      }
      context.protocolAlive = false;
      context.socket.ping();
    }
  }
}
