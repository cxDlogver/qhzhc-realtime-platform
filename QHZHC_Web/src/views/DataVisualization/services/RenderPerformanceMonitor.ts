export interface AnimationFrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}

export interface RafPerformanceSnapshot {
  fps: number;
  baselineFps: number;
  frameIntervalMs: number;
}

const browserScheduler: AnimationFrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
};

/** 独立于遥测批次的 rAF 计数器；没有数据时仍持续反映画面调度能力。 */
export class RafPerformanceMonitor {
  private handle: number | null = null;
  private running = false;
  private windowStart: number | null = null;
  private frameCount = 0;
  private lastFps = 0;
  private baselineFps = 0;
  private frameIntervalMs = 1000 / 60;

  constructor(
    private readonly onSample?: (snapshot: RafPerformanceSnapshot) => void,
    private readonly scheduler: AnimationFrameScheduler = browserScheduler,
    private readonly sampleWindowMs = 1_000,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.windowStart = null;
    this.frameCount = 0;
    this.handle = this.scheduler.request(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.handle !== null) this.scheduler.cancel(this.handle);
    this.handle = null;
  }

  snapshot(): RafPerformanceSnapshot {
    return {
      fps: this.lastFps,
      baselineFps: this.baselineFps,
      frameIntervalMs: this.frameIntervalMs,
    };
  }

  private readonly tick = (timestamp: number): void => {
    if (!this.running) return;
    if (this.windowStart === null) this.windowStart = timestamp;
    this.frameCount += 1;
    const elapsed = timestamp - this.windowStart;
    if (elapsed >= this.sampleWindowMs) {
      this.lastFps = this.frameCount * 1000 / elapsed;
      this.frameIntervalMs = elapsed / this.frameCount;
      this.baselineFps = Math.max(this.baselineFps, this.lastFps);
      this.onSample?.(this.snapshot());
      this.windowStart = timestamp;
      this.frameCount = 0;
    }
    this.handle = this.scheduler.request(this.tick);
  };
}

export function percentile(values: readonly number[], ratio: number): number {
  const samples = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!samples.length) return 0;
  const index = Math.min(
    samples.length - 1,
    Math.max(0, Math.ceil(samples.length * ratio) - 1),
  );
  return samples[index];
}
