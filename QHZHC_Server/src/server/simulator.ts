import type {
  SimulatorConfig,
  SimulatorPattern,
  SimulatorPointRate,
  SimulatorStatus,
} from "../shared/index.js";
import { SIMULATOR_POINT_RATES } from "../shared/index.js";
import { AppDatabase } from "./database.js";
import { createTelemetryPoint } from "./point-factory.js";

const SECOND_MS = 1_000;

const DEFAULT_CONFIG: SimulatorConfig = {
  robotId: "QH-ZHC-01",
  pointsPerSecond: 20,
  pattern: "route",
};

function isPointRate(value: unknown): value is SimulatorPointRate {
  return SIMULATOR_POINT_RATES.includes(value as SimulatorPointRate);
}

function isPattern(value: unknown): value is SimulatorPattern {
  return value === "route" || value === "circle" || value === "burst";
}

function nextNaturalSecond(now = Date.now()): number {
  return Math.floor(now / SECOND_MS) * SECOND_MS + SECOND_MS;
}

export class TelemetrySimulator {
  private config: SimulatorConfig = { ...DEFAULT_CONFIG };
  private collectionTimer: NodeJS.Timeout | null = null;
  private running = false;
  private nextBucketStartMs: number | null = null;
  private generatedPoints = 0;
  private lastGeneratedAt: string | null = null;

  constructor(private readonly database: AppDatabase) {}

  getStatus(connectedClients = 0): SimulatorStatus {
    return {
      running: this.running,
      config: { ...this.config },
      committedSequence: this.database.latestSequence(this.config.robotId),
      generatedPoints: this.generatedPoints,
      lastGeneratedAt: this.lastGeneratedAt,
      updatedAt: new Date().toISOString(),
      connectedClients,
    };
  }

  updateConfig(patch: Partial<SimulatorConfig>): SimulatorStatus {
    const next = { ...this.config };
    if (isPointRate(patch.pointsPerSecond)) next.pointsPerSecond = patch.pointsPerSecond;
    if (isPattern(patch.pattern)) next.pattern = patch.pattern;
    this.config = next;
    return this.getStatus();
  }

  start(): SimulatorStatus {
    if (!this.running) {
      this.running = true;
      this.nextBucketStartMs = nextNaturalSecond();
      this.scheduleNextBucket();
    }
    return this.getStatus();
  }

  pause(): SimulatorStatus {
    this.running = false;
    if (this.collectionTimer) clearTimeout(this.collectionTimer);
    this.collectionTimer = null;
    this.nextBucketStartMs = null;
    return this.getStatus();
  }

  close(): void {
    if (this.collectionTimer) clearTimeout(this.collectionTimer);
    this.collectionTimer = null;
    this.nextBucketStartMs = null;
    this.running = false;
  }

  private scheduleNextBucket(): void {
    if (!this.running || this.collectionTimer) return;
    const bucketStartMs = this.nextBucketStartMs ?? nextNaturalSecond();
    this.nextBucketStartMs = bucketStartMs;
    const delay = Math.max(0, bucketStartMs - Date.now());
    this.collectionTimer = setTimeout(() => {
      this.collectionTimer = null;
      if (!this.running) return;
      this.generateBucket(bucketStartMs);
      this.nextBucketStartMs = bucketStartMs + SECOND_MS;
      this.scheduleNextBucket();
    }, delay);
  }

  private generateBucket(bucketStartMs: number) {
    const count = this.config.pointsPerSecond;
    const spacing = SECOND_MS / count;
    const pending = Array.from({ length: count }, (_, offset) =>
      createTelemetryPoint(
        this.generatedPoints + offset,
        bucketStartMs + offset * spacing,
        this.config.robotId,
        this.config.pattern,
      ),
    );
    const inserted = this.database.insertTelemetry(pending);
    this.generatedPoints += inserted.length;
    this.lastGeneratedAt = inserted.at(-1)?.sampledAt ?? this.lastGeneratedAt;
    return inserted;
  }
}
