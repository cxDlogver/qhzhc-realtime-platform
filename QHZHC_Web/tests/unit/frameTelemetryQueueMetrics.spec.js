import { FrameTelemetryQueue } from "@/views/DataVisualization/services/FrameTelemetryQueue";

class TimedScheduler {
  constructor() {
    this.callback = null;
    this.handle = 0;
    this.time = 0;
    this.nowCalls = [];
  }

  request(callback) {
    this.callback = callback;
    return ++this.handle;
  }

  cancel() {
    this.callback = null;
  }

  now() {
    if (this.nowCalls.length) return this.nowCalls.shift();
    return this.time;
  }

  runFrame() {
    const callback = this.callback;
    this.callback = null;
    callback?.(this.time);
  }
}

function points(...sequences) {
  return sequences.map((sequence) => ({ sequence }));
}

describe("FrameTelemetryQueue metrics", () => {
  test("reports oldest pending age and conservation counters", () => {
    const scheduler = new TimedScheduler();
    const onFrame = jest.fn();
    const queue = new FrameTelemetryQueue(onFrame, 1, 5, scheduler);
    queue.enqueue(points(1, 2));
    scheduler.time = 250;

    expect(queue.oldestPendingMs()).toBe(250);
    expect(queue.counters()).toEqual({ enqueued: 2, consumed: 0 });

    scheduler.runFrame();
    expect(queue.pending()).toBe(1);
    expect(queue.oldestPendingMs()).toBe(250);
    expect(queue.counters()).toEqual({ enqueued: 2, consumed: 1 });
  });

  test("always consumes at least one point when extraction budget is already exhausted", () => {
    const scheduler = new TimedScheduler();
    const onFrame = jest.fn();
    const queue = new FrameTelemetryQueue(onFrame, 10, 5, scheduler);
    queue.enqueue(points(1, 2));
    scheduler.nowCalls = [0, 10, 10];

    scheduler.runFrame();

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame.mock.calls[0][0]).toHaveLength(1);
    expect(queue.pending()).toBe(1);
  });

  test("controlled throughput grows only when arrival exceeds frames times batch", () => {
    const runScenario = (maxPerFrame) => {
      const scheduler = new TimedScheduler();
      const queue = new FrameTelemetryQueue(jest.fn(), maxPerFrame, 5, scheduler);
      let sequence = 0;
      for (let second = 0; second < 5; second += 1) {
        queue.enqueue(
          Array.from({ length: 20 }, () => ({ sequence: sequence++ })),
        );
        for (let frame = 0; frame < 10; frame += 1) {
          scheduler.runFrame();
        }
      }
      return queue.pending();
    };

    expect(runScenario(1)).toBe(50);
    expect(runScenario(2)).toBe(0);
  });
});
