import { EventEmitter } from "node:events";
import type { Server } from "node:http";
import { setImmediate as nextTurn } from "node:timers/promises";
import { setTimeout as realTimeout, clearTimeout as clearRealTimeout } from "node:timers";
import { decodeJwt } from "jose";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService, type AuthPrincipal, type TokenPair } from "../src/server/auth.js";
import { AppDatabase } from "../src/server/database.js";
import { RobotSocketHub } from "../src/server/robot-socket-hub.js";
import { TelemetryStreamService } from "../src/server/telemetry-stream.js";

const NOW = 1_700_000_000_123;
const MAX_TIMEOUT_MS = 2_147_483_647;

// 模拟传输边界；真实鉴权、数据库、Hub 和计时器仍使用生产实现。
class TestSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  send = vi.fn((raw: string) => this.emit("sent", raw));
  ping = vi.fn(() => this.emit("pong"));
  close = vi.fn((code: number, reason: string) => {
    this.readyState = WebSocket.CLOSING;
    this.emit("closing", code, reason);
  });
  terminate = vi.fn(() => this.remoteClose());

  remoteClose(): void {
    this.readyState = WebSocket.CLOSED;
    this.emit("close");
  }

  message(value: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(value)));
  }
}

describe("socket authentication lifecycle", () => {
  let database: AppDatabase;
  let auth: AuthService;
  let stream: TelemetryStreamService;
  let hub: RobotSocketHub;
  let tokens: TokenPair;
  let sockets: TestSocket[];

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    sockets = [];
    database = new AppDatabase(":memory:");
    auth = new AuthService(database, {
      accessTokenTtlMs: 60_000,
      refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1_000,
      jwtSecret: "test-secret-with-at-least-thirty-two-bytes",
    });
    tokens = await auth.login("admin", "Admin@123456");
    stream = new TelemetryStreamService(database);
    hub = new RobotSocketHub(new EventEmitter() as Server, auth, stream);
  });

  afterEach(() => {
    hub.close();
    for (const socket of sockets) socket.remoteClose();
    stream.close();
    database.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function accept(): TestSocket {
    const socket = new TestSocket();
    sockets.push(socket);
    // 仅从传输 accept 边界注入，后续事件走真实生命周期。
    (hub as unknown as { accept(socket: WebSocket, robotId: string): void })
      .accept(socket as unknown as WebSocket, "QH-ZHC-01");
    return socket;
  }

  function authenticate(socket: TestSocket, accessToken = tokens.accessToken): void {
    socket.message({
      type: "authenticate", accessToken, protocolVersion: 2,
      robotId: "QH-ZHC-01", resumeFromBucketStartMs: NOW - 123, maxPointsPerSecond: 0,
    });
  }

  async function settle(): Promise<void> {
    // WebCrypto 签名验证会跨事件循环，不只跨 Promise 微任务。
    for (let count = 0; count < 5; count += 1) await nextTurn();
  }

  async function connected(accessToken = tokens.accessToken): Promise<TestSocket> {
    const socket = accept();
    await new Promise<void>((resolve, reject) => {
      const timeout = realTimeout(() => reject(new Error("authentication did not complete")), 1_000);
      socket.once("sent", () => { clearRealTimeout(timeout); resolve(); });
      socket.once("closing", (code, reason) => {
        clearRealTimeout(timeout);
        reject(new Error(`authentication closed: ${code} ${reason}`));
      });
      authenticate(socket, accessToken);
    });
    expect(socket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"welcome"'));
    return socket;
  }

  it("uses JWT exp in milliseconds and closes at the deadline before the next heartbeat", async () => {
    const socket = await connected();
    const deadline = Number(decodeJwt(tokens.accessToken).exp) * 1_000;
    expect(deadline).toBe(NOW - 123 + 60_000);
    await vi.advanceTimersByTimeAsync(deadline - NOW - 1);
    expect(socket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.close).toHaveBeenCalledExactlyOnceWith(4001, "ACCESS_TOKEN_EXPIRED");
  });

  it("keeps heartbeats without repeating JWT verification or database queries", async () => {
    const verify = vi.spyOn(auth, "verifyAccessToken");
    const familyLookup = vi.spyOn(database, "activeTokenFamilyExpiresAt");
    const userLookup = vi.spyOn(database, "findUserById");
    const socket = await connected();
    expect(verify).toHaveBeenCalledTimes(1);
    familyLookup.mockClear();
    userLookup.mockClear();
    await vi.advanceTimersByTimeAsync(24_000);
    socket.message({ type: "ping", nonce: "alive", sentAt: Date.now() });
    await settle();
    hub.publish({ bucketStartMs: NOW, bucketEndMs: NOW + 1_000, status: "no-data", points: [] });
    expect(socket.ping).toHaveBeenCalledTimes(3);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(familyLookup).not.toHaveBeenCalled();
    expect(userLookup).not.toHaveBeenCalled();
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("still terminates a half-open connection that stops answering protocol pings", async () => {
    const socket = await connected();
    socket.ping.mockImplementation(() => false);
    await vi.advanceTimersByTimeAsync(16_000);
    expect(socket.terminate).toHaveBeenCalledTimes(1);
    expect(hub.connectionCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("closes every connection of a revoked family without affecting another login", async () => {
    const other = await auth.login("admin", "Admin@123456");
    const first = await connected();
    const second = await connected();
    const unrelated = await connected(other.accessToken);
    auth.revokeFamily(tokens.familyId);
    for (const socket of [first, second]) {
      expect(socket.close).toHaveBeenCalledExactlyOnceWith(4001, "TOKEN_FAMILY_REVOKED");
    }
    expect(unrelated.close).not.toHaveBeenCalled();
  });

  it("preserves old connections on normal rotation but closes them on refresh reuse", async () => {
    const socket = await connected();
    const rotated = await auth.refresh(tokens.refreshToken);
    expect(socket.close).not.toHaveBeenCalled();
    const nextSocket = await connected(rotated.accessToken);
    await expect(auth.refresh(tokens.refreshToken)).rejects.toMatchObject({ code: "REFRESH_TOKEN_REUSED" });
    expect(socket.close).toHaveBeenCalledWith(4001, "TOKEN_FAMILY_REVOKED");
    expect(nextSocket.close).toHaveBeenCalledWith(4001, "TOKEN_FAMILY_REVOKED");
  });

  it("expires at the absolute family deadline when it precedes JWT exp", async () => {
    const shortAuth = new AuthService(database, {
      accessTokenTtlMs: 60_000, refreshTokenTtlMs: 2_000,
      jwtSecret: "test-secret-with-at-least-thirty-two-bytes",
    });
    const shortTokens = await shortAuth.login("admin", "Admin@123456");
    const socket = await connected(shortTokens.accessToken);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(socket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.close).toHaveBeenCalledExactlyOnceWith(4001, "TOKEN_FAMILY_REVOKED");
  });

  it.each(["expired", "revoked", "closed"])("rejects authentication that became %s during await", async (change) => {
    const principal = await auth.verifyAccessToken(tokens.accessToken);
    let resolveVerification!: (value: AuthPrincipal) => void;
    vi.spyOn(auth, "verifyAccessToken").mockReturnValue(new Promise((resolve) => {
      resolveVerification = resolve;
    }));
    const socket = accept();
    authenticate(socket);
    if (change === "expired") vi.setSystemTime(principal.accessTokenExpiresAt);
    if (change === "revoked") auth.revokeFamily(tokens.familyId);
    if (change === "closed") socket.remoteClose();
    resolveVerification(principal);
    await settle();
    expect(socket.send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    if (change !== "closed") {
      expect(socket.close).toHaveBeenCalledExactlyOnceWith(
        4001, change === "expired" ? "ACCESS_TOKEN_EXPIRED" : "TOKEN_FAMILY_REVOKED",
      );
    }
  });

  it.each(["incoming", "outgoing"])("blocks %s messages if the expiry callback is delayed", async (direction) => {
    const socket = await connected();
    socket.send.mockClear();
    // 移动时钟但不执行计时器，模拟事件循环未及时执行到期回调。
    vi.setSystemTime(Number(decodeJwt(tokens.accessToken).exp) * 1_000);
    if (direction === "incoming") {
      socket.message({ type: "resend_time_range", fromBucketStartMs: NOW - 123 });
      await settle();
    } else {
      hub.publish({ bucketStartMs: NOW, bucketEndMs: NOW + 1_000, status: "no-data", points: [] });
    }
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledExactlyOnceWith(4001, "ACCESS_TOKEN_EXPIRED");
  });

  it("clears an old connection's timer and independently schedules its replacement", async () => {
    const first = await connected();
    expect(vi.getTimerCount()).toBe(2);
    first.remoteClose();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    const rotated = await auth.refresh(tokens.refreshToken);
    const next = await connected(rotated.accessToken);
    await vi.advanceTimersByTimeAsync(58_877);
    expect(first.close).not.toHaveBeenCalled();
    expect(next.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(next.close).toHaveBeenCalledExactlyOnceWith(4001, "ACCESS_TOKEN_EXPIRED");
  });

  it("cleans timers and revocation subscription during shutdown", async () => {
    const socket = await connected();
    hub.close();
    expect(vi.getTimerCount()).toBe(0);
    // 即使关闭握手尚未结束，也不能残留撤销监听或到期任务。
    socket.readyState = WebSocket.OPEN;
    auth.revokeFamily(tokens.familyId);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(socket.close).toHaveBeenCalledExactlyOnceWith(1000, "服务关闭");
  });

  it("segments long lifetimes without overflowing Node's timeout limit", async () => {
    hub.close();
    const interval = globalThis.setInterval;
    // 此例只验证到期排期，避免执行数十万次心跳；心跳行为由独立测试覆盖。
    vi.spyOn(globalThis, "setInterval").mockImplementationOnce(() => interval(() => {}, MAX_TIMEOUT_MS));
    hub = new RobotSocketHub(new EventEmitter() as Server, auth, stream);
    const longAuth = new AuthService(database, {
      accessTokenTtlMs: MAX_TIMEOUT_MS + 10_000,
      refreshTokenTtlMs: MAX_TIMEOUT_MS + 20_000,
      jwtSecret: "test-secret-with-at-least-thirty-two-bytes",
    });
    const longTokens = await longAuth.login("admin", "Admin@123456");
    const deadline = Number(decodeJwt(longTokens.accessToken).exp) * 1_000;
    const socket = await connected(longTokens.accessToken);
    await vi.advanceTimersByTimeAsync(MAX_TIMEOUT_MS);
    expect(socket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(deadline - Date.now() - 1);
    expect(socket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.close).toHaveBeenCalledExactlyOnceWith(4001, "ACCESS_TOKEN_EXPIRED");
  });
});
