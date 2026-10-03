import { describe, expect, it } from "vitest";
import {
  FrameTelemetryQueue,
  type FrameScheduler,
} from "../../QHZHC_Web/src/views/DataVisualization/services/FrameTelemetryQueue";
import type { TelemetryPoint } from "../../QHZHC_Web/src/views/DataVisualization/services/realtimeTypes";

function point(sequence: number): TelemetryPoint {
  return {
    sequence,
    robotId: "QH-ZHC-01",
    sampledAt: new Date(sequence * 1_000).toISOString(),
    longitude: 116.3,
    latitude: 40,
    altitude: 45,
    speed: 8,
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
    windSpeed: 2,
    windDirection: 100,
    temperature: 24,
    humidity: 45,
    pressure: 1_010,
  };
}

describe("frontend realtime ordering and rendering", () => {
  it("splits a large socket batch into bounded animation frames without reordering", () => {
    const callbacks: FrameRequestCallback[] = [];
    const scheduler: FrameScheduler = {
      request(callback) {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancel() {},
      now: () => 0,
    };
    const frames: number[][] = [];
    const queue = new FrameTelemetryQueue(
      (items) => frames.push(items.map((item) => item.sequence)),
      3,
      5,
      scheduler,
    );

    queue.enqueue(Array.from({ length: 8 }, (_, index) => point(index + 1)));
    while (callbacks.length) callbacks.shift()?.(0);

    expect(frames).toEqual([[1, 2, 3], [4, 5, 6], [7, 8]]);
  });

  it("keeps queued points while rendering is paused and resumes from the head", () => {
    const callbacks: FrameRequestCallback[] = [];
    const scheduler: FrameScheduler = {
      request(callback) {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancel() {},
      now: () => 0,
    };
    const rendered: number[] = [];
    const queue = new FrameTelemetryQueue(
      (items) => rendered.push(...items.map((item) => item.sequence)),
      1,
      5,
      scheduler,
    );
    queue.pause();
    queue.enqueue([point(1), point(2)]);
    expect(callbacks).toHaveLength(0);
    expect(queue.peekNext()?.sequence).toBe(1);

    queue.resume();
    while (callbacks.length) callbacks.shift()?.(0);
    expect(rendered).toEqual([1, 2]);
  });
});
