import { createServer, type Server } from "node:http";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/server/app.js";
import { AuthService } from "../src/server/auth.js";
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

  beforeEach(async () => {
    database = new AppDatabase(":memory:", 10_000);
    const auth = new AuthService(database, {
      accessTokenTtlMs: 60_000,
      refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
      jwtSecret: "test-secret-with-at-least-thirty-two-bytes",
    });
    token = (await auth.login("admin", "Admin@123456")).accessToken;
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
