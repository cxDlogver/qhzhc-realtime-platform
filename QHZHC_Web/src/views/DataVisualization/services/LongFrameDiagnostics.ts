import { percentile } from "./RenderPerformanceMonitor";

export interface LongFrameScript {
  duration: number;
  forcedStyleAndLayoutDuration?: number;
  sourceFunctionName?: string;
  sourceURL?: string;
  invoker?: string;
}

export interface LongFrameEntry {
  duration: number;
  startTime: number;
  renderStart?: number;
  styleAndLayoutStart?: number;
  scripts?: readonly LongFrameScript[];
}

export interface LongFrameSnapshot {
  count: number;
  attributedCount: number;
  latestScriptCount: number;
  p95Ms: number;
  maxMs: number;
  latestMs: number;
  latestScriptMs: number;
  latestRenderMs: number;
  latestPreStyleMs: number;
  latestPostStyleMs: number;
  latestForcedLayoutMs: number;
  topScript: string;
  topInvoker: string;
  topSourceURL: string;
}

/** Keep a bounded recent window for the panel; the experiment script retains raw entries. */
export class LongFrameDiagnostics {
  private count = 0;
  private attributedCount = 0;
  private topScriptDuration = 0;
  private readonly durations: number[] = [];
  private latest: LongFrameSnapshot = {
    count: 0,
    attributedCount: 0,
    latestScriptCount: 0,
    p95Ms: 0,
    maxMs: 0,
    latestMs: 0,
    latestScriptMs: 0,
    latestRenderMs: 0,
    latestPreStyleMs: 0,
    latestPostStyleMs: 0,
    latestForcedLayoutMs: 0,
    topScript: "—",
    topInvoker: "—",
    topSourceURL: "",
  };

  record(entry: LongFrameEntry): void {
    if (!Number.isFinite(entry.duration) || entry.duration < 50) return;
    this.count += 1;
    this.durations.push(entry.duration);
    if (this.durations.length > 200) this.durations.shift();

    const scripts = entry.scripts || [];
    if (scripts.length) this.attributedCount += 1;
    const topScript = scripts.reduce<LongFrameScript | null>(
      (top, script) => !top || script.duration > top.duration ? script : top,
      null,
    );
    const replaceTopScript = topScript && topScript.duration > this.topScriptDuration;
    if (replaceTopScript) this.topScriptDuration = topScript.duration;
    const end = entry.startTime + entry.duration;
    this.latest = {
      count: this.count,
      attributedCount: this.attributedCount,
      latestScriptCount: scripts.length,
      p95Ms: 0,
      maxMs: Math.max(this.latest.maxMs, entry.duration),
      latestMs: entry.duration,
      latestScriptMs: scripts.reduce((sum, script) => sum + (script.duration || 0), 0),
      latestRenderMs: entry.renderStart && entry.renderStart < end
        ? end - entry.renderStart
        : 0,
      latestPreStyleMs: entry.renderStart && entry.styleAndLayoutStart &&
        entry.styleAndLayoutStart >= entry.renderStart
        ? entry.styleAndLayoutStart - entry.renderStart
        : 0,
      latestPostStyleMs: entry.styleAndLayoutStart &&
        entry.styleAndLayoutStart < end
        ? end - entry.styleAndLayoutStart
        : 0,
      latestForcedLayoutMs: scripts.reduce(
        (sum, script) => sum + (script.forcedStyleAndLayoutDuration || 0),
        0,
      ),
      topScript: replaceTopScript
        ? topScript.sourceFunctionName || topScript.sourceURL || "—"
        : this.latest.topScript,
      topInvoker: replaceTopScript ? topScript.invoker || "—" : this.latest.topInvoker,
      topSourceURL: replaceTopScript ? topScript.sourceURL || "" : this.latest.topSourceURL,
    };
  }

  snapshot(): LongFrameSnapshot {
    return { ...this.latest, p95Ms: percentile(this.durations, 0.95) };
  }
}
