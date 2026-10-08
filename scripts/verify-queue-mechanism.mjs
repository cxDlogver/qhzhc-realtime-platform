/** Deterministic mechanism checks using the actual queue; virtual time is not browser timing. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.env.QHZHC_QUEUE_OUTPUT || path.join(root, 'reports/queue-backlog-2026-10-08'));
const source = await readFile(path.join(root, 'QHZHC_Web/src/views/DataVisualization/services/FrameTelemetryQueue.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { FrameTelemetryQueue } = context.exports;
class Scheduler {
  time = 0; handle = 0; callback = null;
  request(callback) { this.callback = callback; return ++this.handle; }
  cancel() { this.callback = null; }
  now() { return this.time; }
  frame() { const callback = this.callback; this.callback = null; callback?.(this.time); }
}
const throughput = [1, 2, 5].map(batch => {
  const scheduler = new Scheduler();
  const queue = new FrameTelemetryQueue(() => {}, batch, 5, scheduler);
  const series = [];
  let sequence = 0;
  for (let second = 1; second <= 10; second++) {
    queue.enqueue(Array.from({ length: 20 }, () => ({ sequence: sequence++ })));
    for (let frame = 0; frame < 10; frame++) { scheduler.time += 100; scheduler.frame(); }
    series.push({ second, pending: queue.pending(), oldestMs: queue.oldestPendingMs(), ...queue.counters() });
  }
  assert.equal(queue.pending(), batch === 1 ? 100 : 0);
  return { arrivalRate: 20, availableFps: 10, batch, series };
});
const scheduler = new Scheduler();
const callbackBatches = [];
const queue = new FrameTelemetryQueue(points => { callbackBatches.push(points.length); scheduler.time += 80; }, 20, 5, scheduler);
queue.enqueue(Array.from({ length: 40 }, (_, sequence) => ({ sequence })));
const before = scheduler.time;
scheduler.frame();
assert.equal(scheduler.time - before, 80);
assert.equal(queue.pending(), 20);
assert.deepEqual(callbackBatches, [20]);
const result = {
  note: 'Actual queue executed with injected deterministic virtual clock; these are mechanism assertions, not measured FPS or CPU milliseconds.',
  throughput,
  budget: { extractionBudgetMs: 5, callbackConfiguredMs: 80, wholeFlushVirtualMs: scheduler.time - before, consumedPoints: callbackBatches[0], pending: queue.pending(), passed: true },
};
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'mechanism.json'), JSON.stringify(result, null, 2));
console.log('PASS: arrival/service conservation; 5ms extraction budget does not bound 80ms callback');
