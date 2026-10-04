import { createServer, type Server } from "node:http";
import { decodeJwt, SignJWT } from "jose";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { AuthService, type TokenPair } from "../src/server/auth.js";
import { AppDatabase } from "../src/server/database.js";
import { createTelemetryPoint } from "../src/server/point-factory.js";
import { RobotSocketHub } from "../src/server/robot-socket-hub.js";
import { TelemetrySimulator } from "../src/server/simulator.js";
import { TelemetryStreamService } from "../src/server/telemetry-stream.js";
import { PROTOCOL_VERSION, type ServerMessage } from "../src/shared/index.js";

const BUCKET_START_MS = 1_700_000_000_000;

describe("RobotSocket WebSocket resume", () => {
  let database: AppDatabase;
  let simulator: TelemetrySimulator;
  let telemetryStream: TelemetryStreamService;
  let server: Server;
  let hub: RobotSocketHub;
  let port: number;
  let token: string;
  let auth: AuthService;
  let login: TokenPair;

  beforeEach(async () => {
    database = new AppDatabase(":memory:", 10_000);
    auth = new AuthService(database, {
      accessTokenTtlMs: 60_000,
      refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
      jwtSecret: "test-secret-with-at-least-thirty-two-bytes",
    });
    login = await auth.login("admin", "Admin@123456");
    token = login.accessToken;
    simulator = new TelemetrySimulator(database);
    telemetryStream = new TelemetryStreamService(database);
    const app = createApp({
      database,
      auth,
      simulator,
      connectionCount: () => hub?.connectionCount() ?? 0,
      disconnectClients: () => hub.disconnectAll(),
    });
    server = createServer(app);
    hub = new RobotSocketHub(server, auth, telemetryStream);
    telemetryStream.setPublisher((bucket) => hub.publish(bucket));
    database.insertTelemetry([
      createTelemetryPoint(0, BUCKET_START_MS, "QH-ZHC-01", "route"),
      createTelemetryPoint(1, BUCKET_START_MS + 200, "QH-ZHC-01", "route"),
      createTelemetryPoint(2, BUCKET_START_MS + 400, "QH-ZHC-01", "route"),
    ]);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test port");
    port = address.port;
  });

  afterEach(async () => {
    telemetryStream.close();
    simulator.close();
    hub.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    database.close();
  });

  async function connectAuthenticated(accessToken = token): Promise<WebSocket> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/robots/QH-ZHC-01`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.terminate();
        reject(new Error("authentication timeout"));
      }, 2_000);
      socket.on("open", () => socket.send(JSON.stringify({
        type: "authenticate", accessToken, protocolVersion: PROTOCOL_VERSION,
        robotId: "QH-ZHC-01", resumeFromBucketStartMs: BUCKET_START_MS + 1_000,
        maxPointsPerSecond: 0,
      })));
      socket.on("message", (raw) => {
        if (JSON.parse(raw.toString()).type === "welcome") {
          clearTimeout(timeout);
          resolve();
        }
      });
      socket.on("error", (error) => { clearTimeout(timeout); reject(error); });
      socket.on("close", (code) => { clearTimeout(timeout); reject(new Error(`closed before welcome: ${code}`)); });
    });
    return socket;
  }

  function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("expected socket close")), 4_000);
      socket.once("close", (code, reason) => {
        clearTimeout(timeout);
        resolve({ code, reason: reason.toString() });
      });
    });
  }

  it("delivers a 4001 close frame at JWT expiry and accepts a refreshed connection", async () => {
    const expiresAt = (Math.floor(Date.now() / 1_000) + 2) * 1_000;
    const shortToken = await new SignJWT(decodeJwt(token))
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expiresAt / 1_000)
      .sign(new TextEncoder().encode("test-secret-with-at-least-thirty-two-bytes"));
    const socket = await connectAuthenticated(shortToken);
    const closed = await waitForClose(socket);
    expect(closed).toEqual({ code: 4001, reason: "ACCESS_TOKEN_EXPIRED" });
    expect(Date.now()).toBeGreaterThanOrEqual(expiresAt);
    // 四秒超时已保证不用等待八秒心跳。
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/refresh`, {
      method: "POST", headers: { Cookie: `qhzhc_refresh=${login.refreshToken}` },
    });
    expect(response.status).toBe(200);
    const refreshed = await response.json() as { accessToken: string };
    const replacement = await connectAuthenticated(refreshed.accessToken);
    expect(replacement.readyState).toBe(WebSocket.OPEN);
    replacement.terminate();
  });

  it("HTTP logout immediately closes all family sockets but preserves another session", async () => {
    const otherLogin = await auth.login("admin", "Admin@123456");
    const first = await connectAuthenticated();
    const second = await connectAuthenticated();
    const unrelated = await connectAuthenticated(otherLogin.accessToken);
    const firstClosed = waitForClose(first);
    const secondClosed = waitForClose(second);
    const response = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(204);
    expect(await firstClosed).toEqual({ code: 4001, reason: "TOKEN_FAMILY_REVOKED" });
    expect(await secondClosed).toEqual({ code: 4001, reason: "TOKEN_FAMILY_REVOKED" });
    expect(unrelated.readyState).toBe(WebSocket.OPEN);
    unrelated.terminate();
  });

  it("replays one stored natural-second bucket from the requested time cursor", async () => {
    const messages: ServerMessage[] = [];
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/robots/QH-ZHC-01`);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("websocket replay timeout")), 2_000);
      socket.on("open", () => {
        socket.send(JSON.stringify({
          type: "authenticate",
          accessToken: token,
          protocolVersion: PROTOCOL_VERSION,
          robotId: "QH-ZHC-01",
          resumeFromBucketStartMs: BUCKET_START_MS,
          maxPointsPerSecond: 0,
        }));
      });
      socket.on("message", (raw) => {
        messages.push(JSON.parse(raw.toString()) as ServerMessage);
        if (messages.some((message) => message.type === "replay_complete")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      socket.on("error", reject);
    });
    const welcome = messages.find((message) => message.type === "welcome");
    const points = messages
      .filter((message): message is Extract<ServerMessage, { type: "telemetry_second" }> => message.type === "telemetry_second")
      .flatMap((message) => message.points.map((point) => point.sequence));
    expect(welcome).toMatchObject({
      latestBucketStartMs: BUCKET_START_MS,
      resumedFromBucketStartMs: BUCKET_START_MS,
    });
    expect(points).toEqual([1, 2, 3]);
    socket.terminate();
  });

  it("broadcasts one sealed second bucket to an initialized client", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/robots/QH-ZHC-01`);
    const liveSequences = await new Promise<number[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("live broadcast timeout")), 2_000);
      socket.on("open", () => {
        socket.send(JSON.stringify({
          type: "authenticate",
          accessToken: token,
          protocolVersion: PROTOCOL_VERSION,
          robotId: "QH-ZHC-01",
          resumeFromBucketStartMs: BUCKET_START_MS + 1_000,
          maxPointsPerSecond: 2,
        }));
      });
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString()) as ServerMessage;
        if (message.type === "welcome") {
          hub.publish({
            bucketStartMs: BUCKET_START_MS + 1_000,
            bucketEndMs: BUCKET_START_MS + 2_000,
            status: "live",
            points: [
              createTelemetryPoint(3, BUCKET_START_MS + 1_000, "QH-ZHC-01", "route"),
              createTelemetryPoint(4, BUCKET_START_MS + 1_300, "QH-ZHC-01", "route"),
              createTelemetryPoint(5, BUCKET_START_MS + 1_600, "QH-ZHC-01", "route"),
            ],
          });
        }
        if (message.type === "telemetry_second" && !message.replay) {
          clearTimeout(timeout);
          resolve(message.points.map((point) => point.sequence));
        }
      });
      socket.on("error", reject);
    });
    expect(liveSequences).toHaveLength(2);
    socket.terminate();
  });

  it("accepts the upgrade but rejects a non-authentication first message", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/robots/QH-ZHC-01`);
    const code = await new Promise<number>((resolve, reject) => {
      socket.on("open", () => {
        socket.send(JSON.stringify({ type: "ping", nonce: "early", sentAt: Date.now() }));
      });
      socket.on("close", resolve);
      socket.on("error", reject);
    });
    expect(code).toBe(4100);
  });

  it("closes with 4001 when the first message carries an invalid access token", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/robots/QH-ZHC-01`);
    const code = await new Promise<number>((resolve, reject) => {
      socket.on("open", () => {
        socket.send(JSON.stringify({
          type: "authenticate",
          accessToken: "invalid.jwt.token",
          protocolVersion: PROTOCOL_VERSION,
          robotId: "QH-ZHC-01",
          resumeFromBucketStartMs: BUCKET_START_MS,
          maxPointsPerSecond: 0,
        }));
      });
      socket.on("close", resolve);
      socket.on("error", reject);
    });
    expect(code).toBe(4001);
  });
});
