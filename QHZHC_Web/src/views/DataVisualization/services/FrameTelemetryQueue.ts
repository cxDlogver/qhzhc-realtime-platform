import type { TelemetryPoint } from "./realtimeTypes";

export interface FrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
  now(): number;
}

const browserFrameScheduler: FrameScheduler = {
  request: (callback) => window.requestAnimationFrame(callback),
  cancel: (handle) => window.cancelAnimationFrame(handle),
  now: () => performance.now(),
};

export class FrameTelemetryQueue {
  private queue: TelemetryPoint[] = [];
  private enqueuedAt: number[] = [];
  private cursor = 0;
  private frameHandle: number | null = null;
  private paused = false;
  private totalEnqueued = 0;
  private totalConsumed = 0;

  /** 每帧取点上限。运行时可改，用于在大批量补发时加快消费积压。 */
  private maxPerFrame: number;

  constructor(
    private readonly onFrame: (points: TelemetryPoint[]) => void,
    maxPerFrame = 1,
    private readonly budgetMs = 5,
    private readonly scheduler: FrameScheduler = browserFrameScheduler,
  ) {
    this.maxPerFrame = FrameTelemetryQueue.normalizeLimit(maxPerFrame);
  }

  private static normalizeLimit(value: number): number {
    return Math.max(1, Math.floor(value));
  }

  /**
   * 热更新每帧取点上限。
   * 改完主动 schedule() 一次：若上一帧是因时间预算耗尽退出、而队列仍有剩余，
   * 这里能立刻恢复消费（schedule 内部有 paused / 已有调度 / 队列已空三重短路，重复调用安全）。
   */
  setMaxPerFrame(value: number): void {
    const next = FrameTelemetryQueue.normalizeLimit(value);
    if (next === this.maxPerFrame) return;
    this.maxPerFrame = next;
    this.schedule();
  }

  /** 当前生效的每帧取点上限，供界面回显。 */
  maxPerFrameValue(): number {
    return this.maxPerFrame;
  }

  enqueue(points: TelemetryPoint[]): void {
    if (!points.length) return;
    const enqueuedAt = this.scheduler.now();
    this.queue.push(...points);
    this.enqueuedAt.push(...points.map(() => enqueuedAt));
    this.totalEnqueued += points.length;
    this.schedule();
  }

  peekNext(): TelemetryPoint | null {
    return this.queue[this.cursor] ?? null;
  }

  /** 尚未交给渲染层的点数：队列总长减去已消费游标。 */
  pending(): number {
    return Math.max(0, this.queue.length - this.cursor);
  }

  /** 当前队首等待时间；队列为空时为 0。 */
  oldestPendingMs(): number {
    if (this.cursor >= this.enqueuedAt.length) return 0;
    return Math.max(0, this.scheduler.now() - this.enqueuedAt[this.cursor]);
  }

  counters(): { enqueued: number; consumed: number } {
    return {
      enqueued: this.totalEnqueued,
      consumed: this.totalConsumed,
    };
  }

  pause(): void {
    this.paused = true;
    if (this.frameHandle !== null) this.scheduler.cancel(this.frameHandle);
    this.frameHandle = null;
  }

  resume(): void {
    this.paused = false;
    this.schedule();
  }

  stop(): void {
    if (this.frameHandle !== null) this.scheduler.cancel(this.frameHandle);
    this.frameHandle = null;
    this.queue = [];
    this.enqueuedAt = [];
    this.cursor = 0;
    this.paused = false;
    this.totalEnqueued = 0;
    this.totalConsumed = 0;
  }

  private schedule(): void {
    if (this.paused || this.frameHandle !== null || this.cursor >= this.queue.length) return;
    this.frameHandle = this.scheduler.request(() => this.flush());
  }

  private flush(): void {
    this.frameHandle = null;
    const startedAt = this.scheduler.now();
    const batch: TelemetryPoint[] = [];
    while (
      this.cursor < this.queue.length &&
      batch.length < this.maxPerFrame &&
      (batch.length === 0 || this.scheduler.now() - startedAt < this.budgetMs)
    ) {
      const point = this.queue[this.cursor++];
      if (point) batch.push(point);
    }
    if (batch.length) {
      this.totalConsumed += batch.length;
      this.onFrame(batch);
    }
    if (this.cursor > 2_000 && this.cursor * 2 > this.queue.length) {
      this.queue = this.queue.slice(this.cursor);
      this.enqueuedAt = this.enqueuedAt.slice(this.cursor);
      this.cursor = 0;
    }
    if (this.cursor < this.queue.length) {
      this.schedule();
    } else {
      this.queue = [];
      this.enqueuedAt = [];
      this.cursor = 0;
    }
  }
}
