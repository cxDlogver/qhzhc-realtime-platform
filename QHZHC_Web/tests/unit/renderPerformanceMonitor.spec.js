import {
  RafPerformanceMonitor,
  percentile,
} from "@/views/DataVisualization/services/RenderPerformanceMonitor";

class FakeRafScheduler {
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

  run(timestamp) {
    const callback = this.callback;
    this.callback = null;
    callback?.(timestamp);
  }
}

describe("RafPerformanceMonitor", () => {
  test("measures display frames independently from telemetry callbacks", () => {
    const scheduler = new FakeRafScheduler();
    const onSample = jest.fn();
    const monitor = new RafPerformanceMonitor(onSample, scheduler, 1_000);
    monitor.start();
    for (let timestamp = 0; timestamp <= 1_100; timestamp += 100) {
      scheduler.run(timestamp);
    }
    const snapshot = monitor.snapshot();
    expect(snapshot.fps).toBeGreaterThan(9);
    expect(snapshot.fps).toBeLessThan(12);
    expect(snapshot.frameIntervalMs).toBeGreaterThan(90);
    expect(onSample).toHaveBeenCalledTimes(1);
    monitor.stop();
  });

  test("calculates a nearest-rank percentile without mutating input", () => {
    const values = [8, 1, 4, 2, 10];
    expect(percentile(values, 0.95)).toBe(10);
    expect(percentile(values, 0.5)).toBe(4);
    expect(values).toEqual([8, 1, 4, 2, 10]);
  });
});
