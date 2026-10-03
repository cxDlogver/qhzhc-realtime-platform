import type { DeliveryPointLimit } from "./realtimeTypes";

export type RenderControlMode = "auto" | "manual";

export interface AdaptiveRenderSample {
  nowMs: number;
  actualFps: number;
  baselineFps: number;
  arrivalRate: number;
  consumeRate: number;
  pending: number;
  oldestPendingMs: number;
  renderP95Ms: number;
  frameIntervalMs: number;
  effectivePointLimit: DeliveryPointLimit;
}

export interface AdaptiveRenderDecision {
  mode: RenderControlMode;
  batchSize: number;
  safeBatchSize: number;
  requiredBatchSize: number;
  frameBudgetMs: number;
  queueSlope: number;
  overloaded: boolean;
  requestedPointLimit: DeliveryPointLimit | null;
  reason: string;
}

export interface AdaptiveRenderControllerOptions {
  minBatchSize?: number;
  maxBatchSize?: number;
  queueAgeLimitMs?: number;
  catchUpWindowSeconds?: number;
  overloadWindowsBeforeThrottle?: number;
  healthyWindowsBeforeDecrease?: number;
  throttleCooldownMs?: number;
  recoveryHealthyMs?: number;
}

const POINT_LIMIT_LADDER: DeliveryPointLimit[] = [0, 20, 10, 5, 2, 1];

function positiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * 只负责作出调度决策，不持有定时器和网络连接，因此可以用确定性样本做 A/B 测试。
 * 调用方每秒提供一次真实 rAF、队列和渲染耗时样本，并执行返回的批量/订阅调整。
 */
export class AdaptiveRenderController {
  private readonly minBatchSize: number;
  private readonly maxBatchSize: number;
  private readonly queueAgeLimitMs: number;
  private readonly catchUpWindowSeconds: number;
  private readonly overloadWindowsBeforeThrottle: number;
  private readonly healthyWindowsBeforeDecrease: number;
  private readonly throttleCooldownMs: number;
  private readonly recoveryHealthyMs: number;

  private mode: RenderControlMode = "auto";
  private batchSize: number;
  private safeBatchSize: number;
  private desiredPointLimit: DeliveryPointLimit;
  private previousPending = 0;
  private overloadWindows = 0;
  private healthyWindows = 0;
  private healthySinceMs: number | null = null;
  private lastPointLimitChangeAt = Number.NEGATIVE_INFINITY;

  constructor(
    initialBatchSize = 1,
    desiredPointLimit: DeliveryPointLimit = 0,
    options: AdaptiveRenderControllerOptions = {},
  ) {
    this.minBatchSize = positiveInteger(options.minBatchSize ?? 1, 1);
    this.maxBatchSize = Math.max(
      this.minBatchSize,
      positiveInteger(options.maxBatchSize ?? 50, 50),
    );
    this.queueAgeLimitMs = positiveInteger(options.queueAgeLimitMs ?? 1_000, 1_000);
    this.catchUpWindowSeconds = positiveInteger(
      options.catchUpWindowSeconds ?? 2,
      2,
    );
    this.overloadWindowsBeforeThrottle = positiveInteger(
      options.overloadWindowsBeforeThrottle ?? 3,
      3,
    );
    this.healthyWindowsBeforeDecrease = positiveInteger(
      options.healthyWindowsBeforeDecrease ?? 5,
      5,
    );
    this.throttleCooldownMs = positiveInteger(
      options.throttleCooldownMs ?? 30_000,
      30_000,
    );
    this.recoveryHealthyMs = positiveInteger(
      options.recoveryHealthyMs ?? 60_000,
      60_000,
    );
    this.batchSize = clamp(
      positiveInteger(initialBatchSize, this.minBatchSize),
      this.minBatchSize,
      this.maxBatchSize,
    );
    this.safeBatchSize = this.batchSize;
    this.desiredPointLimit = desiredPointLimit;
  }

  setAutoMode(): void {
    this.mode = "auto";
    this.overloadWindows = 0;
    this.healthyWindows = 0;
    this.healthySinceMs = null;
  }

  setManualBatch(value: number): void {
    this.mode = "manual";
    this.batchSize = clamp(
      positiveInteger(value, this.minBatchSize),
      this.minBatchSize,
      this.maxBatchSize,
    );
    this.overloadWindows = 0;
    this.healthyWindows = 0;
    this.healthySinceMs = null;
  }

  setDesiredPointLimit(value: DeliveryPointLimit): void {
    this.desiredPointLimit = value;
  }

  currentMode(): RenderControlMode {
    return this.mode;
  }

  currentBatchSize(): number {
    return this.batchSize;
  }

  evaluate(sample: AdaptiveRenderSample): AdaptiveRenderDecision {
    const frameIntervalMs = Number.isFinite(sample.frameIntervalMs) && sample.frameIntervalMs > 0
      ? sample.frameIntervalMs
      : 1000 / Math.max(sample.baselineFps || 60, 1);
    const frameBudgetMs = Math.max(1, frameIntervalMs / 2);
    const actualFps = Math.max(1, sample.actualFps || sample.baselineFps || 1);
    const requiredBatchSize = clamp(
      Math.ceil(
        (Math.max(0, sample.arrivalRate) +
          Math.max(0, sample.pending) / this.catchUpWindowSeconds) /
          actualFps,
      ),
      this.minBatchSize,
      this.maxBatchSize,
    );
    const queueSlope = sample.pending - this.previousPending;
    this.previousPending = sample.pending;
    const fpsHealthy =
      sample.baselineFps <= 0 || sample.actualFps >= sample.baselineFps * 0.9;
    const renderWithinBudget =
      sample.renderP95Ms <= 0 || sample.renderP95Ms <= frameBudgetMs;
    const overloaded =
      sample.oldestPendingMs > this.queueAgeLimitMs || queueSlope > 0;
    let requestedPointLimit: DeliveryPointLimit | null = null;
    let reason = this.mode === "manual" ? "manual batch" : "steady";

    if (this.mode === "manual") {
      return {
        mode: this.mode,
        batchSize: this.batchSize,
        safeBatchSize: this.safeBatchSize,
        requiredBatchSize,
        frameBudgetMs,
        queueSlope,
        overloaded,
        requestedPointLimit,
        reason,
      };
    }

    if (renderWithinBudget) {
      this.safeBatchSize = Math.max(this.safeBatchSize, this.batchSize);
    } else {
      this.safeBatchSize = Math.max(
        this.minBatchSize,
        Math.min(this.safeBatchSize, this.batchSize - 1),
      );
    }

    const healthy =
      sample.pending === 0 &&
      sample.oldestPendingMs === 0 &&
      fpsHealthy &&
      renderWithinBudget;

    if (overloaded) {
      this.overloadWindows += 1;
      this.healthyWindows = 0;
      this.healthySinceMs = null;
      if (renderWithinBudget) {
        const probeCeiling = Math.min(this.maxBatchSize, this.safeBatchSize + 1);
        this.batchSize = Math.min(
          probeCeiling,
          Math.max(this.batchSize + 1, requiredBatchSize),
        );
        reason = "queue growing; increase batch";
      } else {
        this.batchSize = Math.min(this.batchSize, this.safeBatchSize);
        reason = "render budget reached";
      }
    } else if (healthy) {
      this.overloadWindows = 0;
      this.healthyWindows += 1;
      if (this.healthySinceMs === null) this.healthySinceMs = sample.nowMs;
      if (
        this.healthyWindows >= this.healthyWindowsBeforeDecrease &&
        this.batchSize > this.minBatchSize
      ) {
        this.batchSize -= 1;
        this.healthyWindows = 0;
        reason = "healthy; decrease batch slowly";
      }
    } else {
      this.overloadWindows = 0;
      this.healthyWindows = 0;
      this.healthySinceMs = null;
    }

    const cannotIncreaseSafely =
      !renderWithinBudget || this.batchSize >= this.maxBatchSize;
    if (
      this.overloadWindows >= this.overloadWindowsBeforeThrottle &&
      cannotIncreaseSafely &&
      sample.nowMs - this.lastPointLimitChangeAt >= this.throttleCooldownMs
    ) {
      requestedPointLimit = this.nextLowerPointLimit(sample.effectivePointLimit);
      if (requestedPointLimit !== null) {
        this.lastPointLimitChangeAt = sample.nowMs;
        this.overloadWindows = 0;
        reason = "sustained overload; lower input rate";
      }
    } else if (
      healthy &&
      this.healthySinceMs !== null &&
      sample.nowMs - this.healthySinceMs >= this.recoveryHealthyMs &&
      sample.nowMs - this.lastPointLimitChangeAt >= this.throttleCooldownMs
    ) {
      requestedPointLimit = this.nextHigherPointLimit(
        sample.effectivePointLimit,
        this.desiredPointLimit,
      );
      if (requestedPointLimit !== null) {
        this.lastPointLimitChangeAt = sample.nowMs;
        this.healthySinceMs = sample.nowMs;
        reason = "healthy; probe higher input rate";
      }
    }

    return {
      mode: this.mode,
      batchSize: this.batchSize,
      safeBatchSize: this.safeBatchSize,
      requiredBatchSize,
      frameBudgetMs,
      queueSlope,
      overloaded,
      requestedPointLimit,
      reason,
    };
  }

  private nextLowerPointLimit(current: DeliveryPointLimit): DeliveryPointLimit | null {
    const index = POINT_LIMIT_LADDER.indexOf(current);
    if (index < 0 || index >= POINT_LIMIT_LADDER.length - 1) return null;
    return POINT_LIMIT_LADDER[index + 1];
  }

  private nextHigherPointLimit(
    current: DeliveryPointLimit,
    desired: DeliveryPointLimit,
  ): DeliveryPointLimit | null {
    if (current === desired) return null;
    const currentIndex = POINT_LIMIT_LADDER.indexOf(current);
    const desiredIndex = POINT_LIMIT_LADDER.indexOf(desired);
    if (currentIndex <= 0 || desiredIndex < 0 || currentIndex <= desiredIndex) return null;
    return POINT_LIMIT_LADDER[Math.max(desiredIndex, currentIndex - 1)];
  }
}
