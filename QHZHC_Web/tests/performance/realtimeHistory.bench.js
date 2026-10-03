/* eslint-env jest, node */
import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";
import { appendRealtimeBatch } from "@/views/DataVisualization/utils/visualizationData";

const HISTORY_SIZES = [300, 600, 1200, 6000];
const ROUND_COUNT = 5;
const ITERATIONS = 2_000;
const BATCH_SIZE = 5;

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function createPoints(count) {
  return Array.from({ length: count }, (_, index) => ({
    sequence: index,
    longitude: 104 + index * 0.000001,
    latitude: 28 + index * 0.000001,
  }));
}

function measure(operation) {
  const samples = [];
  for (let round = 0; round < ROUND_COUNT; round += 1) {
    const startedAt = performance.now();
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      operation();
    }
    samples.push(performance.now() - startedAt);
  }
  return {
    medianMs: median(samples),
    samplesMs: samples,
  };
}

function rebuildRoute(points) {
  return points.reduce((coordinates, point) => {
    coordinates.push(point.longitude, point.latitude, 2);
    return coordinates;
  }, []);
}

describe("realtime visual history controlled-variable benchmark", () => {
  test("records history-size and incremental-route costs", () => {
    const incoming = createPoints(BATCH_SIZE);
    const scenarios = HISTORY_SIZES.map((historySize) => {
      const history = createPoints(historySize);
      const append = measure(() => appendRealtimeBatch(history, incoming));
      const fullRoute = measure(() => rebuildRoute(history));
      const incrementalRoute = measure(() => rebuildRoute(incoming));
      return {
        historySize,
        append,
        fullRoute,
        incrementalRoute,
        routeSpeedup: fullRoute.medianMs / incrementalRoute.medianMs,
      };
    });

    const report = {
      generatedAt: new Date().toISOString(),
      runtime: process.version,
      rounds: ROUND_COUNT,
      iterationsPerRound: ITERATIONS,
      batchSize: BATCH_SIZE,
      scenarios,
      comparison: {
        append6000Vs300:
          scenarios.find((item) => item.historySize === 6000).append.medianMs /
          scenarios.find((item) => item.historySize === 300).append.medianMs,
        fullRoute6000Vs300:
          scenarios.find((item) => item.historySize === 6000).fullRoute.medianMs /
          scenarios.find((item) => item.historySize === 300).fullRoute.medianMs,
        retainedPointsAfter30MinutesAt20PerSecond: 36_000,
        retainedPointsWithFiveMinuteCapAt20PerSecond: 6_000,
      },
      limitation:
        "Node microbenchmark proves algorithmic scale only; browser FPS, GPU cost and heap slope require the documented browser soak test.",
    };

    const outputDirectory = path.resolve(
      __dirname,
      "../../../reports/realtime-rendering",
    );
    fs.mkdirSync(outputDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(outputDirectory, "history-microbenchmark.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );

    expect(scenarios).toHaveLength(HISTORY_SIZES.length);
    expect(scenarios.every((item) => item.routeSpeedup > 0)).toBe(true);
  });
});
