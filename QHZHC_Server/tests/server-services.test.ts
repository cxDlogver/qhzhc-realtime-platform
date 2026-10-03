import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError, AuthService } from "../src/server/auth.js";
import { AppDatabase } from "../src/server/database.js";
import { createTelemetryPoint } from "../src/server/point-factory.js";
import { TelemetrySimulator } from "../src/server/simulator.js";
import { TelemetryStreamService } from "../src/server/telemetry-stream.js";

const ROUTE_OUTBOUND_POINT_COUNT = 1_050;
const CIRCLE_POINT_COUNT = 600;

function coordinates(index: number, pattern: "route" | "circle" | "burst") {
  const point = createTelemetryPoint(index, 0, "QH-ZHC-01", pattern);
  return [point.longitude, point.latitude];
}

describe("server services", () => {
  let database: AppDatabase;
  let auth: AuthService;
  let simulator: TelemetrySimulator;
  let telemetryStream: TelemetryStreamService;

  beforeEach(() => {
    database = new AppDatabase(":memory:", 10_000);
    auth = new AuthService(database, {
      accessTokenTtlMs: 60_000,
      refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
      jwtSecret: "test-secret-with-at-least-thirty-two-bytes",
    });
    simulator = new TelemetrySimulator(database);
    telemetryStream = new TelemetryStreamService(database);
  });

  afterEach(() => {
    telemetryStream.close();
    simulator.close();
    database.close();
  });

  it("seeds the demo account and issues verifiable access credentials", async () => {
    const tokens = await auth.login("admin", "Admin@123456");
    await expect(auth.verifyAccessToken(tokens.accessToken)).resolves.toMatchObject({
      username: "admin",
      role: "admin",
      familyId: tokens.familyId,
    });
    await expect(auth.login("admin", "wrong-password")).rejects.toBeInstanceOf(AuthError);
  });

  it("registers validated accounts and rejects duplicates", () => {
    const user = auth.register("operator_1", "测试操作员", "Passw0rd!");
    expect(user).toMatchObject({ username: "operator_1", displayName: "测试操作员" });
    expect(() => auth.register("operator_1", "重复账号", "Passw0rd!")).toThrowError("该账号已存在");
  });

  it("queries one natural-second bucket without mixing the following second", () => {
    const bucketStartMs = 1_700_000_000_000;
    database.insertTelemetry([
      createTelemetryPoint(0, bucketStartMs, "QH-ZHC-01", "route"),
      createTelemetryPoint(1, bucketStartMs + 950, "QH-ZHC-01", "route"),
      createTelemetryPoint(2, bucketStartMs + 1_000, "QH-ZHC-01", "route"),
    ]);
    expect(
      database.telemetryByTimeBucket("QH-ZHC-01", bucketStartMs)
        .map((point) => Date.parse(point.sampledAt)),
    ).toEqual([bucketStartMs, bucketStartMs + 950]);
  });

  it("generates uniformly spaced points without publishing them itself", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_700_000_000_123);
      simulator.updateConfig({ pointsPerSecond: 5 });
      simulator.start();

      vi.advanceTimersByTime(877);
      expect(
        database.telemetryByTimeBucket("QH-ZHC-01", 1_700_000_001_000)
          .map((point) => Date.parse(point.sampledAt)),
      ).toEqual([
        1_700_000_001_000,
        1_700_000_001_200,
        1_700_000_001_400,
        1_700_000_001_600,
        1_700_000_001_800,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("streams live and no-data buckets from the database without depending on the simulator", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_700_000_000_123);
      const published: Array<Parameters<Parameters<TelemetryStreamService["setPublisher"]>[0]>[0]> = [];
      telemetryStream.setPublisher((bucket) => published.push(bucket));
      telemetryStream.start();

      database.insertTelemetry([
        createTelemetryPoint(99, 1_700_000_001_000, "QH-ZHC-01", "route"),
      ]);
      vi.advanceTimersByTime(1_877);
      expect(published[0]).toMatchObject({
        bucketStartMs: 1_700_000_001_000,
        bucketEndMs: 1_700_000_002_000,
        status: "live",
      });
      expect(published[0]?.points).toHaveLength(1);

      vi.advanceTimersByTime(1_000);
      expect(published[1]).toMatchObject({
        bucketStartMs: 1_700_000_002_000,
        bucketEndMs: 1_700_000_003_000,
        status: "no-data",
        points: [],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("samples an entire high-volume history range while preserving both ends", () => {
    database.insertTelemetry(Array.from({ length: 20 }, (_, index) =>
      createTelemetryPoint(index, index, "QH-ZHC-01", "route"),
    ));
    const history = database.queryHistory("QH-ZHC-01", null, null, 5);
    expect(history).toMatchObject({ total: 20, truncated: true });
    expect(history.points.map((point) => point.sequence)).toEqual([1, 6, 11, 16, 20]);
  });

  it("keeps the supported sampling rate when an invalid value is submitted", () => {
    const status = simulator.updateConfig({
      pointsPerSecond: 99_999 as 20,
      pattern: "circle",
    });
    expect(status.config).toMatchObject({
      pointsPerSecond: 20,
      pattern: "circle",
    });
  });

  it("follows the sampled real route and keeps moving forward after its endpoint", () => {
    const route = Array.from(
      { length: ROUTE_OUTBOUND_POINT_COUNT + 1 },
      (_, index) => coordinates(index, "route"),
    );
    const longitudes = route.map(([longitude]) => longitude);
    const latitudes = route.map(([, latitude]) => latitude);

    expect(route[0]).toEqual([104.8106553, 28.1693623]);
    expect(route.at(-1)).toEqual([104.8144763, 28.1589373]);
    expect(Math.max(...longitudes) - Math.min(...longitudes)).toBeGreaterThan(0.018);
    expect(Math.max(...latitudes) - Math.min(...latitudes)).toBeGreaterThan(0.023);

    const routeEnd = route.at(-1)!;
    const previous = route.at(-2)!;
    const forward = [routeEnd[0] - previous[0], routeEnd[1] - previous[1]];
    const continuation = Array.from({ length: 2_000 }, (_, offset) =>
      coordinates(ROUTE_OUTBOUND_POINT_COUNT + 1 + offset, "route"),
    );
    let previousProjection = 0;

    for (const point of continuation) {
      const projection =
        (point[0] - routeEnd[0]) * forward[0] +
        (point[1] - routeEnd[1]) * forward[1];
      expect(projection).toBeGreaterThan(previousProjection);
      previousProjection = projection;
    }

    expect(continuation).not.toContainEqual(route[0]);
    expect(continuation).not.toContainEqual(previous);
  });

  it("keeps circle sampling on a closed loop", () => {
    expect(coordinates(CIRCLE_POINT_COUNT, "circle")).toEqual(
      coordinates(0, "circle"),
    );
  });

  it("keeps burst sampling concentrated near one hotspot", () => {
    const burst = Array.from({ length: 1_000 }, (_, index) =>
      coordinates(index, "burst"),
    );
    const longitudes = burst.map(([longitude]) => longitude);
    const latitudes = burst.map(([, latitude]) => latitude);

    expect(Math.max(...longitudes) - Math.min(...longitudes)).toBeLessThan(
      0.0005,
    );
    expect(Math.max(...latitudes) - Math.min(...latitudes)).toBeLessThan(
      0.0005,
    );
  });
});
