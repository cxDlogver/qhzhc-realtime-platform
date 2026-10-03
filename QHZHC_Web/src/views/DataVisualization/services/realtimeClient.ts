import { accessTokenManager } from "@/services/accessToken";
import { handleUnauthenticated } from "@/utils/request";
import { FrameTelemetryQueue } from "./FrameTelemetryQueue";
import {
  AdaptiveRenderController,
  type AdaptiveRenderDecision,
} from "./AdaptiveRenderController";
import {
  REALTIME_CLOSE_CODE,
  resolveRealtimeRecoveryAction,
} from "./realtimeConnectionPolicy";
import {
  toLegacyPoint,
  type DeliveryPointLimit,
  type ServerMessage,
  type TelemetryPoint,
} from "./realtimeTypes";

export type RealtimeStatus =
  | "connected"
  | "no-data"
  | "disconnected"
  | "auth-recovering"
  | "error"
  | "invalid-packet";

export interface RenderPerformanceSample {
  nowMs: number;
  actualFps: number;
  baselineFps: number;
  renderP95Ms: number;
  frameIntervalMs: number;
}

export interface RealtimeRuntimeStats {
  pending: number;
  oldestPendingMs: number;
  arrivalRate: number;
  consumeRate: number;
  totalReceived: number;
  totalConsumed: number;
  batchSize: number;
  safeBatchSize: number;
  requiredBatchSize: number;
  queueSlope: number;
  overloaded: boolean;
  requestedPointLimit: DeliveryPointLimit;
  effectivePointLimit: DeliveryPointLimit;
  mode: "auto" | "manual";
  reason: string;
}

interface RealtimeClientOptions {
  url: string;
  onPacket: (packet: { code: number; message: string; data: unknown[] }) => void;
  onStatus: (status: RealtimeStatus) => void;
  /** 首次应接收的自然秒起点；最近五分钟无数据时传下一个自然秒。 */
  initialBucketStartMs?: number;
  /** 0 表示接收该自然秒内的全部点。 */
  maxPointsPerSecond?: DeliveryPointLimit;
  /** 每帧最多交给渲染层的点数，默认 1。 */
  maxPerFrame?: number;
  /** 默认启用自适应批量；false 用于固定批量 A/B。 */
  adaptiveRendering?: boolean;
  onAdaptiveDecision?: (decision: AdaptiveRenderDecision) => void;
  WebSocketImpl?: typeof WebSocket;
  random?: () => number;
  getAccessToken?: () => string | null;
  refreshAccessToken?: () => Promise<string>;
  onAuthenticationFailure?: () => void | Promise<void>;
}

const PROTOCOL_VERSION = 2;
const ROBOT_ID = "QH-ZHC-01";
const SECOND_MS = 1_000;
const BUCKET_TIMEOUT_MS = 3_000;
const ALLOWED_POINT_LIMITS: DeliveryPointLimit[] = [0, 1, 2, 5, 10, 20];

function nextNaturalSecond(now = Date.now()): number {
  return Math.floor(now / SECOND_MS) * SECOND_MS + SECOND_MS;
}

function normalizeBucketStart(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || (value as number) % SECOND_MS !== 0) {
    return nextNaturalSecond();
  }
  return value as number;
}

/**
 * 按自然秒记录最新接收时间，收到的数据直接追加到帧队列。接收与渲染互不等待，
 * 客户端不发送应用层 ACK。
 */
export default class RealtimeClient {
  private socket: WebSocket | null = null;
  private stopped = true;
  private attempt = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private bucketWatchdogTimer: number | null = null;
  private heartbeatIntervalMs = 8_000;
  private lastSeenAt = 0;
  private lastBucketSeenAt = 0;
  /** 已接收数据的最新自然秒起点；空批次也会更新。 */
  private latestBatchStartMs: number;
  /** 帧队列中下一次需要渲染的数据点；队列为空时为 null。 */
  private nextRenderPoint: TelemetryPoint | null = null;
  private recoveringGap = false;
  private lastBucketStatus: "live" | "no-data" = "no-data";
  private maxPointsPerSecond: DeliveryPointLimit;
  private desiredPointsPerSecond: DeliveryPointLimit;
  /** 每帧交给渲染层的点数；纯客户端参数，可在运行时调整。 */
  private maxPerFrame: number;
  private adaptiveRendering: boolean;
  private readonly adaptiveController: AdaptiveRenderController;
  private lastDecision: AdaptiveRenderDecision;
  private rateWindowStartedAt = 0;
  private rateWindowReceived = 0;
  private rateWindowConsumed = 0;
  private arrivalRate = 0;
  private consumeRate = 0;
  private totalReceived = 0;
  private readonly frameQueue: FrameTelemetryQueue;
  private readonly WebSocketImpl: typeof WebSocket;
  private readonly random: () => number;
  private readonly getAccessToken: () => string | null;
  private readonly refreshAccessToken: () => Promise<string>;
  private readonly onAuthenticationFailure: () => void | Promise<void>;

  constructor(private readonly options: RealtimeClientOptions) {
    this.latestBatchStartMs = normalizeBucketStart(options.initialBucketStartMs) - SECOND_MS;
    this.maxPointsPerSecond = ALLOWED_POINT_LIMITS.includes(
      options.maxPointsPerSecond as DeliveryPointLimit,
    )
      ? (options.maxPointsPerSecond as DeliveryPointLimit)
      : 0;
    this.desiredPointsPerSecond = this.maxPointsPerSecond;
    this.WebSocketImpl = options.WebSocketImpl || WebSocket;
    this.random = options.random || Math.random;
    this.getAccessToken =
      options.getAccessToken || (() => accessTokenManager.getAccessToken());
    this.refreshAccessToken =
      options.refreshAccessToken ||
      (() => accessTokenManager.refreshAccessToken());
    this.onAuthenticationFailure =
      options.onAuthenticationFailure || handleUnauthenticated;
    this.maxPerFrame = Math.max(1, Math.floor(options.maxPerFrame ?? 1));
    this.adaptiveRendering = options.adaptiveRendering !== false;
    this.adaptiveController = new AdaptiveRenderController(
      this.maxPerFrame,
      this.desiredPointsPerSecond,
    );
    if (!this.adaptiveRendering) {
      this.adaptiveController.setManualBatch(this.maxPerFrame);
    }
    this.lastDecision = {
      mode: this.adaptiveRendering ? "auto" : "manual",
      batchSize: this.maxPerFrame,
      safeBatchSize: this.maxPerFrame,
      requiredBatchSize: this.maxPerFrame,
      frameBudgetMs: 1000 / 120,
      queueSlope: 0,
      overloaded: false,
      requestedPointLimit: null,
      reason: "initial",
    };
    this.frameQueue = new FrameTelemetryQueue(
      (points) => this.publishFrame(points),
      this.maxPerFrame,
      5,
    );
  }

  /** 幂等启动：注册联网与可见性监听后建立连接；重复调用无副作用。 */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.connect();
  }

  /** 彻底停止：清定时器、清空帧队列、注销监听并关闭连接，之后不再自动重连。 */
  stop(): void {
    this.stopped = true;
    this.clearReconnect();
    this.clearHeartbeat();
    this.clearBucketWatchdog();
    this.frameQueue.stop();
    window.removeEventListener("online", this.handleOnline);
    window.removeEventListener("offline", this.handleOffline);
    document.removeEventListener("visibilitychange", this.handleVisibility);
    const socket = this.socket;
    this.socket = null;
    // readyState < CLOSING 才需要关闭，避免对已在关闭/已关闭的 socket 重复 close。
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close(REALTIME_CLOSE_CODE.NORMAL, "page leave");
    }
  }

  /** 帧队列中尚未交给渲染层的点数，供界面展示当前积压量。 */
  pendingCount(): number {
    return this.stopped ? 0 : this.frameQueue.pending();
  }

  runtimeStats(nowMs = performance.now()): RealtimeRuntimeStats {
    this.updateRateWindow(nowMs);
    const counters = this.frameQueue.counters();
    return {
      pending: this.stopped ? 0 : this.frameQueue.pending(),
      oldestPendingMs: this.stopped ? 0 : this.frameQueue.oldestPendingMs(),
      arrivalRate: this.arrivalRate,
      consumeRate: this.consumeRate,
      totalReceived: this.totalReceived,
      totalConsumed: counters.consumed,
      batchSize: this.maxPerFrame,
      safeBatchSize: this.lastDecision.safeBatchSize,
      requiredBatchSize: this.lastDecision.requiredBatchSize,
      queueSlope: this.lastDecision.queueSlope,
      overloaded: this.lastDecision.overloaded,
      requestedPointLimit: this.desiredPointsPerSecond,
      effectivePointLimit: this.maxPointsPerSecond,
      mode: this.adaptiveRendering ? "auto" : "manual",
      reason: this.lastDecision.reason,
    };
  }

  setAdaptiveRendering(enabled: boolean): void {
    this.adaptiveRendering = enabled;
    if (enabled) {
      this.adaptiveController.setAutoMode();
      return;
    }
    this.adaptiveController.setManualBatch(this.maxPerFrame);
  }

  reportRenderPerformance(sample: RenderPerformanceSample): void {
    if (!this.adaptiveRendering || this.stopped) return;
    this.updateRateWindow(sample.nowMs);
    const decision = this.adaptiveController.evaluate({
      ...sample,
      arrivalRate: this.arrivalRate,
      consumeRate: this.consumeRate,
      pending: this.frameQueue.pending(),
      oldestPendingMs: this.frameQueue.oldestPendingMs(),
      effectivePointLimit: this.maxPointsPerSecond,
    });
    this.lastDecision = decision;
    if (decision.batchSize !== this.maxPerFrame) {
      this.applyMaxPerFrame(decision.batchSize);
    }
    if (
      decision.requestedPointLimit !== null &&
      decision.requestedPointLimit !== this.maxPointsPerSecond
    ) {
      this.applyPointLimit(decision.requestedPointLimit);
    }
    this.options.onAdaptiveDecision?.(decision);
  }

  /**
   * 热更新每帧渲染数量。
   * 这是纯客户端参数，只影响帧队列每帧取几个点，服务端不感知，
   * 因此不需要像 setMaxPointsPerSecond 那样断开重连。
   */
  setMaxPerFrame(value: number): void {
    this.adaptiveRendering = false;
    this.adaptiveController.setManualBatch(value);
    this.applyMaxPerFrame(value);
  }

  /** 当前生效的每帧渲染数量，界面回显的唯一数据源。 */
  maxPerFrameValue(): number {
    return this.maxPerFrame;
  }

  /** 修改单连接订阅上限后重建连接，使新参数从下一次握手开始生效。 */
  setMaxPointsPerSecond(value: DeliveryPointLimit): void {
    this.desiredPointsPerSecond = value;
    this.adaptiveController.setDesiredPointLimit(value);
    this.applyPointLimit(value);
  }

  private applyPointLimit(value: DeliveryPointLimit): void {
    if (!ALLOWED_POINT_LIMITS.includes(value) || value === this.maxPointsPerSecond) {
      return;
    }
    this.maxPointsPerSecond = value;
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
      this.socket.close(REALTIME_CLOSE_CODE.PAGE_HIDDEN, "subscription changed");
    }
  }

  private applyMaxPerFrame(value: number): void {
    this.maxPerFrame = Math.max(1, Math.floor(value));
    this.frameQueue.setMaxPerFrame(this.maxPerFrame);
  }

  private updateRateWindow(nowMs: number): void {
    if (!this.rateWindowStartedAt) {
      this.rateWindowStartedAt = nowMs;
      return;
    }
    const elapsed = nowMs - this.rateWindowStartedAt;
    if (elapsed < SECOND_MS) return;
    this.arrivalRate = this.rateWindowReceived * SECOND_MS / elapsed;
    this.consumeRate = this.rateWindowConsumed * SECOND_MS / elapsed;
    this.rateWindowReceived = 0;
    this.rateWindowConsumed = 0;
    this.rateWindowStartedAt = nowMs;
  }

  /**
   * 建立连接。前置条件缺一不可：未停止、当前没有活动连接、浏览器在线、页面可见。
   * 其中「页面可见」与「在线」是刻意为之——不可见时连接会被 handleVisibility 主动关闭，
   * 这里再挡住一次是为了防止关闭与重连定时器之间产生竞争。
   */
  private connect(): void {
    if (
      this.stopped ||
      this.socket ||
      !navigator.onLine ||
      document.visibilityState === "hidden"
    ) return;
    let socket: WebSocket;
    try {
      socket = new this.WebSocketImpl(this.options.url);
    } catch {
      // 构造阶段同步抛错通常是 URL 非法，仍按普通失败走退避重连，避免直接放弃。
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket || this.stopped) return;
      this.lastSeenAt = Date.now();
      // 服务端要求 5 秒内完成 authenticate，否则会被判协议错误关闭。
      // 无令牌时主动以 4001 关闭，交给 handleClose 走刷新令牌流程。
      const accessToken = this.getAccessToken();
      if (!accessToken) {
        socket.close(
          REALTIME_CLOSE_CODE.AUTHENTICATION_EXPIRED,
          "access token missing",
        );
        return;
      }
      socket.send(JSON.stringify({
        type: "authenticate",
        accessToken,
        protocolVersion: PROTOCOL_VERSION,
        robotId: ROBOT_ID,
        resumeFromBucketStartMs: this.latestBatchStartMs + SECOND_MS,
        maxPointsPerSecond: this.maxPointsPerSecond,
      }));
    };
    socket.onmessage = (event) => {
      // 引用比对：旧连接的残余消息不得进入当前链路。
      if (this.socket !== socket || this.stopped) return;
      this.lastSeenAt = Date.now();
      this.handleMessage(event.data);
    };
    socket.onerror = () => {
      // error 不含稳定的业务语义，等待 close 统一决定恢复方式。
    };
    socket.onclose = (event) => {
      void this.handleClose(socket, event);
    };
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== "string") return;
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      this.options.onStatus("invalid-packet");
      return;
    }

    switch (message.type) {
      case "welcome":
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          this.socket?.close(
            REALTIME_CLOSE_CODE.PROTOCOL_ERROR,
            "protocol version mismatch",
          );
          return;
        }
        this.attempt = 0;
        this.heartbeatIntervalMs = message.heartbeatIntervalMs;
        this.lastBucketSeenAt = Date.now();
        this.options.onStatus("connected");
        this.startHeartbeat();
        this.startBucketWatchdog();
        return;
      case "telemetry_second":
        this.handleTelemetrySecond(message);
        return;
      case "replay_complete":
        this.recoveringGap = false;
        if (this.lastBucketStatus === "live") this.frameQueue.resume();
        this.options.onStatus(
          this.lastBucketStatus === "no-data" ? "no-data" : "connected",
        );
        return;
      case "gap":
        this.skipUnavailableGap(message.latestBucketStartMs);
        return;
      case "pong":
        return;
      case "error":
        this.options.onStatus("error");
    }
  }

  private handleTelemetrySecond(
    message: Extract<ServerMessage, { type: "telemetry_second" }>,
  ): void {
    if (
      !Number.isSafeInteger(message.bucketStartMs) ||
      message.bucketStartMs % SECOND_MS !== 0 ||
      message.bucketEndMs !== message.bucketStartMs + SECOND_MS
    ) {
      this.options.onStatus("invalid-packet");
      return;
    }
    this.lastBucketSeenAt = Date.now();
    // 补发期间普通未来批次不进入队列，统一由补发流重新发送。
    if (this.recoveringGap && !message.replay) return;
    const expectedStartMs = this.latestBatchStartMs + SECOND_MS;
    if (message.bucketStartMs < expectedStartMs) return;

    const missingBucketCount = Math.floor(
      (message.bucketStartMs - expectedStartMs) / SECOND_MS,
    );
    if (!message.replay && missingBucketCount >= 3) {
      this.recoveringGap = true;
      this.send({
        type: "resend_time_range",
        fromBucketStartMs: expectedStartMs,
      });
      return;
    }

    // 空批次也更新最新批次时间，但不会向渲染队列添加数据。
    this.latestBatchStartMs = message.bucketStartMs;
    this.lastBucketStatus = message.status;
    if (message.points.length > 0) {
      this.rateWindowReceived += message.points.length;
      this.totalReceived += message.points.length;
      this.frameQueue.enqueue(message.points);
      this.nextRenderPoint = this.frameQueue.peekNext();
    }

    // 补发点到达后立即进入队列并恢复逐帧消费；空补发桶本身不打断补发渲染。
    if (message.replay) {
      if (message.points.length > 0) {
        this.frameQueue.resume();
        this.options.onStatus("connected");
      }
      return;
    }
    if (message.status === "no-data") {
      // no-data 只表示当前自然秒没有新点，不能取消上一秒尚未完成的消费。
      // 队列为空时 schedule 本来就不会空转；仍有积压时必须继续排空。
      if (this.frameQueue.pending() > 0) {
        this.frameQueue.resume();
      }
      this.options.onStatus("no-data");
      return;
    }
    this.frameQueue.resume();
    this.options.onStatus("connected");
  }

  private publishFrame(points: TelemetryPoint[]): void {
    if (!points.length) return;
    this.rateWindowConsumed += points.length;
    this.options.onPacket({
      code: 200,
      message: "ok",
      data: points.map(toLegacyPoint),
    });
    this.nextRenderPoint = this.frameQueue.peekNext();
  }

  /** 无法补齐时保留现有渲染队列，并更新最新批次时间。 */
  private skipUnavailableGap(latestBucketStartMs: number): void {
    if (
      Number.isSafeInteger(latestBucketStartMs) &&
      latestBucketStartMs >= this.latestBatchStartMs
    ) {
      this.latestBatchStartMs = latestBucketStartMs;
    }
    this.recoveringGap = false;
    this.frameQueue.resume();
  }

  /**
   * 连接关闭的唯一恢复入口（含服务端主动断开、心跳超时、网络异常与页面隐藏）。
   * 恢复策略由关闭码决定，见 realtimeConnectionPolicy。
   */
  private async handleClose(socket: WebSocket, event: CloseEvent): Promise<void> {
    // 已被新连接替换的旧 socket 关闭时要忽略，否则会误删新连接并触发多余重连。
    if (this.socket !== socket) return;
    this.socket = null;
    this.clearHeartbeat();
    this.clearBucketWatchdog();
    // 断线和无数据都暂停渲染，但保留队列，恢复后继续从队首消费。
    this.frameQueue.pause();
    // 用户主动 stop（页面离开）后不再做任何恢复动作。
    if (this.stopped) return;

    const recoveryAction = resolveRealtimeRecoveryAction(event.code);
    switch (recoveryAction) {
      case "refresh-token": {
        // 4001：access token 过期。先刷新令牌，成功则清零退避立即重连。
        this.options.onStatus("auth-recovering");
        try {
          await this.refreshAccessToken();
          if (!this.stopped) {
            this.attempt = 0;
            this.connect();
          }
        } catch (_error) {
          // 刷新失败说明登录态已失效，停止重连并交由上层跳转登录。
          this.stopped = true;
          this.options.onStatus("error");
          await this.onAuthenticationFailure();
        }
        return;
      }
      case "stop":
        // 无权限（4003）或协议错误（4100）属于不可恢复，重试只会得到同样结果。
        this.stopped = true;
        this.options.onStatus("error");
        return;
      case "reconnect":
        this.options.onStatus("disconnected");
        this.scheduleReconnect();
        return;
    }
  }

  /**
   * 启动心跳。周期取自服务端 welcome 下发值；先清理旧定时器，因此可安全重复调用。
   * 判活依据是「收到过任意消息」而非「收到过 pong」——服务端持续推流时无需 pong 也算存活。
   */
  private startHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      // 连续 3 个周期毫无响应，说明连接已死（TCP 半开时浏览器不会主动通知），
      // 主动关闭并交给 handleClose 走重连流程。
      if (Date.now() - this.lastSeenAt > this.heartbeatIntervalMs * 3) {
        this.socket.close(
          REALTIME_CLOSE_CODE.HEARTBEAT_TIMEOUT,
          "heartbeat timeout",
        );
        return;
      }
      const now = Date.now();
      this.send({ type: "ping", nonce: String(now), sentAt: now });
    }, this.heartbeatIntervalMs);
  }

  /** 连续三秒收不到按秒发送的数据属于链路异常；空批次同样会刷新此判据。 */
  private startBucketWatchdog(): void {
    this.clearBucketWatchdog();
    this.bucketWatchdogTimer = window.setInterval(() => {
      if (
        !this.socket ||
        this.socket.readyState !== WebSocket.OPEN ||
        Date.now() - this.lastBucketSeenAt < BUCKET_TIMEOUT_MS
      ) return;
      this.frameQueue.pause();
      this.options.onStatus("disconnected");
      this.socket.close(
        REALTIME_CLOSE_CODE.HEARTBEAT_TIMEOUT,
        "telemetry bucket timeout",
      );
    }, SECOND_MS);
  }

  /**
   * 退避重连：延迟 = min(15s, 500ms × 2^attempt) 再乘以 [0,1) 随机数，最短 250ms。
   * 乘随机数是为了产生抖动，避免服务端重启后所有客户端在同一时刻集中重连。
   */
  private scheduleReconnect(): void {
    if (
      this.stopped ||
      this.reconnectTimer !== null ||
      !navigator.onLine ||
      document.visibilityState === "hidden"
    ) return;
    // attempt 取 6 封顶，既避免指数过大，也保证 500ms × 2^6 = 32s 被 15s 上限截断。
    const ceiling = Math.min(15_000, 500 * 2 ** Math.min(this.attempt, 6));
    const delay = Math.max(250, Math.round(ceiling * this.random()));
    this.attempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(message: object): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearHeartbeat(): void {
    if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private clearBucketWatchdog(): void {
    if (this.bucketWatchdogTimer !== null) {
      window.clearInterval(this.bucketWatchdogTimer);
    }
    this.bucketWatchdogTimer = null;
  }

  /** 网络恢复：取消待执行的重连定时器后立即连接，避免与退避定时器形成两个连接。 */
  private readonly handleOnline = (): void => {
    this.clearReconnect();
    this.connect();
  };

  private readonly handleOffline = (): void => {
    this.clearReconnect();
    this.frameQueue.pause();
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close();
    this.options.onStatus("disconnected");
  };

  /**
   * 页面隐藏时主动断开（浏览器会冻结后台标签页的定时器与 rAF，维持连接没有意义且会积压数据）；
   * 重新可见时再连接，隐藏期间缺失的数据从下一批期望时间开始恢复。
   */
  private readonly handleVisibility = (): void => {
    if (this.stopped) return;
    if (document.visibilityState === "hidden") {
      this.clearReconnect();
      this.frameQueue.pause();
      if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
        // 用 4002 明确表达「主动让路」，避免被当作异常断线触发无用告警。
        this.socket.close(REALTIME_CLOSE_CODE.PAGE_HIDDEN, "page hidden");
      }
      return;
    }
    if (!this.socket) {
      this.clearReconnect();
      this.connect();
    }
  };
}
