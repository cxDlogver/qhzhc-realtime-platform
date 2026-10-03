import { spawn } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const apiUrl = process.env.QHZHC_BENCH_API_URL || "http://127.0.0.1:18080";
const webUrl = process.env.QHZHC_BENCH_WEB_URL || "http://127.0.0.1:9527";
const password = process.env.QHZHC_BENCH_PASSWORD;
const outputDir = path.resolve(process.env.QHZHC_SMOKE_OUTPUT ||
  "reports/realtime-rendering/h0-singlepoint-2026-09-24/interaction-smoke");
const chromePath = process.env.QHZHC_BENCH_CHROME ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
if (!password) throw new Error("Set QHZHC_BENCH_PASSWORD");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const record = async (type, data = {}) =>
  appendFile(path.join(outputDir, "events.jsonl"),
    JSON.stringify({ type, at: new Date().toISOString(), ...data }) + "\n");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
async function waitFor(check, label, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await check().catch(() => null);
    if (value) return value;
    await delay(200);
  }
  throw new Error("Timed out waiting for " + label);
}
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.httpErrors = new Map();
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.method === "Network.responseReceived") {
        const response = message.params?.response;
        if (response?.status >= 400) {
          try {
            const url = new URL(response.url);
            const key = `${response.status} ${url.host}${url.pathname}`;
            this.httpErrors.set(key, (this.httpErrors.get(key) || 0) + 1);
          } catch {
            // Omit malformed URLs and never persist query strings or tokens.
          }
        }
      }
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
    const result = await this.send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
    }
    return result.result?.value;
  }
  close() { this.socket.close(); }
}

const pointCount = 260;
const baseTime = Date.now();
const points = Array.from({ length: pointCount }, (_, index) => {
  const longitude = 112.0 + index * 0.00001;
  const latitude = 28.0 + index * 0.00001;
  return {
    time: new Date(baseTime + index * 100).toISOString(),
    longitude, latitude, geo_location: [longitude, latitude],
    altitude: 0, heading: 0, speed: 0,
    pri_ch4: 2 + index / 100, pri_co2: 400 + index,
    pri_c2h6: 1, pri_co: 1, pri_n2o: 1,
    picarro_hp_12ch4_dry: 2, picarro_hr_12ch4_dry: 2,
    picarro_12co2_dry: 400,
    weather_data: { temp: 20, humidity: 50, pressure: 1013,
      windSpeed: 1, windDirection: 90 },
  };
});

async function main() {
  await mkdir(outputDir, { recursive: true });
  await record("started", { pointCount, scenario: "temporary browser scene" });
  const login = await fetch(apiUrl + "/api/auth/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password }),
  });
  assert(login.ok, "API login failed: " + login.status);
  const { accessToken } = await login.json();
  const api = async (method, endpoint, body) => {
    const response = await fetch(apiUrl + endpoint, {
      method,
      headers: { authorization: "Bearer " + accessToken,
        ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert(response.ok, endpoint + ": HTTP " + response.status);
    return response.json();
  };
  const original = (await api("GET", "/api/admin/simulator")).status;
  const profile = await mkdtemp(path.join(os.tmpdir(), "qhzhc-smoke-"));
  let chrome, cdp, changed = false;
  try {
    await api("POST", "/api/admin/simulator/action", { action: "pause" });
    changed = true;
    chrome = spawn(chromePath, [
      "--headless=new", "--no-first-run", "--no-default-browser-check",
      "--window-size=1440,900", "--remote-debugging-port=0",
      "--user-data-dir=" + profile, "about:blank",
    ], { stdio: "ignore", windowsHide: true });
    const port = Number(await waitFor(async () => {
      const file = await readFile(path.join(profile, "DevToolsActivePort"), "utf8");
      return file.trim().split(/\r?\n/)[0];
    }, "Chrome DevTools port", 15_000));
    const target = await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(webUrl + "/#/login")}`,
      { method: "PUT" },
    );
    assert(target.ok, "Could not create Chrome target");
    cdp = await Cdp.connect((await target.json()).webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await waitFor(() => cdp.evaluate(
      "document.readyState === 'complete' && !!document.querySelector('#app')"),
    "login page");
    const browserLogin = await cdp.evaluate(`(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST", headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify(${JSON.stringify({ username: "admin", password })})
      });
      if (!response.ok) return response.status;
      const data = await response.json();
      localStorage.setItem("user", JSON.stringify(data.user));
      return 200;
    })()`);
    assert(browserLogin === 200, "Browser login failed: " + browserLogin);
    await cdp.send("Page.navigate", { url: webUrl + "/#/dataVisualization" });
    await waitFor(() => cdp.evaluate(`(() => {
      const root = document.querySelector("#app")?.__vue__;
      const find = (vm) => vm && (vm.$data &&
        Object.prototype.hasOwnProperty.call(vm.$data, "realtimeFrameLimit")
          ? vm : vm.$children.map(find).find(Boolean));
      window.__smokeVm = find(root);
      return !!window.__smokeVm?.realtimeClient;
    })()`), "visualization");
    await cdp.evaluate(`(async () => {
      const vm = window.__smokeVm;
      vm.applyRealtimeInitialWindow({ code: 200, message: "smoke",
        data: ${JSON.stringify(points)} });
      await vm.$nextTick();
    })()`);
    const state2d = await waitFor(async () => {
      const state = await cdp.evaluate(`(() => {
        const vm = window.__smokeVm, map = vm.$refs.childMap;
        return { logical: vm.getRealtimeMapPoints().length,
          physical: map?.pointSource?.getFeatures().length,
          routes: map?.routeSource?.getFeatures().length,
          pointCache: typeof map?.pointStyleCache?.has === "function",
          routeCache: typeof map?.routeStyleCache?.has === "function",
          pointStyleReused: map?.getPointStyle("#00FF44", 2) ===
            map?.getPointStyle("#00FF44", 2),
          routeStyleReused: map?.getRouteStyle("#12FF9B") ===
            map?.getRouteStyle("#12FF9B") };
      })()`);
      return state?.logical === pointCount && state?.physical === pointCount &&
        state?.routes === 2 && state.pointCache && state.routeCache &&
        state.pointStyleReused && state.routeStyleReused ? state : null;
    }, "2D points and grouped route");
    await record("two_d_loaded", state2d);

    await cdp.evaluate("window.__smokeVm.checkMapType(2)");
    const state3d = await waitFor(async () => {
      const state = await cdp.evaluate(`(() => {
        const map = window.__smokeVm.$refs.child3DMap;
        const entities = map?.viewer?.entities?.values || [];
        const routes = entities.filter(x => String(x.id).startsWith("realtime-route-"));
        const camera = map?.viewer?.camera;
        const cartographic = camera?.positionCartographic;
        const points = window.__smokeVm.getRealtimeMapPoints();
        return { physical: entities.filter(x => String(x.id).startsWith("realtime-bar-")).length,
          routes: routes.length,
          routePositionCounts: routes.map(x =>
            x.polyline.positions?.getValue(map.viewer.clock.currentTime)?.length || 0),
          firstPoint: points.length ? [points[0].longitude, points[0].latitude] : null,
          lastPoint: points.length ?
            [points[points.length - 1].longitude, points[points.length - 1].latitude] : null,
          camera: cartographic ? {
            longitude: Cesium.Math.toDegrees(cartographic.longitude),
            latitude: Cesium.Math.toDegrees(cartographic.latitude),
            height: cartographic.height,
          } : null,
          clockAnimating: map?.viewer?.clock?.shouldAnimate,
          idleRenderTimeChange: map?.viewer?.scene?.maximumRenderTimeChange === Infinity };
      })()`);
      return state?.physical === pointCount && state?.routes === 2 &&
        state.routePositionCounts.every(count => count >= 2) ? state : null;
    }, "3D points and grouped route");
    assert(state3d.clockAnimating === false && state3d.idleRenderTimeChange,
      "Realtime Cesium clock must be idle: " + JSON.stringify(state3d));
    await record("three_d_loaded", state3d);
    await delay(1000);
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(path.join(outputDir, "three-d-after-switch.png"),
      Buffer.from(screenshot.data, "base64"));
    await record("three_d_screenshot", { file: "three-d-after-switch.png" });

    await cdp.evaluate(`(() => {
      const vm = window.__smokeVm;
      vm.checkGasName(vm.gasTypeData.PRI.find(x => x.value === "pri_co2"));
    })()`);
    const recolored = await waitFor(async () => {
      const state = await cdp.evaluate(`(() => {
        const vm = window.__smokeVm, map = vm.$refs.child3DMap;
        const entities = map?.viewer?.entities?.values || [];
        return { gas: map?.gasType, framePending: map?.recolorFrameId != null,
          physical: entities.filter(x => String(x.id).startsWith("realtime-bar-")).length,
          routes: entities.filter(x => String(x.id).startsWith("realtime-route-")).length };
      })()`);
      return state?.gas === "pri_co2" && !state.framePending ? state : null;
    }, "3D gas recolor");
    assert(recolored.physical === pointCount && recolored.routes === 2,
      "Gas switch lost points or route");
    await record("gas_switched", recolored);

    await cdp.evaluate("window.__smokeVm.checkMapType(1)");
    const back2d = await waitFor(async () => {
      const state = await cdp.evaluate(`(() => {
        const map = window.__smokeVm.$refs.childMap;
        return { points: map?.pointSource?.getFeatures().length,
          routes: map?.routeSource?.getFeatures().length };
      })()`);
      return state?.points === pointCount && state?.routes === 2 ? state : null;
    }, "2D map after switching back");
    await record("map_switched_back", back2d);

    await cdp.evaluate("window.__smokeVm.checkMapType(2)");
    await waitFor(() => cdp.evaluate(`(() => {
      const map = window.__smokeVm.$refs.child3DMap;
      return map?.viewer?.entities?.values?.filter(
        x => String(x.id).startsWith("realtime-bar-")).length === ${pointCount};
    })()`), "3D map for playback");
    const playbackStarted = await cdp.evaluate(`(() => {
      const map = window.__smokeVm.$refs.child3DMap;
      const now = Date.now();
      const data = ${JSON.stringify(points.slice(0, 3))}.map((point, index) => ({
        ...point, time: new Date(now + index * 500).toISOString()
      }));
      map.drawLine({ data });
      return { active: map.historyPlaybackActive,
        clockAnimating: map.viewer.clock.shouldAnimate,
        timeDrivenRendering: map.viewer.scene.maximumRenderTimeChange === 0 };
    })()`);
    assert(playbackStarted.active && playbackStarted.clockAnimating &&
      playbackStarted.timeDrivenRendering,
    "History playback did not resume Cesium clock: " +
      JSON.stringify(playbackStarted));
    await record("history_playback_started", playbackStarted);
    const playbackStopped = await waitFor(async () => {
      const state = await cdp.evaluate(`(() => {
        const map = window.__smokeVm.$refs.child3DMap;
        return { active: map.historyPlaybackActive,
          clockAnimating: map.viewer.clock.shouldAnimate,
          idleRenderTimeChange: map.viewer.scene.maximumRenderTimeChange === Infinity };
      })()`);
      return !state.active && !state.clockAnimating &&
        state.idleRenderTimeChange ? state : null;
    }, "history playback clock stop", 10_000);
    await record("history_playback_stopped", playbackStopped);
    await record("completed");
    console.log("Render interaction smoke passed");
  } catch (error) {
    await record("failed", { message: error.message });
    throw error;
  } finally {
    try {
      if (cdp) {
        await record("http_error_responses", {
          responses: [...cdp.httpErrors].map(([resource, count]) => ({
            resource, count,
          })).sort((left, right) => right.count - left.count),
        });
      }
      if (changed) {
        await api("POST", "/api/admin/simulator/action", { action: "pause" });
        await api("PATCH", "/api/admin/simulator/config", original.config);
        if (original.running) {
          await api("POST", "/api/admin/simulator/action", { action: "start" });
        }
        const restored = (await api("GET", "/api/admin/simulator")).status;
        const match = original.running === restored.running &&
          JSON.stringify(original.config) === JSON.stringify(restored.config);
        await record("simulator_restored", { match, before: original,
          after: restored });
        assert(match, "Simulator configuration was not restored");
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
