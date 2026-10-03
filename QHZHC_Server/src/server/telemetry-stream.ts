import type { TelemetrySecondBucket } from "../shared/index.js";
import { AppDatabase } from "./database.js";

export type TelemetryStreamPublisher = (
  bucket: TelemetrySecondBucket,
) => void;

const SECOND_MS = 1_000;

function nextNaturalSecond(now = Date.now()): number {
  return Math.floor(now / SECOND_MS) * SECOND_MS + SECOND_MS;
}

/**
 * 数据库到 WebSocket 之间的实时数据服务。
 *
 * 它只依赖遥测表，不知道数据由模拟器还是真实采集设备写入。每个自然秒结束后，
 * 查询该秒数据并按查询结果生成 live / no-data，再交给 WebSocket Hub 投递。
 */
export class TelemetryStreamService {
  private timer: NodeJS.Timeout | null = null;
  private nextBucketStartMs: number | null = null;
  private latestBucketStartMs: number | null = null;
  private publisher: TelemetryStreamPublisher = () => undefined;

  constructor(
    private readonly database: AppDatabase,
    private readonly defaultRobotId = "QH-ZHC-01",
  ) {}

  setPublisher(publisher: TelemetryStreamPublisher): void {
    this.publisher = publisher;
  }

  start(): void {
    if (this.timer) return;
    this.nextBucketStartMs = nextNaturalSecond();
    this.scheduleNextBucket();
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextBucketStartMs = null;
  }

  getLatestBucketStartMs(robotId = this.defaultRobotId): number | null {
    if (robotId === this.defaultRobotId && this.latestBucketStartMs !== null) {
      return this.latestBucketStartMs;
    }
    const latestPoint = this.database.latestTelemetry(robotId, 1).at(-1);
    const sampledAt = latestPoint ? Date.parse(latestPoint.sampledAt) : Number.NaN;
    return Number.isFinite(sampledAt)
      ? Math.floor(sampledAt / SECOND_MS) * SECOND_MS
      : null;
  }

  earliestTelemetryBucketStartMs(robotId: string): number | null {
    return this.database.earliestTelemetryBucketStartMs(robotId);
  }

  readBucket(robotId: string, bucketStartMs: number): TelemetrySecondBucket {
    const points = this.database.telemetryByTimeBucket(robotId, bucketStartMs);
    return {
      bucketStartMs,
      bucketEndMs: bucketStartMs + SECOND_MS,
      status: points.length > 0 ? "live" : "no-data",
      points,
    };
  }

  private scheduleNextBucket(): void {
    const bucketStartMs = this.nextBucketStartMs ?? nextNaturalSecond();
    this.nextBucketStartMs = bucketStartMs;
    const delay = Math.max(0, bucketStartMs + SECOND_MS - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      const bucket = this.readBucket(this.defaultRobotId, bucketStartMs);
      this.latestBucketStartMs = bucketStartMs;
      this.publisher(bucket);
      this.nextBucketStartMs = bucketStartMs + SECOND_MS;
      this.scheduleNextBucket();
    }, delay);
  }
}
