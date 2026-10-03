import RealtimeClient from "@/views/DataVisualization/services/realtimeClient";
import { REALTIME_CLOSE_CODE } from "@/views/DataVisualization/services/realtimeConnectionPolicy";

class MockSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.CONNECTING;
    this.send = jest.fn();
    this.close = jest.fn(() => {
      this.readyState = WebSocket.CLOSED;
    });
    MockSocket.instances.push(this);
  }

  open() {
    this.readyState = WebSocket.OPEN;
    this.onopen?.();
  }

  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  serverClose(code, reason = "") {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

const BUCKET_START_MS = 1_700_000_000_000;

function telemetryPoint(sequence, sampledAt = BUCKET_START_MS + sequence) {
  return {
    sequence,
    robotId: "QH-ZHC-01",
    sampledAt: new Date(sampledAt).toISOString(),
    longitude: 104.81,
    latitude: 28.16,
    altitude: 120,
    speed: 12,
    heading: 90,
    priCo2: 420,
    priCh4: 2,
    priC2h6: 0.1,
    priCo: 0.2,
    priN2o: 0.3,
    priH2o: 1,
    picarroCh4: 2,
    picarroCo2: 420,
    picarroH2o: 1,
    windSpeed: 3,
    windDirection: 110,
    temperature: 24,
    humidity: 50,
    pressure: 1010,
  };
}

describe("RealtimeClient", () => {
  let frameCallbacks;
  let originalRequestAnimationFrame;
  let originalCancelAnimationFrame;

  beforeEach(() => {
    jest.useFakeTimers();
    MockSocket.instances = [];
    frameCallbacks = [];
    originalRequestAnimationFrame = window.requestAnimationFrame;
    originalCancelAnimationFrame = window.cancelAnimationFrame;
    window.requestAnimationFrame = jest.fn((callback) => {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    });
    window.cancelAnimationFrame = jest.fn();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    sessionStorage.clear();
  });

  test("start is idempotent and sends an explicit resume handshake", () => {
    const onStatus = jest.fn();
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      initialBucketStartMs: BUCKET_START_MS,
      maxPointsPerSecond: 2,
      getAccessToken: () => "access.jwt",
      refreshAccessToken: jest.fn(),
      onPacket: jest.fn(),
      onStatus,
    });

    client.start();
    client.start();
    const socket = MockSocket.instances[0];
    socket.open();

    expect(MockSocket.instances).toHaveLength(1);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({
      type: "authenticate",
      accessToken: "access.jwt",
      protocolVersion: 2,
      robotId: "QH-ZHC-01",
      resumeFromBucketStartMs: BUCKET_START_MS,
      maxPointsPerSecond: 2,
    }));

    socket.receive({
      type: "welcome",
      protocolVersion: 2,
      connectionId: "test",
      heartbeatIntervalMs: 8000,
      latestBucketStartMs: null,
      resumedFromBucketStartMs: BUCKET_START_MS,
    });
    expect(onStatus).toHaveBeenCalledWith("connected");

    client.stop();
    expect(socket.close).toHaveBeenCalledWith(REALTIME_CLOSE_CODE.NORMAL, "page leave");
  });

  test("appends ordered points and renders one point per frame without ACK", () => {
    const onPacket = jest.fn();
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      initialBucketStartMs: BUCKET_START_MS,
      getAccessToken: () => "access.jwt",
      refreshAccessToken: jest.fn(),
      onPacket,
      onStatus: jest.fn(),
    });
    client.start();
    const socket = MockSocket.instances[0];
    socket.open();
    socket.receive({
      type: "telemetry_second",
      batchId: "bucket-1",
      bucketStartMs: BUCKET_START_MS,
      bucketEndMs: BUCKET_START_MS + 1000,
      status: "live",
      points: [telemetryPoint(2, BUCKET_START_MS + 200), telemetryPoint(3, BUCKET_START_MS + 300)],
      sentAt: BUCKET_START_MS + 1000,
      replay: false,
    });
    expect(onPacket).not.toHaveBeenCalled();
    frameCallbacks.shift()?.(0);
    frameCallbacks.shift()?.(16);

    expect(onPacket).toHaveBeenCalledTimes(2);
    expect(onPacket.mock.calls.map(([packet]) => packet.data[0].sequence)).toEqual([2, 3]);
    expect(socket.send.mock.calls.map(([raw]) => JSON.parse(raw).type)).not.toContain("ack");
    client.stop();
  });

  test("requests replay after three missing buckets and discards future live data", () => {
    const onPacket = jest.fn();
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      initialBucketStartMs: BUCKET_START_MS,
      getAccessToken: () => "access.jwt",
      refreshAccessToken: jest.fn(),
      onPacket,
      onStatus: jest.fn(),
    });

    client.start();
    const socket = MockSocket.instances[0];
    socket.open();
    socket.receive({
      type: "telemetry_second",
      batchId: "future",
      bucketStartMs: BUCKET_START_MS + 3_000,
      bucketEndMs: BUCKET_START_MS + 4_000,
      status: "live",
      points: [telemetryPoint(4, BUCKET_START_MS + 3_100)],
      sentAt: BUCKET_START_MS + 4_000,
      replay: false,
    });

    expect(onPacket).not.toHaveBeenCalled();
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({
      type: "resend_time_range",
      fromBucketStartMs: BUCKET_START_MS,
    }));

    socket.receive({
      type: "telemetry_second",
      batchId: "later-future",
      bucketStartMs: BUCKET_START_MS + 4_000,
      bucketEndMs: BUCKET_START_MS + 5_000,
      status: "live",
      points: [telemetryPoint(5, BUCKET_START_MS + 4_100)],
      sentAt: BUCKET_START_MS + 5_000,
      replay: false,
    });
    socket.receive({
      type: "telemetry_second",
      batchId: "replay",
      bucketStartMs: BUCKET_START_MS,
      bucketEndMs: BUCKET_START_MS + 1_000,
      status: "live",
      points: [telemetryPoint(1, BUCKET_START_MS + 100)],
      sentAt: Date.now(),
      replay: true,
    });
    socket.receive({ type: "replay_complete", throughBucketStartMs: BUCKET_START_MS });
    frameCallbacks.shift()?.(0);

    expect(onPacket).toHaveBeenCalledTimes(1);
    expect(onPacket.mock.calls[0][0].data.map((point) => point.sequence)).toEqual([1]);
    client.stop();
  });

  test("advances the reconnect cursor when an empty no-data bucket arrives", () => {
    const onStatus = jest.fn();
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      initialBucketStartMs: BUCKET_START_MS,
      random: () => 0,
      getAccessToken: () => "access.jwt",
      refreshAccessToken: jest.fn(),
      onPacket: jest.fn(),
      onStatus,
    });
    client.start();
    const firstSocket = MockSocket.instances[0];
    firstSocket.open();
    firstSocket.receive({
      type: "telemetry_second",
      batchId: "empty",
      bucketStartMs: BUCKET_START_MS,
      bucketEndMs: BUCKET_START_MS + 1_000,
      status: "no-data",
      points: [],
      sentAt: BUCKET_START_MS + 1_000,
      replay: false,
    });
    expect(onStatus).toHaveBeenCalledWith("no-data");

    firstSocket.serverClose(REALTIME_CLOSE_CODE.SERVICE_RESTART);
    jest.advanceTimersByTime(250);
    const secondSocket = MockSocket.instances[1];
    secondSocket.open();
    expect(secondSocket.send).toHaveBeenCalledWith(JSON.stringify({
      type: "authenticate",
      accessToken: "access.jwt",
      protocolVersion: 2,
      robotId: "QH-ZHC-01",
      resumeFromBucketStartMs: BUCKET_START_MS + 1_000,
      maxPointsPerSecond: 0,
    }));
    client.stop();
  });

  test("refreshes an expired access token before reconnecting with the same cursor", async () => {
    let accessToken = "expired.jwt";
    const refreshAccessToken = jest.fn().mockImplementation(async () => {
      accessToken = "rotated.jwt";
      return accessToken;
    });
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      initialBucketStartMs: BUCKET_START_MS,
      getAccessToken: () => accessToken,
      refreshAccessToken,
      onPacket: jest.fn(),
      onStatus: jest.fn(),
    });

    client.start();
    const firstSocket = MockSocket.instances[0];
    firstSocket.open();
    firstSocket.serverClose(
      REALTIME_CLOSE_CODE.AUTHENTICATION_EXPIRED,
      "ACCESS_TOKEN_EXPIRED",
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(MockSocket.instances).toHaveLength(2);

    const secondSocket = MockSocket.instances[1];
    secondSocket.open();
    expect(secondSocket.send).toHaveBeenCalledWith(JSON.stringify({
      type: "authenticate",
      accessToken: "rotated.jwt",
      protocolVersion: 2,
      robotId: "QH-ZHC-01",
      resumeFromBucketStartMs: BUCKET_START_MS,
      maxPointsPerSecond: 0,
    }));
    client.stop();
  });

  test("stops reconnecting and clears authentication when refresh fails", async () => {
    const onAuthenticationFailure = jest.fn();
    const onStatus = jest.fn();
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      getAccessToken: () => "expired.jwt",
      refreshAccessToken: jest.fn().mockRejectedValue(new Error("refresh expired")),
      onAuthenticationFailure,
      onPacket: jest.fn(),
      onStatus,
    });

    client.start();
    MockSocket.instances[0].open();
    MockSocket.instances[0].serverClose(
      REALTIME_CLOSE_CODE.AUTHENTICATION_EXPIRED,
      "ACCESS_TOKEN_EXPIRED",
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(onAuthenticationFailure).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledWith("auth-recovering");
    expect(onStatus).toHaveBeenCalledWith("error");
    expect(MockSocket.instances).toHaveLength(1);
  });

  test("exposes the configured max per frame", () => {
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      initialBucketStartMs: BUCKET_START_MS,
      maxPerFrame: 5,
      getAccessToken: () => "access.jwt",
      refreshAccessToken: jest.fn(),
      onPacket: jest.fn(),
      onStatus: jest.fn(),
    });
    expect(client.maxPerFrameValue()).toBe(5);
    client.stop();
  });

  test("setMaxPerFrame hot-updates without reconnecting", () => {
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      initialBucketStartMs: BUCKET_START_MS,
      maxPerFrame: 1,
      getAccessToken: () => "access.jwt",
      refreshAccessToken: jest.fn(),
      onPacket: jest.fn(),
      onStatus: jest.fn(),
    });
    client.start();
    const socket = MockSocket.instances[0];
    socket.open();
    expect(client.maxPerFrameValue()).toBe(1);

    const socketsBefore = MockSocket.instances.length;
    client.setMaxPerFrame(20);

    expect(client.maxPerFrameValue()).toBe(20);
    expect(MockSocket.instances.length).toBe(socketsBefore); // 未新建连接
    expect(socket.close).not.toHaveBeenCalled(); // 未断开重连
    client.stop();
  });

  test("pendingCount is zero before start and after stop", () => {
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      initialBucketStartMs: BUCKET_START_MS,
      getAccessToken: () => "access.jwt",
      refreshAccessToken: jest.fn(),
      onPacket: jest.fn(),
      onStatus: jest.fn(),
    });
    expect(client.pendingCount()).toBe(0);
    client.start();
    MockSocket.instances[0].open();
    client.stop();
    expect(client.pendingCount()).toBe(0);
  });

  test("runtime stats conserve received, consumed, and pending points", () => {
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      initialBucketStartMs: BUCKET_START_MS,
      adaptiveRendering: false,
      getAccessToken: () => "access.jwt",
      refreshAccessToken: jest.fn(),
      onPacket: jest.fn(),
      onStatus: jest.fn(),
    });
    client.start();
    const socket = MockSocket.instances[0];
    socket.open();
    socket.receive({
      type: "telemetry_second",
      batchId: "metrics",
      bucketStartMs: BUCKET_START_MS,
      bucketEndMs: BUCKET_START_MS + 1_000,
      status: "live",
      points: [telemetryPoint(1), telemetryPoint(2)],
      sentAt: BUCKET_START_MS + 1_000,
      replay: false,
    });

    expect(client.runtimeStats(1_000)).toEqual(
      expect.objectContaining({
        totalReceived: 2,
        totalConsumed: 0,
        pending: 2,
      }),
    );
    frameCallbacks.shift()?.(0);
    const stats = client.runtimeStats(2_000);
    expect(stats.totalReceived).toBe(2);
    expect(stats.totalConsumed).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.totalConsumed + stats.pending).toBe(stats.totalReceived);
    client.stop();
  });

  test("an empty no-data bucket does not freeze points queued by the previous second", () => {
    const onPacket = jest.fn();
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      initialBucketStartMs: BUCKET_START_MS,
      adaptiveRendering: false,
      getAccessToken: () => "access.jwt",
      refreshAccessToken: jest.fn(),
      onPacket,
      onStatus: jest.fn(),
    });
    client.start();
    const socket = MockSocket.instances[0];
    socket.open();
    socket.receive({
      type: "telemetry_second",
      batchId: "live-before-empty",
      bucketStartMs: BUCKET_START_MS,
      bucketEndMs: BUCKET_START_MS + 1_000,
      status: "live",
      points: [telemetryPoint(1), telemetryPoint(2)],
      sentAt: BUCKET_START_MS + 1_000,
      replay: false,
    });
    socket.receive({
      type: "telemetry_second",
      batchId: "empty-after-live",
      bucketStartMs: BUCKET_START_MS + 1_000,
      bucketEndMs: BUCKET_START_MS + 2_000,
      status: "no-data",
      points: [],
      sentAt: BUCKET_START_MS + 2_000,
      replay: false,
    });

    frameCallbacks.shift()?.(0);
    frameCallbacks.shift()?.(16);

    expect(onPacket).toHaveBeenCalledTimes(2);
    expect(client.pendingCount()).toBe(0);
    client.stop();
  });

  test("automatic overload control lowers only the effective subscription tier", () => {
    const client = new RealtimeClient({
      url: "ws://example.test/ws/robots/QH-ZHC-01",
      WebSocketImpl: MockSocket,
      initialBucketStartMs: BUCKET_START_MS,
      maxPointsPerSecond: 20,
      maxPerFrame: 50,
      adaptiveRendering: true,
      getAccessToken: () => "access.jwt",
      refreshAccessToken: jest.fn(),
      onPacket: jest.fn(),
      onStatus: jest.fn(),
    });
    client.start();
    const socket = MockSocket.instances[0];
    socket.open();

    for (let bucket = 0; bucket < 3; bucket += 1) {
      socket.receive({
        type: "telemetry_second",
        batchId: `overload-${bucket}`,
        bucketStartMs: BUCKET_START_MS + bucket * 1_000,
        bucketEndMs: BUCKET_START_MS + (bucket + 1) * 1_000,
        status: "live",
        points: Array.from({ length: 20 }, (_, index) =>
          telemetryPoint(bucket * 20 + index),
        ),
        sentAt: BUCKET_START_MS + (bucket + 1) * 1_000,
        replay: false,
      });
      client.reportRenderPerformance({
        nowMs: (bucket + 1) * 1_000,
        actualFps: 30,
        baselineFps: 60,
        renderP95Ms: 20,
        frameIntervalMs: 1000 / 60,
      });
    }

    expect(socket.close).toHaveBeenCalledWith(
      REALTIME_CLOSE_CODE.PAGE_HIDDEN,
      "subscription changed",
    );
    expect(client.runtimeStats(4_000)).toEqual(
      expect.objectContaining({
        requestedPointLimit: 20,
        effectivePointLimit: 10,
        overloaded: true,
      }),
    );
    client.stop();
  });
});
