import { spawn } from "node:child_process";
import { appendFile, mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";

const seconds = Number(process.env.QHZHC_BENCH_SECONDS || 60);
const webUrl = process.env.QHZHC_BENCH_WEB_URL || "http://127.0.0.1:9527";
const apiUrl = process.env.QHZHC_BENCH_API_URL || "http://127.0.0.1:18080";
const username = process.env.QHZHC_BENCH_USER || "admin";
const password = process.env.QHZHC_BENCH_PASSWORD;
const chromePath = process.env.QHZHC_BENCH_CHROME ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
// 地图模式：QHZHC_BENCH_MAP_TYPE=2 切到 Cesium 三维，其余情况保持二维。
const mapType = Number(process.env.QHZHC_BENCH_MAP_TYPE) === 2 ? 2 : 1;
const mapLabel = mapType === 2 ? "3D" : "2D";
// 每帧消费点数：批量渲染实验的唯一自变量，默认 1。取整数，最小 1。
const frameLimit = Math.max(
  1,
  Math.floor(Number(process.env.QHZHC_BENCH_FRAME_LIMIT) || 1),
);
// 订阅档位：服务端每秒下发给该连接的点数上限，0 表示该秒全部点。取值必须落在服务端允许集合内。
const rawPointLimit = Number(process.env.QHZHC_BENCH_POINT_LIMIT);
const pointLimit = [0, 1, 2, 5, 10, 20].includes(rawPointLimit) ? rawPointLimit : 0;
const historyCount = Math.max(0, Math.floor(Number(process.env.QHZHC_BENCH_HISTORY_COUNT) || 0));
const fixturePath = process.env.QHZHC_BENCH_FIXTURE;
const streaming = process.env.QHZHC_BENCH_STREAMING === "1" || historyCount > 0;
const outputDir = path.resolve(
  process.env.QHZHC_BENCH_OUTPUT ||
    "reports/realtime-rendering/loaf-" + new Date().toISOString().replace(/[:.]/g, "-"),
);

if (!password) throw new Error("Set QHZHC_BENCH_PASSWORD in the process environment");
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 3600) {
  throw new Error("QHZHC_BENCH_SECONDS must be between 1 and 3600");
}
if (streaming && (pointLimit !== 1 || frameLimit !== 1)) {
  throw new Error("Streaming comparison requires point limit=1 and frame limit=1");
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jsonLine = (value) => JSON.stringify(value) + "\n";
const appendRecords = async (name, records) => {
  if (records.length) {
    await appendFile(path.join(outputDir, name), records.map(jsonLine).join(""), "utf8");
  }
};
const toLegacyPoint = (point) => ({
  sequence: point.sequence,
  robot_id: point.robotId,
  time: point.sampledAt,
  longitude: point.longitude,
  latitude: point.latitude,
  geo_location: [point.longitude, point.latitude],
  altitude: point.altitude,
  speed: point.speed,
  heading: point.heading,
  speed_direction: point.windDirection,
  pri_co2: point.priCo2,
  pri_ch4: point.priCh4,
  pri_c2h6: point.priC2h6,
  pri_co: point.priCo,
  pri_n2o: point.priN2o,
  pri_h2o: point.priH2o,
  picarro_hp_12ch4_dry: point.picarroCh4,
  picarro_hr_12ch4_dry: point.picarroCh4,
  picarro_12co2_dry: point.picarroCo2,
  picarro_delta_ich4_raw: (point.picarroCh4 - point.priCh4) * 100,
  picarro_h2o: point.picarroH2o,
  wind_speed: point.windSpeed,
  wind_direction: point.windDirection,
  weather_data: {
    temp: point.temperature,
    humidity: point.humidity,
    pressure: point.pressure,
    windSpeed: point.windSpeed,
    windDirection: point.windDirection,
  },
});
const validMapPoint = (point) =>
  point && Number.isFinite(Number(point.longitude)) &&
  Number.isFinite(Number(point.latitude)) &&
  Array.isArray(point.geo_location) && point.geo_location.length === 2;
const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
};

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new Cdp(socket);
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || "Browser evaluation failed");
    }
    return response.result?.value;
  }
  close() { this.socket.close(); }
}

async function waitFor(check, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await check().catch(() => null);
    if (value) return value;
    await delay(250);
  }
  throw new Error("Timed out waiting for " + label);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  if ((await readdir(outputDir)).length) {
    throw new Error("Output directory is not empty: " + outputDir);
  }
  const login = await fetch(apiUrl + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok) throw new Error("API login failed: HTTP " + login.status);
  const { accessToken } = await login.json();
  const api = async (method, endpoint, body) => {
    const response = await fetch(apiUrl + endpoint, {
      method,
      headers: {
        authorization: "Bearer " + accessToken,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(endpoint + ": HTTP " + response.status);
    return response.json();
  };
  const original = (await api("GET", "/api/admin/simulator")).status;
  const profile = await mkdtemp(path.join(os.tmpdir(), "qhzhc-loaf-"));
  let chrome, cdp, changed = false;
  let fixturePoints = null;
  let fixtureHash = null;
  try {
    await api("POST", "/api/admin/simulator/action", { action: "pause" });
    changed = true;
    if (streaming) {
      if (historyCount > 0) {
        if (fixturePath) {
          const saved = JSON.parse(await readFile(path.resolve(fixturePath), "utf8"));
          fixturePoints = saved.points;
        } else {
          const fetched = await api("GET", "/api/telemetry/latest?limit=" + historyCount);
          fixturePoints = fetched.points.map(toLegacyPoint);
        }
        if (!Array.isArray(fixturePoints) || fixturePoints.length !== historyCount ||
            !fixturePoints.every(validMapPoint)) {
          throw new Error("The benchmark fixture must contain exactly " + historyCount + " valid map points");
        }
        const fixtureText = JSON.stringify({ points: fixturePoints });
        fixtureHash = createHash("sha256").update(fixtureText).digest("hex");
        if (!fixturePath) {
          await writeFile(path.join(outputDir, "fixture.json"), fixtureText, "utf8");
        }
      }
      await writeFile(path.join(outputDir, "metadata.json"), JSON.stringify({
        createdAt: new Date().toISOString(),
        phase: process.env.QHZHC_BENCH_PHASE || "unspecified",
        map: mapLabel,
        historyCount,
        rate: pointLimit,
        batch: frameLimit,
        simulatorPointsPerSecond: 20,
        seconds,
        fixtureSha256: fixtureHash,
        fixtureSource: historyCount === 0 ? "empty scene" :
          (fixturePath ? path.resolve(fixturePath) : "local telemetry latest " + historyCount),
        browser: "Chrome headless",
        viewport: "1440x900",
      }, null, 2), "utf8");
      await appendRecords("events.jsonl", [{
        type: "prepared", at: new Date().toISOString(), fixtureSha256: fixtureHash,
      }]);
      await appendFile(path.join(outputDir, "progress.md"),
        "# " + historyCount + " 点起步的单点渲染采样过程\n\n运行中的进度每 10 秒追加，原始 FPS、LoAF 和运行状态逐次写入 JSONL。\n\n",
        "utf8");
    }
    chrome = spawn(chromePath, [
      "--headless=new", "--no-first-run", "--no-default-browser-check",
      "--window-size=1440,900", "--remote-debugging-port=0",
      "--user-data-dir=" + profile, "about:blank",
    ], { stdio: "ignore", windowsHide: true });
    const port = Number(await waitFor(async () => {
      const file = await readFile(path.join(profile, "DevToolsActivePort"), "utf8");
      return file.trim().split(/\r?\n/)[0];
    }, 15_000, "Chrome DevTools port"));
    const targetResponse = await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(webUrl + "/#/login")}`,
      { method: "PUT" },
    );
    if (!targetResponse.ok) throw new Error("Could not create Chrome target");
    cdp = await Cdp.connect((await targetResponse.json()).webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await waitFor(
      () => cdp.evaluate("document.readyState === 'complete' && !!document.querySelector('#app')"),
      30_000, "login page",
    );
    const browserLogin = await cdp.evaluate(`(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(${JSON.stringify({ username, password })})
      });
      if (!response.ok) return response.status;
      const data = await response.json();
      localStorage.setItem("user", JSON.stringify(data.user));
      return 200;
    })()`);
    if (browserLogin !== 200) throw new Error("Browser login failed: HTTP " + browserLogin);
    await cdp.send("Page.navigate", { url: webUrl + "/#/dataVisualization" });
    await waitFor(() => cdp.evaluate(`(() => {
      const root = document.querySelector("#app")?.__vue__;
      const find = (vm) => vm && (vm.$data &&
        Object.prototype.hasOwnProperty.call(vm.$data, "realtimeFrameLimit")
          ? vm : vm.$children.map(find).find(Boolean));
      window.__qhzhcBenchVm = find(root);
      return !!window.__qhzhcBenchVm?.realtimeClient;
    })()`), 30_000, "realtime visualization");

    const setup = await cdp.evaluate(`(() => {
      const vm = window.__qhzhcBenchVm;
      vm.mapType = ${mapType};
      vm.realtimeFrameLimit = ${frameLimit};
      vm.changeRealtimeFrameLimit(${frameLimit});
      vm.realtimePointLimit = ${pointLimit};
      vm.changeRealtimePointLimit(${pointLimit});
      vm.statsPanelShow = true;
      if (!PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
        return { supported: false };
      }
      const bench = { loafs: [], fps: [], runtime: [], active: true,
        frames: 0, windowStart: performance.now(), measureStart: Infinity };
      bench.drain = () => ({
        loafs: bench.loafs.splice(0),
        fps: bench.fps.splice(0),
        runtime: bench.runtime.splice(0),
      });
      bench.recordLoaf = (entry) => {
        if (entry.startTime < bench.measureStart) return;
        bench.loafs.push({
            startTime: entry.startTime, duration: entry.duration,
            blockingDuration: entry.blockingDuration,
            renderStart: entry.renderStart,
            styleAndLayoutStart: entry.styleAndLayoutStart,
            firstUIEventTimestamp: entry.firstUIEventTimestamp,
            scripts: (entry.scripts || []).map((script) => ({
              startTime: script.startTime, duration: script.duration,
              executionStart: script.executionStart,
              forcedStyleAndLayoutDuration: script.forcedStyleAndLayoutDuration,
              pauseDuration: script.pauseDuration,
              invoker: script.invoker, invokerType: script.invokerType,
              sourceFunctionName: script.sourceFunctionName,
              sourceURL: script.sourceURL,
              sourceCharPosition: script.sourceCharPosition,
            })),
        });
      };
      bench.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) bench.recordLoaf(entry);
      });
      bench.observer.observe({ type: "long-animation-frame" });
      bench.tick = (timestamp) => {
        if (!bench.active) return;
        bench.frames++;
        const elapsed = timestamp - bench.windowStart;
        if (elapsed >= 1000) {
          bench.fps.push({ atMs: timestamp, fps: bench.frames * 1000 / elapsed });
          bench.frames = 0;
          bench.windowStart = timestamp;
        }
        bench.rafId = requestAnimationFrame(bench.tick);
      };
      bench.rafId = requestAnimationFrame(bench.tick);
      bench.timer = setInterval(() => {
        const stats = vm.realtimeClient?.runtimeStats();
        bench.runtime.push({
          atMs: performance.now(), fps: vm.fps,
          pending: stats?.pending, batchSize: stats?.batchSize,
          arrivalRate: stats?.arrivalRate, consumeRate: stats?.consumeRate,
          totalReceived: stats?.totalReceived, totalConsumed: stats?.totalConsumed,
          oldestPendingMs: stats?.oldestPendingMs,
          mapPoints: typeof vm.getRealtimeMapPoints === "function"
            ? vm.getRealtimeMapPoints().length : vm.mapList.length,
          renderP95Ms: vm.renderP95Ms,
        });
      }, 1000);
      window.__qhzhcBench = bench;
      return { supported: true, initialMapPoints: typeof vm.getRealtimeMapPoints === "function"
        ? vm.getRealtimeMapPoints().length : vm.mapList.length };
    })()`);
    if (!setup.supported) throw new Error("Chrome lacks long-animation-frame support");
    // 三维组件由 v-if 创建：切到 3D 后必须等 Cesium Viewer 真正就绪再进入采样，
    // 否则 Viewer 初始化与着色器编译会被算进采样窗口，污染前若干秒。
    if (mapType === 2) {
      await waitFor(() => cdp.evaluate(`(() => {
        const map = window.__qhzhcBenchVm?.$refs?.child3DMap;
        return !!(map && map.viewer && !map.viewer.isDestroyed());
      })()`), 30_000, "Cesium viewer");
      await cdp.evaluate(`(() => {
        const vm = window.__qhzhcBenchVm;
        const map = vm.$refs.child3DMap;
        map.updatedMapSize();
        map.changeView(vm.viewFlag);
        return true;
      })()`);
    }
    // 修改订阅档位会主动断开当前连接并以新参数重连（setMaxPointsPerSecond 的内部实现）。
    // 必须等连接真正恢复后再进入采样，否则采样窗口会包含断连与补发过程。
    if (pointLimit !== 0) {
      await delay(2000);
      try {
        await waitFor(
          () => cdp.evaluate(`(() => {
            const client = window.__qhzhcBenchVm?.realtimeClient;
            return !!(client && client.socket && client.socket.readyState === 1);
          })()`),
          20_000,
          "realtime reconnect",
        );
      } catch (error) {
        const state = await cdp.evaluate(`(() => {
          const vm = window.__qhzhcBenchVm;
          const client = vm && vm.realtimeClient;
          return {
            connected: vm ? vm.connected : null,
            signalState: vm ? vm.signalState : null,
            searchType: vm ? vm.searchType : null,
            visibility: document.visibilityState,
            online: navigator.onLine,
            hasSocket: !!(client && client.socket),
            readyState: client && client.socket ? client.socket.readyState : null,
            stopped: client ? client.stopped : null,
            totalReceived: client ? client.totalReceived : null,
          };
        })()`);
        throw new Error("reconnect failed: " + JSON.stringify(state) + " (" + error.message + ")");
      }
    }
     // 流式对照可以从固定历史或空场景起步；旧实验模式保持兼容。
     let clearedPoints;
     if (streaming && historyCount > 0) {
      const expression = "(async () => { " +
        "const vm = window.__qhzhcBenchVm;" +
        "vm.$refs.childMap?.removeTC?.();" +
        "vm.$refs.child3DMap?.remove?.();" +
        "vm.mapList = []; vm.realtimeBatch = [];" +
        "vm.applyRealtimeInitialWindow({ code: 200, message: 'fixture', data: " +
        JSON.stringify(fixturePoints) + " });" +
        "await vm.$nextTick();" +
        "return typeof vm.getRealtimeMapPoints === 'function' ?" +
        "vm.getRealtimeMapPoints().length : vm.mapList.length;" +
        "})()";
      clearedPoints = await cdp.evaluate(expression);
      if (clearedPoints !== historyCount) {
        throw new Error("History load count mismatch: " + clearedPoints);
      }
      await waitFor(() => cdp.evaluate("(() => {" +
        "const vm = window.__qhzhcBenchVm;" +
        "const physical = vm.mapType === 1 ?" +
        "vm.$refs.childMap?.pointSource?.getFeatures().length :" +
        "vm.$refs.child3DMap?.viewer?.entities?.values?.filter(" +
        "entity => String(entity.id).startsWith('realtime-bar-')).length;" +
         "return physical === " + historyCount + " && vm.realtimeClient?.runtimeStats().pending === 0;" +
         "})()"), 120_000, "rendered historical points and empty queue");
      await delay(5_000);
      await appendRecords("events.jsonl", [{
        type: "history_ready", at: new Date().toISOString(), points: clearedPoints,
      }]);
    } else if (streaming) {
      clearedPoints = await cdp.evaluate("(async () => {" +
        "const vm = window.__qhzhcBenchVm;" +
        "vm.clearData();" +
        "await vm.$nextTick();" +
        "return typeof vm.getRealtimeMapPoints === 'function' ?" +
        "vm.getRealtimeMapPoints().length : vm.mapList.length;" +
        "})()");
      if (clearedPoints !== 0) throw new Error("Empty-scene reset left map points: " + clearedPoints);
      await waitFor(() => cdp.evaluate("(() => {" +
        "const vm = window.__qhzhcBenchVm;" +
        "const physical = vm.mapType === 1 ?" +
        "vm.$refs.childMap?.pointSource?.getFeatures().length :" +
        "vm.$refs.child3DMap?.viewer?.entities?.values?.length;" +
        "return physical === 0 && vm.realtimeClient?.runtimeStats().pending === 0;" +
        "})()"), 30_000, "empty map and empty queue");
      await delay(5_000);
      await appendRecords("events.jsonl", [{
        type: "scene_ready", at: new Date().toISOString(), points: 0, pending: 0,
      }]);
    } else {
      clearedPoints = await cdp.evaluate(`(() => {
      const vm = window.__qhzhcBenchVm;
      if (vm.$refs.childMap && typeof vm.$refs.childMap.removeTC === "function") {
        vm.$refs.childMap.removeTC();
      }
      if (vm.$refs.child3DMap && typeof vm.$refs.child3DMap.remove === "function") {
        vm.$refs.child3DMap.remove();
      }
      vm.mapList = [];
      vm.realtimeBatch = [];
      vm.gasdata = { code: 200, message: "ok", data: [] };
      vm.visualEvicted = 0;
      return vm.mapList.length;
      })()`);
    }
    // 服务端生成速率必须固定为 20 点/秒：订阅档位是"从 20 点里抽样下发"，
    // 若生成速率被改小，调整订阅就不再等价于调整接收量。模拟器管理页面可以
    // 随时改写这项配置，因此采样前强制写入并校验，采样后再校验一次防漂移。
    const patched = await api("PATCH", "/api/admin/simulator/config", {
      robotId: "QH-ZHC-01", pointsPerSecond: 20, pattern: "route",
    });
    if (patched?.status?.config?.pointsPerSecond !== 20) {
      throw new Error(
        "simulator pointsPerSecond did not apply: " +
          JSON.stringify(patched?.status?.config),
      );
    }
    const before = (await api("GET", "/api/admin/simulator")).status;
    await api("POST", "/api/admin/simulator/action", { action: "start" });
    const measurementStart = await cdp.evaluate(`(() => {
      const bench = window.__qhzhcBench;
      bench.measureStart = performance.now();
      bench.loafs.length = 0;
      bench.fps.length = 0;
      bench.runtime.length = 0;
      bench.frames = 0;
      bench.windowStart = bench.measureStart;
      const vm = window.__qhzhcBenchVm;
      return { atMs: bench.measureStart, initialReceived: vm.totalReceived,
        initialConsumed: vm.totalConsumed };
    })()`);
    console.log(`Sampling ${seconds}s: ${mapLabel}, ${frameLimit} point/frame, subscribe ${pointLimit === 0 ? "all" : pointLimit + " point(s)/s"}...`);
    const collected = { loafs: [], fps: [], runtime: [] };
    const drainToDisk = async () => {
      const next = await cdp.evaluate("window.__qhzhcBench.drain()");
      for (const key of ["loafs", "fps", "runtime"]) {
        collected[key].push(...next[key]);
        await appendRecords(key + ".jsonl", next[key]);
      }
    };
    if (streaming) {
      await appendRecords("events.jsonl", [{
        type: "measurement_started", at: new Date().toISOString(),
        browserStartMs: measurementStart.atMs, initialHistoryCount: clearedPoints,
      }]);
      const deadline = Date.now() + seconds * 1000;
      let nextProgressSecond = 10;
      while (Date.now() < deadline) {
        await delay(Math.min(1000, Math.max(1, deadline - Date.now())));
        await drainToDisk();
        const elapsedSeconds = seconds - Math.max(0, deadline - Date.now()) / 1000;
        if (elapsedSeconds >= nextProgressSecond) {
          const latest = collected.runtime.at(-1);
          await appendFile(path.join(outputDir, "progress.md"),
            "- " + nextProgressSecond + " 秒：FPS 样本 " + collected.fps.length +
            "，LoAF " + collected.loafs.length + "，地图点 " +
            (latest?.mapPoints ?? "—") + "，待消费 " + (latest?.pending ?? "—") + "。\n",
            "utf8");
          nextProgressSecond += 10;
        }
      }
    } else {
      await delay(seconds * 1000);
    }
    const samples = await cdp.evaluate(`(() => {
      const bench = window.__qhzhcBench;
      bench.active = false;
      cancelAnimationFrame(bench.rafId);
      clearInterval(bench.timer);
      for (const entry of bench.observer.takeRecords()) bench.recordLoaf(entry);
       bench.observer.disconnect();
       const vm = window.__qhzhcBenchVm;
       const map = vm.mapType === 1 ? vm.$refs.childMap : vm.$refs.child3DMap;
       const physicalPoints = vm.mapType === 1
         ? map?.pointSource?.getFeatures().length
         : map?.viewer?.entities?.values?.filter(
             (entity) => String(entity.id).startsWith("realtime-bar-")
           ).length;
       const routeGroups = vm.mapType === 1
         ? map?.routeSource?.getFeatures().length
         : map?.viewer?.entities?.values?.filter(
             (entity) => String(entity.id).startsWith("realtime-route-")
           ).length;
       return {
        loafs: bench.loafs, fps: bench.fps, runtime: bench.runtime,
        startTime: bench.measureStart, endTime: performance.now(),
        finalReceived: vm.totalReceived, finalConsumed: vm.totalConsumed,
        finalPending: vm.realtimeClient?.runtimeStats().pending,
         finalMapPoints: typeof vm.getRealtimeMapPoints === "function"
           ? vm.getRealtimeMapPoints().length : vm.mapList.length,
         finalRenderedMapPoints: physicalPoints, finalRouteGroups: routeGroups,
        frameMode: vm.realtimeFrameLimit, pointLimit: vm.realtimePointLimit,
        mapType: vm.mapType,
      };
    })()`);
    if (streaming) {
      for (const key of ["loafs", "fps", "runtime"]) {
        await appendRecords(key + ".jsonl", samples[key]);
        collected[key].push(...samples[key]);
      }
    }
    const after = (await api("GET", "/api/admin/simulator")).status;
    // 采样窗口内生成速率一旦被外部改写，本组数据即失去可比性，直接判为失败。
    if (after.config.pointsPerSecond !== 20) {
      throw new Error(
        "simulator generation rate drifted during sampling: " +
          after.config.pointsPerSecond,
      );
    }
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(outputDir, "dashboard.png"), Buffer.from(screenshot.data, "base64"));
     const allSamples = streaming ? collected : samples;
     const fps = allSamples.fps.map((sample) => sample.fps);
     const durations = allSamples.loafs.map((entry) => entry.duration);
     const sources = new Map();
     for (const entry of allSamples.loafs) {
      for (const script of entry.scripts) {
        const name = script.sourceFunctionName || script.sourceURL || "(unknown)";
        const stats = sources.get(name) || { count: 0, totalMs: 0 };
        stats.count++;
        stats.totalMs += script.duration;
        sources.set(name, stats);
      }
    }
    const summary = {
      fpsSamples: fps.length,
      fpsAverage: fps.reduce((a, b) => a + b, 0) / (fps.length || 1),
      fpsP5: percentile(fps, 0.05), fpsMin: fps.length ? Math.min(...fps) : 0,
       loafCount: allSamples.loafs.length, loafP95Ms: percentile(durations, 0.95),
       loafMaxMs: Math.max(0, ...durations),
       serverGenerated: after.generatedPoints - before.generatedPoints,
       clientReceived: samples.finalReceived - measurementStart.initialReceived,
       clientConsumed: samples.finalConsumed - measurementStart.initialConsumed,
       finalPending: samples.finalPending,
       finalMapPoints: samples.finalMapPoints,
       finalRenderedMapPoints: samples.finalRenderedMapPoints,
       finalRouteGroups: samples.finalRouteGroups,
       pointRetentionPass: samples.finalRenderedMapPoints === samples.finalMapPoints,
      topScriptEntrypoints: [...sources.entries()]
        .map(([name, value]) => ({ name, ...value }))
        .sort((a, b) => b.totalMs - a.totalMs).slice(0, 10),
    };
     if (streaming) {
       await appendRecords("events.jsonl", [{
         type: "measurement_completed",
         at: new Date().toISOString(),
         elapsedBrowserMs: samples.endTime - samples.startTime,
         ...summary,
       }]);
       await appendFile(path.join(outputDir, "progress.md"),
         "\n采样结束：FPS 均值 " + summary.fpsAverage.toFixed(2) +
         "、P5 " + summary.fpsP5.toFixed(2) +
         "；LoAF " + summary.loafCount +
         " 次、P95 " + summary.loafP95Ms.toFixed(2) +
         " ms、最大 " + summary.loafMaxMs.toFixed(2) +
         " ms；接收/消费 " + summary.clientReceived + "/" +
         summary.clientConsumed + "，结束待消费 " + summary.finalPending +
         "，地图逻辑/实体点 " + summary.finalMapPoints + "/" +
         summary.finalRenderedMapPoints + "，轨迹组 " +
         summary.finalRouteGroups + "，保留核对 " +
         (summary.pointRetentionPass ? "通过" : "失败") + "。\n", "utf8");
     } else {
       const result = {
         metadata: {
           recordedAt: new Date().toISOString(), seconds,
           browser: "Chrome headless", viewport: "1440x900",
           map: mapLabel, frameMode: frameLimit, pointsPerSecond: 20, pointLimit,
           preexistingMapPoints: clearedPoints,
         },
         summary, samples, simulator: { before, after },
       };
       await writeFile(path.join(outputDir, "raw.json"), JSON.stringify(result, null, 2));
       await writeFile(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2));
     }
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    try {
      if (changed) {
        await api("POST", "/api/admin/simulator/action", { action: "pause" });
        await api("PATCH", "/api/admin/simulator/config", original.config);
        if (original.running) {
          await api("POST", "/api/admin/simulator/action", { action: "start" });
        }
        const restored = (await api("GET", "/api/admin/simulator")).status;
        await writeFile(
          path.join(outputDir, "restoration.json"),
          JSON.stringify({
            before: { running: original.running, config: original.config },
            restored: { running: restored.running, config: restored.config },
          }, null, 2),
        );
        if (streaming) {
          await appendRecords("events.jsonl", [{
            type: "simulator_restored", at: new Date().toISOString(),
            before: { running: original.running, config: original.config },
            restored: { running: restored.running, config: restored.config },
          }]);
          await appendFile(path.join(outputDir, "progress.md"),
            "模拟器配置恢复：" +
            (JSON.stringify(original.config) === JSON.stringify(restored.config) &&
              original.running === restored.running ? "已核对一致" : "与原状态不一致") +
            "。\n", "utf8");
        }
      }
    } finally {
      cdp?.close();
      if (chrome) {
        const exited = chrome.exitCode !== null
          ? Promise.resolve()
          : new Promise((resolve) => chrome.once("exit", resolve));
        chrome.kill();
        await Promise.race([exited, delay(5000)]);
      }
      if (path.dirname(profile) === os.tmpdir()) {
        await rm(profile, { recursive: true, force: true }).catch((error) => {
          console.warn("Could not remove temporary Chrome profile:", error.message);
        });
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
