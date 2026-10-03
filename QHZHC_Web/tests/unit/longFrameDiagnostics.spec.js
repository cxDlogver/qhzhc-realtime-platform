import { LongFrameDiagnostics } from "@/views/DataVisualization/services/LongFrameDiagnostics";

describe("LongFrameDiagnostics", () => {
  test("summarizes a long frame and keeps script attribution", () => {
    const diagnostics = new LongFrameDiagnostics();
    diagnostics.record({
      startTime: 100,
      duration: 80,
      renderStart: 155,
      styleAndLayoutStart: 178,
      scripts: [
        { duration: 12, sourceFunctionName: "minor" },
        {
          duration: 35,
          forcedStyleAndLayoutDuration: 8,
          sourceFunctionName: "flush",
          sourceURL: "https://example.test/app.js",
          invoker: "Window.requestAnimationFrame",
        },
      ],
    });

    expect(diagnostics.snapshot()).toMatchObject({
      count: 1,
      attributedCount: 1,
      latestScriptCount: 2,
      p95Ms: 80,
      maxMs: 80,
      latestMs: 80,
      latestScriptMs: 47,
      latestRenderMs: 25,
      latestPreStyleMs: 23,
      latestPostStyleMs: 2,
      latestForcedLayoutMs: 8,
      topScript: "flush",
      topInvoker: "Window.requestAnimationFrame",
      topSourceURL: "https://example.test/app.js",
    });
    diagnostics.record({ startTime: 200, duration: 60, scripts: [] });
    expect(diagnostics.snapshot()).toMatchObject({
      count: 2,
      attributedCount: 1,
      latestScriptCount: 0,
      topScript: "flush",
      topInvoker: "Window.requestAnimationFrame",
    });
  });

  test("ignores shorter entries and bounds the percentile window", () => {
    const diagnostics = new LongFrameDiagnostics();
    diagnostics.record({ startTime: 0, duration: 49 });
    for (let i = 0; i < 201; i++) {
      diagnostics.record({ startTime: i, duration: 50 + i });
    }

    expect(diagnostics.snapshot()).toMatchObject({
      count: 201,
      attributedCount: 0,
      latestScriptCount: 0,
      p95Ms: 240,
      maxMs: 250,
      latestMs: 250,
      latestRenderMs: 0,
      topScript: "—",
    });
  });
});
