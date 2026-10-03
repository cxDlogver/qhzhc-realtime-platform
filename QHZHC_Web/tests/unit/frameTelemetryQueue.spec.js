import { FrameTelemetryQueue } from "@/views/DataVisualization/services/FrameTelemetryQueue";

// 可控的帧调度器：now() 恒为 0，使单帧只受 maxPerFrame 限制（时间预算不封顶）。
class FakeScheduler {
  constructor() {
    this.callback = null;
    this.handle = 0;
  }

  request(callback) {
    this.callback = callback;
    return ++this.handle;
  }

  cancel() {
    this.callback = null;
  }

  now() {
    return 0;
  }

  runFrame() {
    const callback = this.callback;
    this.callback = null;
    if (callback) callback(0);
  }
}

function points(...sequences) {
  return sequences.map((sequence) => ({ sequence }));
}

describe("FrameTelemetryQueue", () => {
  let onFrame;
  let scheduler;

  beforeEach(() => {
    onFrame = jest.fn();
    scheduler = new FakeScheduler();
  });

  test("normalizes the configured max per frame to a positive integer", () => {
    expect(new FrameTelemetryQueue(onFrame, undefined, 5, scheduler).maxPerFrameValue()).toBe(1);
    expect(new FrameTelemetryQueue(onFrame, 5, 5, scheduler).maxPerFrameValue()).toBe(5);
    expect(new FrameTelemetryQueue(onFrame, 0, 5, scheduler).maxPerFrameValue()).toBe(1);
    expect(new FrameTelemetryQueue(onFrame, 2.9, 5, scheduler).maxPerFrameValue()).toBe(2);
  });

  test("pending counts enqueued points minus consumed ones", () => {
    const queue = new FrameTelemetryQueue(onFrame, 1, 5, scheduler);
    queue.enqueue(points(1, 2, 3));
    expect(queue.pending()).toBe(3);

    scheduler.runFrame();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame.mock.calls[0][0]).toHaveLength(1);
    expect(queue.pending()).toBe(2);

    scheduler.runFrame();
    scheduler.runFrame();
    expect(queue.pending()).toBe(0);
  });

  test("setMaxPerFrame hot-updates and resumes draining without reconnect", () => {
    const queue = new FrameTelemetryQueue(onFrame, 1, 5, scheduler);
    queue.enqueue(points(1, 2, 3, 4, 5));
    scheduler.runFrame();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(queue.pending()).toBe(4);

    // 把每帧上限从 1 提到 10：应触发一次新的帧调度，不抛错、不重置队列。
    queue.setMaxPerFrame(10);
    expect(queue.maxPerFrameValue()).toBe(10);
    expect(scheduler.callback).not.toBeNull();
    expect(queue.pending()).toBe(4);

    scheduler.runFrame();
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(onFrame.mock.calls[1][0]).toHaveLength(4);
    expect(queue.pending()).toBe(0);
  });

  test("ignores no-op changes to max per frame", () => {
    const queue = new FrameTelemetryQueue(onFrame, 5, 5, scheduler);
    expect(queue.maxPerFrameValue()).toBe(5);
    queue.setMaxPerFrame(5);
    expect(queue.maxPerFrameValue()).toBe(5);
    expect(scheduler.callback).toBeNull();
  });
});
