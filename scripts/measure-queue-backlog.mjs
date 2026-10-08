/** Controlled production-page experiment. Requires Node >=24 and an existing web build. */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, readFile, writeFile, appendFile, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(process.env.QHZHC_QUEUE_OUTPUT || path.join(root, 'reports/queue-backlog-2026-10-08'));
const seconds = Number(process.env.QHZHC_QUEUE_SECONDS || 12);
const repetitions = Number(process.env.QHZHC_QUEUE_REPEATS || 3);
const selected = process.env.QHZHC_QUEUE_CASES?.split(',');
const diagnosticCases = process.env.QHZHC_QUEUE_DIAGNOSTIC === '1';
const captureTrace = process.env.QHZHC_QUEUE_TRACE === '1';
const probeEnqueue = process.env.QHZHC_QUEUE_PROBE === '1';
const centeredMap = process.env.QHZHC_QUEUE_CENTER_MAP === '1';
const chromePath = process.env.QHZHC_BENCH_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!Number.isInteger(repetitions) || repetitions < 1 || !Number.isFinite(seconds) || seconds < 3) throw Error('Invalid duration/repetitions');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const cases = [
  ...[1000, 10000, 50000].map(pending => ({ id: `paused-q${pending}`, history: 1000, pending, batch: 1, mode: 'paused' })),
  ...[1000, 10000, 50000].map(pending => ({ id: `active-q${pending}`, history: 200, pending, batch: 1, mode: 'full' })),
  { id: 'history1000', history: 1000, pending: 10000, batch: 1, mode: 'full' },
  { id: 'history6000', history: 6000, pending: 10000, batch: 1, mode: 'full' },
  { id: 'map-frozen6000', history: 6000, pending: 10000, batch: 1, mode: 'map-frozen' },
  { id: 'charts-frozen6000', history: 6000, pending: 10000, batch: 1, mode: 'charts-frozen' },
  { id: 'empty6000', history: 6000, pending: 10000, batch: 1, mode: 'empty' },
  ...[5, 20].map(batch => ({ id: `batch${batch}`, history: 1000, pending: 10000, batch, mode: 'full' })),
  ...[1, 20].map(batch => ({ id: `stream20-b${batch}`, history: 6000, pending: 0, batch, mode: 'full', rate: 20 })),
  ...(diagnosticCases ? [
    { id: 'raw-paused-q50000', history: 1000, pending: 50000, batch: 1, mode: 'paused', rawQueue: true },
    { id: 'raw-active-q50000', history: 200, pending: 50000, batch: 1, mode: 'full', rawQueue: true },
  ] : []),
].filter(c => !selected || selected.includes(c.id));
if (!cases.length) throw Error('No matching cases');
const quantile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const stat = values => ({ n: values.length, mean: mean(values), p50: quantile(values, .5), p95: quantile(values, .95), max: values.length ? Math.max(...values) : null });

class CDP {
  constructor(socket) {
    this.socket = socket; this.id = 0; this.pending = new Map(); this.listeners = new Map();
    socket.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.id) {
        const pending = this.pending.get(msg.id); if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) pending.reject(Error(JSON.stringify(msg.error))); else pending.resolve(msg.result);
      } else for (const handler of this.listeners.get(msg.method) || []) handler(msg.params);
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    return new CDP(socket);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 60000);
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
    return response.result?.value;
  }
  close() { this.socket.close(); }
}
async function until(check, label, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const value = await check().catch(() => null); if (value) return value; await wait(200); }
  throw Error(`Timeout: ${label}`);
}
async function ensurePortFree(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
}
async function heap(cdp) {
  const result = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(result.metrics.map(x => [x.name, x.value]));
}

// Executed in Chrome; uses the production queue and production publishFrame callback.
async function prepareScenario(config) {
  const find = vm => vm && (Object.prototype.hasOwnProperty.call(vm.$data || {}, 'realtimeFrameLimit') ? vm : vm.$children.map(find).find(Boolean));
  const vm = find(document.querySelector('#app').__vue__);
  window.__queueVm = vm;
  const client = vm.realtimeClient;
  client.stop();
  vm.stopStatsPolling();
  vm.mapType = 1; vm.viewFlag = false; vm.statsPanelShow = false;
  vm.realtimeHistoryWindowMin = 0;
  vm.clearData();
  await vm.$nextTick();
  const startTime = Date.parse('2026-10-08T04:00:00.000Z');
  const point = index => ({
    sequence: index + 100001, robotId: 'QH-ZHC-01', sampledAt: new Date(startTime + index * 50).toISOString(),
    longitude: 116.32 + Math.sin(index * .006) * .003, latitude: 40.00 + Math.cos(index * .006) * .003,
    altitude: 42, speed: 20, heading: index % 360,
    priCo2: 420 + Math.sin(index * .07) * 5, priCh4: 2 + Math.cos(index * .03) * .1,
    priC2h6: .01, priCo: .2, priN2o: .3, priH2o: 1,
    picarroCo2: 421 + Math.sin(index * .07) * 5, picarroCh4: 2.05 + Math.cos(index * .03) * .1,
    picarroH2o: 1, windSpeed: 2, windDirection: 90, temperature: 25, humidity: 50, pressure: 1013,
  });
  // Capture the project's exact wire-to-legacy conversion, excluding render writes during fixture creation.
  const savedPacket = client.options.onPacket;
  let legacy;
  client.options.onPacket = packet => { legacy = packet.data; };
  client.publishFrame(Array.from({ length: config.history }, (_, i) => point(i - config.history)));
  client.options.onPacket = savedPacket;
  vm.applyRealtimeInitialWindow({ code: 200, message: 'controlled fixture', data: legacy });
  await vm.$nextTick();
  if (config.centeredMap) {
    vm.$refs.childMap.map.getView().setCenter(vm.$refs.childMap.to3857([116.32, 40.00]));
    vm.$refs.childMap.map.getView().setZoom(16);
  }
  await new Promise(resolve => setTimeout(resolve, 5000));
  const physical = vm.$refs.childMap.pointSource.getFeatures().length;
  if (physical !== config.history || vm.gasdata.data.length !== config.history) throw Error(`Fixture mismatch: ${physical}/${vm.gasdata.data.length}`);
  const queue = config.rawQueue ? new client.frameQueue.constructor(points => client.publishFrame(points), config.batch, 5) : client.frameQueue;
  queue.stop(); queue.pause(); queue.setMaxPerFrame(config.batch);
  const incoming = Array.from({ length: config.pending }, (_, i) => point(i));
  const enqueueStarted = performance.now();
  if (incoming.length) queue.enqueue(incoming);
  const enqueueMs = performance.now() - enqueueStarted;
  const enqueue20Ms = [];
  if (config.probeEnqueue) {
    for (let probe = 0; probe < 20; probe++) {
      const probePoints = Array.from({ length: 20 }, (_, i) => point(config.pending + probe * 20 + i));
      const before = performance.now(); queue.enqueue(probePoints); enqueue20Ms.push(performance.now() - before);
      // Benchmark-only rewind: retain exactly the original N pending points for the next trial.
      queue.queue.length -= 20; queue.enqueuedAt.length -= 20; queue.totalEnqueued -= 20;
    }
  }
  const bench = { config, vm, queue, point, client, active: false, started: Infinity, ended: -Infinity, frames: [], runtime: [], loafs: [], tasks: [],
    timerDelay: [], submit: [], flush: [], chart: [], map: [], errors: [], visibility: [], nextIndex: 0,
    initial: { pending: queue.pending(), history: vm.gasdata.data.length, physical, map: vm.getRealtimeMapPoints().length, enqueueMs, enqueue20Ms,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      mapView: { center: vm.$refs.childMap.map.getView().getCenter(), zoom: vm.$refs.childMap.map.getView().getZoom(),
        visiblePoints: vm.$refs.childMap.pointSource.getFeaturesInExtent(vm.$refs.childMap.map.getView().calculateExtent(vm.$refs.childMap.map.getSize())).length },
      observed: { client: !!client.__ob__, queue: !!queue.__ob__, queueArray: !!queue.queue.__ob__,
        firstPoint: !!queue.peekNext()?.__ob__, mapStore: !!vm.realtimeMapStore.points.__ob__ } } };
  window.__queueBench = bench;
  if (config.mode === 'empty') vm.emptyRender = true;
  if (config.mode === 'map-frozen') vm.$refs.childMap.drawRealtimeBatch = () => {};
  const children = node => [node, ...node.$children.flatMap(children)];
  const charts = children(vm).filter(child => child.$options.name === 'VisualizationCharts');
  if (config.mode === 'charts-frozen') for (const chart of charts) chart.scheduleUpdateOptions = () => {};
  const wrap = (object, method, values) => {
    const original = object[method];
    object[method] = function (...args) { const start = performance.now(); const result = original.apply(this, args); if (bench.active) values.push(performance.now() - start); return result; };
  };
  wrap(queue, 'flush', bench.flush);
  wrap(vm, 'handleRealtimePacket', bench.submit);
  // onPacket was bound when the client was created, so explicitly route through the instrumented method.
  client.options.onPacket = packet => vm.handleRealtimePacket(packet);
  wrap(vm.$refs.childMap, 'drawRealtimeBatch', bench.map);
  for (const chart of charts) wrap(chart, 'updateOptions', bench.chart);
  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      if (entry.startTime < bench.started || entry.startTime >= bench.ended) continue;
      if (entry.entryType === 'longtask') bench.tasks.push(entry.toJSON());
      else bench.loafs.push({ ...entry.toJSON(), scripts: Array.from(entry.scripts || [], script => script.toJSON()) });
    }
  });
  observer.observe({ entryTypes: ['longtask', 'long-animation-frame'] });
  bench.observer = observer;
  bench.visibilityHandler = () => bench.visibility.push({ at: performance.now(), value: document.visibilityState });
  document.addEventListener('visibilitychange', bench.visibilityHandler);
  return { ...bench.initial, charts: charts.length, visibility: document.visibilityState, supported: PerformanceObserver.supportedEntryTypes };
}
async function runScenario(duration) {
  const b = window.__queueBench;
  b.started = performance.now(); b.ended = Infinity; b.active = true;
  performance.mark('queue-bench-start');
  const tick = timestamp => { if (!b.active) return; b.frames.push(timestamp); b.raf = requestAnimationFrame(tick); };
  b.raf = requestAnimationFrame(tick);
  const sample = () => {
    if (!b.active) return;
    const now = performance.now();
    b.runtime.push({ at: now, pending: b.queue.pending(), oldestMs: b.queue.oldestPendingMs(),
      ...b.queue.counters(), chartPoints: b.vm.gasdata.data.length, mapPoints: b.vm.getRealtimeMapPoints().length,
      physicalPoints: b.vm.$refs.childMap.pointSource.getFeatures().length, heap: performance.memory?.usedJSHeapSize });
    b.sampleTimer = setTimeout(sample, 500);
  };
  sample();
  let due = performance.now() + 100;
  const timer = () => { if (!b.active) return; b.timerDelay.push(Math.max(0, performance.now() - due)); due = performance.now() + 100; b.delayTimer = setTimeout(timer, 100); };
  b.delayTimer = setTimeout(timer, 100);
  if (b.config.mode !== 'paused') b.queue.resume();
  if (b.config.rate) {
    b.arrivalTimer = setInterval(() => b.queue.enqueue(Array.from({ length: b.config.rate }, () => b.point(b.nextIndex++))), 1000);
  }
  await new Promise(resolve => setTimeout(resolve, duration * 1000));
  b.ended = performance.now(); b.active = false; b.queue.pause();
  performance.mark('queue-bench-end');
  for (const id of [b.sampleTimer, b.delayTimer]) clearTimeout(id);
  clearInterval(b.arrivalTimer); cancelAnimationFrame(b.raf);
  await new Promise(resolve => setTimeout(resolve, 200));
  for (const entry of b.observer.takeRecords()) {
    if (entry.startTime < b.started || entry.startTime >= b.ended) continue;
    if (entry.entryType === 'longtask') b.tasks.push(entry.toJSON());
    else b.loafs.push({ ...entry.toJSON(), scripts: Array.from(entry.scripts || [], script => script.toJSON()) });
  }
  b.observer.disconnect(); document.removeEventListener('visibilitychange', b.visibilityHandler);
  const result = { config: b.config, started: b.started, ended: b.ended, initial: b.initial,
    final: { pending: b.queue.pending(), oldestMs: b.queue.oldestPendingMs(), ...b.queue.counters(),
      chartPoints: b.vm.gasdata.data.length, mapPoints: b.vm.getRealtimeMapPoints().length,
      physicalPoints: b.vm.$refs.childMap.pointSource.getFeatures().length, signal: b.vm.signalState },
    frames: b.frames, runtime: b.runtime, loafs: b.loafs, tasks: b.tasks, timerDelay: b.timerDelay,
    submit: b.submit, flush: b.flush, chart: b.chart, map: b.map, visibility: b.visibility,
    visibleAtEnd: document.visibilityState };
  if (result.final.enqueued - result.final.consumed !== result.final.pending) throw Error('Queue conservation failed');
  if (b.visibility.length || document.visibilityState !== 'visible') throw Error('Hidden page invalidates frame samples');
  return result;
}

function summarize(raw) {
  const duration = (raw.ended - raw.started) / 1000;
  const intervals = raw.frames.slice(1).map((x, i) => x - raw.frames[i]);
  return {
    case: raw.config.id, repeat: raw.config.repeat, config: raw.config, durationSeconds: duration,
    rafFps: raw.frames.length / duration, frameIntervalMs: stat(intervals),
    over33msIntervals: intervals.filter(x => x > 33.34).length,
    consumedPerSecond: raw.final.consumed / duration, initial: raw.initial, final: raw.final,
    loafDurationMs: stat(raw.loafs.map(x => x.duration)), loafBlockingMs: raw.loafs.reduce((s, x) => s + x.blockingDuration, 0),
    longTaskMs: stat(raw.tasks.map(x => x.duration)), longTaskBlockingMs: raw.tasks.reduce((s, x) => s + Math.max(0, x.duration - 50), 0),
    timerDelayMs: stat(raw.timerDelay), synchronousSubmitMs: stat(raw.submit), synchronousFlushMs: stat(raw.flush),
    chartUpdateMs: stat(raw.chart), mapBatchUpdateMs: stat(raw.map),
    heap: raw.heap, runtimeErrors: raw.runtimeErrors,
  };
}

await mkdir(output, { recursive: true });
if ((await readdir(output)).length) throw Error('Use a new empty output directory');
await ensurePortFree(18080);
const profile = await mkdtemp(path.join(os.tmpdir(), 'qhzhc-queue-'));
await mkdir(path.join(root, '.data'), { recursive: true });
const dbDirectory = await mkdtemp(path.join(root, '.data', 'queue-experiment-'));
let server, chrome, cdp;
const summaries = [];
try {
  server = spawn(process.execPath, ['--import', 'tsx', 'QHZHC_Server/src/server/index.ts'], {
    cwd: root, env: { ...process.env, PORT: '18080', HOST: '127.0.0.1', DATABASE_PATH: path.join(dbDirectory, 'experiment.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  server.stderr.on('data', data => appendFile(path.join(output, 'server.log'), data));
  server.stdout.on('data', data => appendFile(path.join(output, 'server.log'), data));
  await until(async () => (await fetch('http://127.0.0.1:18080')).ok, 'isolated server');
  const login = await fetch('http://127.0.0.1:18080/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'Admin@123456' }) });
  const auth = await login.json();
  if (!login.ok || !auth.accessToken) throw Error('Isolated login failed');
  await fetch('http://127.0.0.1:18080/api/admin/simulator/action', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + auth.accessToken }, body: JSON.stringify({ action: 'pause' }) });
  chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--window-size=1440,900',
    '--disable-features=BackForwardCache', '--enable-precise-memory-info', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const port = await until(async () => (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0], 'Chrome debugging port');
  let target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  cdp = await CDP.connect(target.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Performance.enable');
  await cdp.send('Network.enable');
  // Remove third-party weather and basemap network variation; local vector/canvas rendering remains real.
  await cdp.send('Network.setBlockedURLs', { urls: ['https://*', 'http://*.tianditu.gov.cn/*'] });
  const errors = [];
  cdp.listeners.set('Runtime.exceptionThrown', [event => errors.push(event.exceptionDetails.text + ': ' + event.exceptionDetails.exception?.description)]);
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:18080/#/login' });
  await until(() => cdp.evaluate("document.readyState === 'complete' && !!document.querySelector('#app')?.__vue__"), 'login UI');
  await cdp.evaluate(`(async () => { const r = await fetch('/api/auth/login', { method:'POST', headers:{'content-type':'application/json'}, credentials:'include', body: JSON.stringify({ username:'admin', password:'Admin@123456' }) }); const data=await r.json(); localStorage.setItem('user', JSON.stringify(data.user)); return r.status; })()`);
  const sourceFiles = ['QHZHC_Web/src/views/DataVisualization/services/FrameTelemetryQueue.ts', 'QHZHC_Web/src/views/DataVisualization/dataVisualization.vue', 'QHZHC_Web/src/views/DataVisualization/components/Charts.vue', 'QHZHC_Web/src/views/DataVisualization/components/PlanimetricMap.vue'];
  const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')])));
  await writeFile(path.join(output, 'metadata.json'), JSON.stringify({ createdAt: new Date().toISOString(), browser: await cdp.send('Browser.getVersion'), node: process.version,
    cpu: os.cpus()[0].model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem(), os: `${os.platform()} ${os.release()}`,
    requestedWindow: '1440x900', seconds, repetitions, cases, sourceHashes,
    note: 'Fresh production build; isolated SQLite; simulated WebSocket conversion and original frameQueue.publishFrame path; deterministic first-N prefix, no network arrival except stream cases; external basemap blocked.' }, null, 2));
  // Rotate/reverse each repetition so case order does not always favor small queues.
  for (let repeat = 1; repeat <= repetitions; repeat++) {
    const order = repeat % 2 ? cases.slice((repeat - 1) * 3).concat(cases.slice(0, (repeat - 1) * 3)) : [...cases].reverse();
    for (const scenario of order) {
      const config = { ...scenario, repeat, probeEnqueue, centeredMap };
      // Closing the old target avoids retained page contexts and BFCache heap across trials.
      await cdp.send('Target.closeTarget', { targetId: target.id }); cdp.close();
      target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      cdp = await CDP.connect(target.webSocketDebuggerUrl);
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Performance.enable');
      await cdp.send('Network.enable');
      await cdp.send('Network.setBlockedURLs', { urls: ['https://*', 'http://*.tianditu.gov.cn/*'] });
      cdp.listeners.set('Runtime.exceptionThrown', [event => errors.push(event.exceptionDetails.text + ': ' + event.exceptionDetails.exception?.description)]);
      await cdp.send('Page.navigate', { url: 'http://127.0.0.1:18080/?run=' + Date.now() + '#/dataVisualization' });
      await until(() => cdp.evaluate(`(() => { const find = vm => vm && (Object.prototype.hasOwnProperty.call(vm.$data || {}, 'realtimeFrameLimit') ? vm : vm.$children.map(find).find(Boolean)); return !!find(document.querySelector('#app')?.__vue__)?.realtimeClient; })()`), 'visualization client');
      const ready = await cdp.evaluate(`(${prepareScenario.toString()})(${JSON.stringify(config)})`);
      if (!ready.supported.includes('long-animation-frame') || !ready.supported.includes('longtask')) throw Error('Missing performance observers');
      await cdp.send('HeapProfiler.collectGarbage');
      const heapBefore = await heap(cdp);
      errors.length = 0;
      console.log(`repeat ${repeat}/${repetitions} ${scenario.id}: initial pending ${ready.pending}, rendered ${ready.physical}`);
      if (captureTrace) {
        await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start');
        await cdp.send('Tracing.start', { categories: 'devtools.timeline,v8,blink.user_timing,disabled-by-default-v8.gc', transferMode: 'ReturnAsStream' });
      }
      const raw = await cdp.evaluate(`(${runScenario.toString()})(${seconds})`);
      if (captureTrace) {
        const { profile: cpuProfile } = await cdp.send('Profiler.stop');
        await writeFile(path.join(output, `${scenario.id}-r${repeat}.cpuprofile`), JSON.stringify(cpuProfile));
        const completed = new Promise(resolve => cdp.listeners.set('Tracing.tracingComplete', [resolve]));
        await cdp.send('Tracing.end');
        const { stream } = await completed;
        let traceText = '';
        while (true) { const chunk = await cdp.send('IO.read', { handle: stream }); traceText += chunk.data; if (chunk.eof) break; }
        await cdp.send('IO.close', { handle: stream });
        await writeFile(path.join(output, `${scenario.id}-r${repeat}-trace.json`), traceText);
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(path.join(output, `${scenario.id}-r${repeat}.png`), Buffer.from(screenshot.data, 'base64'));
      }
      raw.heap = { before: heapBefore, after: await heap(cdp) };
      raw.runtimeErrors = [...errors];
      const summary = summarize(raw);
      summaries.push(summary);
      await writeFile(path.join(output, `${scenario.id}-r${repeat}.json`), JSON.stringify(raw));
      await writeFile(path.join(output, 'summary.json'), JSON.stringify(summaries, null, 2));
      await appendFile(path.join(output, 'progress.jsonl'), JSON.stringify({ case: scenario.id, repeat, at: new Date().toISOString(), fps: summary.rafFps, pending: raw.final.pending, consumed: raw.final.consumed, loafP95: summary.loafDurationMs.p95 }) + '\n');
      console.log(`  fps=${summary.rafFps.toFixed(2)}, consumed=${raw.final.consumed}, pending=${raw.final.pending}, LoAF p95=${summary.loafDurationMs.p95 === null ? 'none' : summary.loafDurationMs.p95 + 'ms'}`);
    }
  }
  console.log(`Completed ${summaries.length} trials: ${output}`);
} finally {
  cdp?.close(); chrome?.kill(); server?.kill();
  await wait(1000);
  // Only remove this script's verified temporary Chrome profile. Experiment DB remains in ignored .data.
  if (profile.startsWith(path.join(os.tmpdir(), 'qhzhc-queue-'))) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}
