# 实时渲染链路分析与优化记录

本文把「走航车实时数据可视化」页面从 WebSocket 收包到地图/折线图出画这条链路上做过的改动逐条摊开，每一条都写清楚六件事：改之前的逻辑、它的问题、为什么值得改、判断依据是什么、具体怎么改、改完测到什么。

## 0. 涉及的代码与本文的数据来源

### 0.1 代码

| 文件 | 在本链路中的角色 |
| --- | --- |
| `QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts` | WebSocket 连接、按自然秒收包、把点交给帧队列 |
| `.../services/FrameTelemetryQueue.ts` | 帧队列：攒点、按 rAF 出队、每帧取几个点 |
| `.../services/AdaptiveRenderController.ts` | 每秒一次决策：每帧取几个点、要不要降低订阅档位 |
| `.../services/RenderPerformanceMonitor.ts` | 独立于数据的 rAF 帧率采样 + 分位数 |
| `.../services/LongFrameDiagnostics.ts` | LoAF（`long-animation-frame`）长帧归因 |
| `.../dataVisualization.vue` | 收包后合并状态、驱动子组件、运行指标面板 |
| `.../components/PlanimetricMap.vue` | 二维地图（OpenLayers） |
| `.../components/StereoscopicMap.vue` | 三维地图（Cesium） |
| `.../components/Charts.vue` | 四个 ECharts 折线图 |
| `.../utils/visualizationData.ts` | 折线图时间窗口裁剪、地图点追加 |

### 0.2 实验产物

| 目录 | 条件 |
| --- | --- |
| `loaf-60s`、`loaf-60s-3d-verified` | 20 点/秒、batch=1、冷启动，二维/三维基线 |
| `batch-2d-*`、`batch-3d-*` | 20 点/秒、batch ∈ {2,5,10,20} |
| `rate-2d-*`、`rate-3d-*` | 订阅档位 rate=batch ∈ {1,2,5,10} |
| `h5000-singlepoint-2026-09-24` | 预置 5000 点历史、rate=1、batch=1，**仅优化前** |
| `h0-singlepoint-2026-09-24` | 空场景、rate=1、batch=1，含优化前 `baseline-*` 与优化后 `post-*` |
| `history-microbenchmark.json` | Node 端轨迹构造算法规模测试 |
| `queue-throughput-experiment.json` | 空渲染回调下的队列吞吐对照 |

### 0.3 时间顺序（本地时间 UTC+8，2026-09-23）

```text
21:21  loaf-60s（二维，20 点/秒，batch=1）
22:48  batch 扫描（二维/三维 × batch 2/5/10/20）
23:39  rate 扫描（二维/三维 × rate 1/2/5/10）
────── 以上全部为地图优化之前的状态 ──────
09-24 01:16  h5000 基线（5000 点历史）
09-24 01:27  h0 pre-2d / baseline-2d / baseline-3d（优化前）
09-24 02:18  h0 post-2d / post-3d（优化后）
09-24 02:56  交互烟测（切地图、切气体、历史播放）
```

这一点决定了下文数字能不能互相比较：**batch 扫描和 rate 扫描的数据都产生于地图优化之前**，`h0-singlepoint` 的 `baseline-*` 与 `post-*` 才是同一条件下的前后对照。

---

## 1. 一个点从 WebSocket 到屏幕经过什么

改动之前，这条链路是「收到一次就画一次」：

```text
服务端 telemetry_second（每秒一批，20 点/秒）
   ↓  realtimeClient.handleTelemetrySecond
   ↓  frameQueue.enqueue(points)
   ↓  rAF → flush → onFrame(batch) → publishFrame
   ↓  options.onPacket → dataVisualization.handleRealtimePacket
   ↓  写响应式状态（gasdata / mapList / detailData / weather）
   ↓  Vue 触发子组件更新
   ↓  PlanimetricMap 或 StereoscopicMap 重绘 + 4 个 Charts setOption
```

`FrameTelemetryQueue.flush()` 的取点循环（`services/FrameTelemetryQueue.ts:115`）：

```ts
private flush(): void {
  this.frameHandle = null;
  const startedAt = this.scheduler.now();
  const batch: TelemetryPoint[] = [];
  while (
    this.cursor < this.queue.length &&
    batch.length < this.maxPerFrame &&
    (batch.length === 0 || this.scheduler.now() - startedAt < this.budgetMs)
  ) {
    const point = this.queue[this.cursor++];
    if (point) batch.push(point);
  }
  if (batch.length) {
    this.totalConsumed += batch.length;
    this.onFrame(batch);
  }
  ...
}
```

`maxPerFrame` 默认 1、`budgetMs` 默认 5。也就是说：**配置成每帧 1 点时，调用一次 `onFrame` 就等于让整条绘制链路完整跑一遍**（地图加 feature/entity、轨迹重建、四个 ECharts setOption、详情卡、天气）。20 点/秒意味着这条链路每秒要跑 20 次。

链路里所有「每次更新都要付」的工作，后面统一记为一次地图更新的成本。第 2 节的实测说明这份成本大到什么程度。

---

## 2. 优化前的实测状态

### 2.1 满负载（20 点/秒、batch=1、冷启动、60 秒）

| | 二维 `loaf-60s` | 三维 `loaf-60s-3d-verified` |
| --- | ---: | ---: |
| rAF FPS 均值 | 10.49 | 9.07 |
| FPS P5 | 4.19 | 3.95 |
| 接收 / 消费 | 1180 / 414 | 1160 / 342 |
| 结束积压 | 766 | 818 |
| LoAF 次数 | 413 | 343 |
| LoAF P95 / 最大 | 239.4 / 411 ms | 249.5 / 1032 ms |

每秒进 20 个点，只消费掉 6.9 个（二维）和 5.7 个（三维），剩下全部堆在队列里。页面实际上被自己拖死了：FPS 越低 → rAF 回调越少 → 队列消费越慢 → 积压越多。

### 2.2 有历史时（预置 5000 点、rate=1、batch=1）

| | 二维 | 三维 |
| --- | ---: | ---: |
| rAF FPS 均值 | 5.35 | 0.50 |
| FPS P5 | 0.51 | 0.23 |
| LoAF 次数 | 35 | 24 |
| LoAF P95 | 1916.70 ms | 4302.90 ms |
| LoAF 最大 | 2974.20 ms | 4318.30 ms |
| 接收 / 消费 | 59 / 35 | 2 / 1 |

每秒只喂 1 个点，二维剩 25 个没消费、三维几乎完全停滞。单帧最长接近 3～4.3 秒。**这说明成本不是「每秒画几个点」的问题，而是「历史规模一大，画一个点就要几秒」**。

### 2.3 空场景时（0 点历史、rate=1、batch=1）

| | 二维 `baseline-2d` | 三维 `baseline-3d` |
| --- | ---: | ---: |
| rAF FPS 均值 | 131.67 | 42.63 |
| FPS P5 | 108.71 | 24.57 |
| LoAF 次数 | 57 | 78 |
| LoAF 中位 / P95 / 最大 | 62.2 / 74.2 / 82.3 ms | 67.1 / 95.1 / 161.0 ms |
| 接收 / 消费 | 59 / 59 | 59 / 59 |

同样是每秒 1 个点、总共 59 个点，二维 131 FPS、三维只有 42 FPS。**三维存在与数据量无关的固有成本**，这是后面 3.11 那条改动要解决的问题。

### 2.4 轨迹构造的算法规模

`history-microbenchmark.json`（Node v22.12.0，5 轮 × 2000 次，batch=5）只测算法本身，不涉及浏览器绘制：

| 历史点数 | 追加 5 点 | 全量重建轨迹 | 增量追加轨迹 | 增量加速比 |
| ---: | ---: | ---: | ---: | ---: |
| 300 | 4.25 ms | 12.64 ms | 0.158 ms | 80× |
| 600 | 4.85 ms | 30.17 ms | 0.239 ms | 126× |
| 1200 | 7.05 ms | 65.54 ms | 0.109 ms | 604× |
| 6000 | 28.88 ms | 645.74 ms | 0.091 ms | 7065× |

全量重建从 12.64 ms 涨到 645.74 ms（51 倍），增量追加始终在 0.1～0.24 ms。历史点数从 300 到 6000，「追加」本身只涨 6.8 倍，而「重建轨迹」涨了 51 倍。**重建轨迹是随历史规模劣化最快的一项。**

---

## 3. 优化点逐条

### 3.1 三维柱体：`CallbackProperty` 换成静态值

**原本逻辑**（`StereoscopicMap.vue`，改动前的 `upsertRealtimeBar`）：

```js
const nextState = { position, dimensions, color: material };
this.realtimeBarStates[slotIndex] = nextState;
this.viewer.entities.add({
  id: entityId,
  position: new Cesium.CallbackProperty(() => nextState.position, false),
  box: {
    dimensions: new Cesium.CallbackProperty(() => nextState.dimensions, false),
    material: new Cesium.ColorMaterialProperty(
      new Cesium.CallbackProperty(() => nextState.color, false),
    ),
    ...
  },
});
```

每个柱体带 3 个 `CallbackProperty`。

**问题**：`CallbackProperty` 是动态属性，Cesium 在**每一次** update/render cycle 里都会对每个动态属性求值一次。N 个柱体 = 每帧 3N 次回调求值，而且这些值在柱体创建后就不会再变。历史点数越多，每帧求值次数线性增长。这正好对应 `docs/优化过程.md` 5.10 节提出的怀疑方向：动态 Property 放大历史规模成本。

**为什么改**：2.2 节三维 0.50 FPS、单帧 4.3 秒，只喂 1 个点/秒。数据量已经压到最低还是卡，说明瓶颈不在「每帧新增几个点」，而在「场景里已有什么」。Entity 数量 × 每帧求值次数是三维最可疑的一项。

**依据**：
- `docs/优化过程.md` 5.18 节把「降低动态 Property 数量」「静态后不再变化的属性避免长期使用动态 CallbackProperty」列为三维单帧成本优化的重点方向。
- 2.3 节三维在空场景（59 个点）就只有 42.63 FPS，二维同条件 131.67 FPS，差距不来自数据量。

**改法**（`components/StereoscopicMap.vue:508`）：

```ts
upsertRealtimeBar(dataPoint, pointIndex, gasType = this.gasType) {
  ...
  const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, safeHeight / 2);
  const dimensions = new Cesium.Cartesian3(6, 6, safeHeight);
  const material = Cesium.Color.fromCssColorString(barData.color).withAlpha(0.5);
  const entityId = `realtime-bar-${pointIndex}`;
  const entity = this.viewer.entities.getById(entityId);

  if (entity && entity.box) {
    entity.position = position;
    entity.box.dimensions = dimensions;
    entity.box.material = new Cesium.ColorMaterialProperty(material);
    entity.show = entityId !== this.latestRealtimeBarId;
    return entityId;
  }
  ...
  this.viewer.entities.add({
    name: `Redbox${pointIndex}`,
    id: entityId,
    position,                                    // 静态值
    box: {
      scale: 1,
      dimensions,                                // 静态值
      material: new Cesium.ColorMaterialProperty(material),  // 静态值
      outline: false,
      outlineColor: Cesium.Color.WHITE,
      heightReference: Cesium.HeightReference.NONE,
    },
  });
  return entityId;
}
```

配套删掉了 `realtimeEntityIds`、`realtimeBarStates` 两个数组和 `trackRealtimeEntity()`：柱体以 `realtime-bar-${下标}` 为 id 直接 `getById` 定位，不再需要外部维护一份影子状态。

**结果**：与 3.9、3.10 一起体现在 4.1 的前后对照里——三维空场景 42.63 → 109.10 FPS。这一条改动单独没有拆分测量，不做单独归因。

---

### 3.2 三维轨迹：全量重建 + `CallbackProperty` 换成 256 点分段增量

**原本逻辑**（改动前的 `updateRealtimeRoute`）：

```js
const coordinates = points.reduce((result, point) => {
  const longitude = Number(point && point.longitude);
  const latitude = Number(point && point.latitude);
  if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
    result.push(longitude, latitude, REALTIME_ROUTE_HEIGHT);
  }
  return result;
}, []);
if (coordinates.length < 4) return;

const positions = Cesium.Cartesian3.fromDegreesArrayHeights(coordinates);
const route = this.viewer.entities.getById("realtime-route");
if (route && route.polyline && this.realtimeRouteState) {
  this.realtimeRouteState.positions = positions;
} else {
  ...
  this.viewer.entities.add({
    id: "realtime-route",
    polyline: {
      positions: new Cesium.CallbackProperty(() => routeState.positions, false),
      ...
    },
  });
}
```

每来一个新点：遍历**全部**历史点重新拼一个扁平坐标数组 → `fromDegreesArrayHeights` 重新构造**全部** `Cartesian3` → 整体替换 `positions`。同时 `positions` 也是一个 `CallbackProperty`，每帧求值。

**问题**：这是 O(n) 的，而且每帧还要对整条折线做一次动态属性求值和几何准备。6000 点时，每加一个点就要重建 6000 个 `Cartesian3`。`history-microbenchmark.json` 里「全量重建轨迹」6000 点 645.74 ms，与这一段的实际形态一致。

**为什么改**：这条是三维里唯一一处「历史规模 × 每帧」双重放大的地方：新增点数只有 1 个，工作量却是 6000。

**依据**：2.4 节全量重建 12.64 ms → 645.74 ms（51 倍），增量追加恒定 0.09～0.24 ms。

**改法**（`components/StereoscopicMap.vue:11` 与 `:458`）：

```ts
const REALTIME_ROUTE_CHUNK_POINTS = 256;
```

```ts
appendRealtimeRoute(points) {
  if (!this.isViewerReady()) return;
  if (!this.realtimeRouteState) {
    this.realtimeRouteState = Object.preventExtensions({
      nextGroupIndex: 0,
      activeEntity: null,
      activePositions: [],
      lastPosition: null,
    });
  }
  const state = this.realtimeRouteState;
  for (const point of Array.isArray(points) ? points : []) {
    const longitude = Number(point && point.longitude);
    const latitude = Number(point && point.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
      state.activeEntity = null;
      state.activePositions = [];
      state.lastPosition = null;
      continue;
    }
    const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, REALTIME_ROUTE_HEIGHT);
    if (!state.lastPosition) { state.lastPosition = position; continue; }
    if (!state.activeEntity ||
        state.activePositions.length >= REALTIME_ROUTE_CHUNK_POINTS) {
      const positions = [state.lastPosition, position];
      state.activeEntity = this.viewer.entities.add({
        id: `realtime-route-${state.nextGroupIndex++}`,
        name: "实时轨迹",
        polyline: {
          positions,                                    // 静态数组，不再用 CallbackProperty
          material: Cesium.Color.fromCssColorString("#12FF9B").withAlpha(0.95),
          width: 5,
          clampToGround: false,
        },
      });
      state.activePositions = positions;
    } else {
      state.activePositions.push(position);
      state.activeEntity.polyline.positions = state.activePositions.slice();
    }
    state.lastPosition = position;
  }
}
```

要点：
- 每 256 点建一个 polyline entity（`realtime-route-0`、`realtime-route-1` …），段内只 `push` + 替换当前段的 positions，单次是 O(1)。
- 坐标无效时断开当前段，避免把不连续的两点连成一条线。
- 状态对象用 `Object.preventExtensions` 冻结，防止误加字段。
- `clearRealtimeRoute()` 按 `nextGroupIndex` 逐段移除，不再 `entities.removeAll()` 连柱体一起清掉。

**结果**：交互烟测 `h0-singlepoint-2026-09-24/interaction-smoke-route-visibility/events.jsonl` 记录 260 点时三维 `"routes":2, "routePositionCounts":[256,5]`——分段按预期生效，前 256 点一段、余下 5 点一段。260 点的场景里，新增一个点只需要改动最后一段。

---

### 3.3 三维渲染驱动：`shouldAnimate` 与 `requestRenderMode`

**原本逻辑**：

```js
this.viewer = new Cesium.Viewer("cesiumContainer", {
  shouldAnimate: true,   // ← 改动前
  requestRenderMode: true,
  ...
});
```

`shouldAnimate: true` 让 Cesium 的时钟持续推进，配合 `requestRenderMode` 会不断判定「需要新帧」，等于绕过了显式渲染的作用。

**问题**：三维在完全没有新数据的空闲状态下仍然持续渲染，这部分开销与业务数据无关，却一直占用主线程和 GPU。2.3 节三维空场景只有 42.63 FPS、78 个 LoAF，二维同条件 131.67 FPS——三维多出来的这部分就是「场景自身持续开销」。

**为什么改**：`docs/优化过程.md` 5.4 节已经确认「三维即使只处理一个点，仍然存在持续性的高单帧成本」，5.18 节把「验证是否存在不必要的持续 Scene update」列为待验证方向。

**依据**：`优化过程.md` 5.20 节结论——三维在 1 点/秒时仍只有 44.08 FPS、60 秒 82 个 LoAF，而实时点总数只有 58 个。

**改法**（`components/StereoscopicMap.vue:207`、`:215`）：

```js
shouldAnimate: false,
...
requestRenderMode: true,
```

```js
this.viewer.clock.shouldAnimate = false;
this.viewer.scene.maximumRenderTimeChange = Infinity;
```

`maximumRenderTimeChange = Infinity` 表示「时间变化不触发新帧」，只有 `scene.requestRender()` 才画。所有数据变更路径统一在末尾调一次 `requestRender()`（`components/StereoscopicMap.vue:926`）。

历史轨迹播放时需要时钟驱动，所以在 `drawLine()` 里临时打开、播完关掉（`:842`）：

```js
if (Cesium.ClockRange) this.viewer.clock.clockRange = Cesium.ClockRange.CLAMPED;
this.viewer.clock.shouldAnimate = true;
this.viewer.scene.maximumRenderTimeChange = 0;
this.historyPlaybackActive = true;
```

并在 `clock.onTick` 里监听到 `stopTime` 后复位（`:217`）：

```js
this.historyClockStopListener = this.viewer.clock.onTick.addEventListener((clock) => {
  if (!this.historyPlaybackActive ||
      !Cesium.JulianDate.greaterThanOrEquals(clock.currentTime, clock.stopTime)) {
    return;
  }
  clock.shouldAnimate = false;
  this.historyPlaybackActive = false;
  this.viewer.scene.maximumRenderTimeChange = Infinity;
  this.requestRender();
});
```

**结果**：烟测事件里 `"clockAnimating":false, "idleRenderTimeChange":true`（空闲态），播放时 `"clockAnimating":true, "timeDrivenRendering":true`，停止后回到 `"idleRenderTimeChange":true`——两种模式切换正常。

---

### 3.4 二维轨迹：每两点一个 Feature 改成 256 点合并成一条

**原本逻辑**（改动前的 `drawRouteSegment`）：

```js
const coordinates = [
  this.to3857(previous.geo_location),
  this.to3857(current.geo_location),
];
this.routeSource.addFeature(
  new Feature({ type: "LineString", geometry: new LineString(coordinates), color: "#12FF9B" }),
);
```

相邻两点建一个独立 `Feature`。6000 个点 = 6000 个 Feature，每个都带自己的 `LineString` geometry。

**问题**：OpenLayers 的 Vector Layer 每帧要遍历 source 里所有 Feature 做样式求值和绘制准备。Feature 数量等于点数，历史越长，一次 rendering cycle 遍历的对象越多。`优化过程.md` 5.8 节把这个列为「二维地图场景本身也会随历史对象增加而复杂化」。

**为什么改**：把 Feature 数量从 O(n) 降到 O(n/256)，6000 点从 6000 个 Feature 变成 24 个。

**依据**：同上，以及 2.2 节二维 5000 点历史时 5.35 FPS、单帧 2.97 秒。

**改法**（`components/PlanimetricMap.vue:61`、`:623`）：

```ts
const ROUTE_CHUNK_MAX_POINTS = 256;
```

```ts
drawRouteSegment(previous, current) {
  if (!this.routeSource || !this.hasValidGeoLocation(previous) || !this.hasValidGeoLocation(current)) {
    this.resetRouteChunk();
    return;
  }
  const previousCoordinate = this.to3857(previous.geo_location);
  const currentCoordinate = this.to3857(current.geo_location);
  const last = this.routeChunkLastCoordinate;
  const continuous = last &&
    last[0] === previousCoordinate[0] &&
    last[1] === previousCoordinate[1];
  if (!this.routeChunkFeature ||
      this.routeChunkPointCount >= ROUTE_CHUNK_MAX_POINTS ||
      !continuous) {
    this.routeChunkFeature = new Feature({
      type: "LineString",
      geometry: new LineString([previousCoordinate, currentCoordinate]),
      color: "#12FF9B",
    });
    this.routeSource.addFeature(this.routeChunkFeature);
    this.routeChunkPointCount = 2;
  } else {
    this.routeChunkFeature.getGeometry().appendCoordinate(currentCoordinate);
    this.routeChunkPointCount += 1;
  }
  this.routeChunkLastCoordinate = currentCoordinate;
}
```

`appendCoordinate` 直接往已有 geometry 尾部追加，不新建对象。`continuous` 判断保证上一段末点与本段起点坐标一致才续接，否则另起一段。

**结果**：烟测 `two_d_loaded` 事件记录 260 点 → `"logical":260, "physical":260, "routes":2`（`interaction-smoke-route-visibility/events.jsonl`）。点数保留完整，轨迹对象从 259 个降到 2 个。

---

### 3.5 二维样式：每次回调 `new Style` 改成 Map 缓存

**原本逻辑**：

```js
style: (feature) => {
  return new Style({
    fill: new Fill({ color: "#12FF9B" }),
    stroke: new Stroke({ color: feature.get("color"), width: 2 }),
  });
},
```

样式函数是每次重绘对每个 Feature 调用的。6000 个点 = 每次重绘新建 6000 个 `Style` + 6000 个 `Fill` + 6000 个 `Stroke`。

**问题**：对象分配量随点数线性增长，且这些对象内容完全相同（颜色只有 6 种）。除了分配开销，还会产生大量短命对象，加重 GC。

**为什么改**：颜色取值有限（6 档），完全可以复用。

**依据**：`优化过程.md` 5.17 节把「避免每点调用 getFeatures()」「自己维护 Feature / 引用」列为二维优先验证方向；样式对象复用属于同一类。

**改法**（`components/PlanimetricMap.vue:350`）：

```ts
getRouteStyle(color) {
  if (!this.routeStyleCache) this.routeStyleCache = new Map();
  if (!this.routeStyleCache.has(color)) {
    this.routeStyleCache.set(color, new Style({
      fill: new Fill({ color: "#12FF9B" }),
      stroke: new Stroke({ color, width: 2 }),
    }));
  }
  return this.routeStyleCache.get(color);
},
getPointStyle(color, radius) {
  if (!this.pointStyleCache) this.pointStyleCache = new Map();
  const key = `${color}:${radius}`;
  if (!this.pointStyleCache.has(key)) {
    this.pointStyleCache.set(key, new Style({
      image: new CircleStyle({ radius, fill: new Fill({ color }) }),
    }));
  }
  return this.pointStyleCache.get(key);
},
```

图层改为 `style: (feature) => this.getPointStyle(feature.get("color"), feature.get("radius"))`。

**结果**：烟测事件 `two_d_loaded` 返回 `"pointStyleReused":true, "routeStyleReused":true`，缓存命中。

---

### 3.6 二维点击选中：遍历全部点重建 Style 改成只改一个

**原本逻辑**（改动前的 `handleMapClick`）：

```js
this.pointSource.getFeatures().forEach((item) => {
  const originColor = item.get("color");
  item.setStyle(new Style({
    image: new CircleStyle({ radius: 5, fill: new Fill({ color: originColor }) }),
  }));
});
selectedFeature.setStyle(new Style({
  image: new CircleStyle({ radius: 5, fill: new Fill({ color: "#0095FF" }) }),
}));
```

点一次，把**所有**点（几千个）的 style 全部重建一遍。

**问题**：单次点击是 O(n) 且伴随 n 次对象分配。历史越长，一次点击越卡，而点击是纯交互行为，与数据量本不该相关。

**为什么改**：只需要把上一个选中项恢复、给当前项设高亮，两件事各 O(1)。

**依据**：与 3.5 同源，`优化过程.md` 5.17 节「避免每点调用 getFeatures()」。

**改法**（`components/PlanimetricMap.vue:808`）：

```ts
if (this.selectedPointFeature && this.selectedPointFeature !== selectedFeature) {
  this.selectedPointFeature.setStyle(undefined);      // 交回图层默认样式
}
selectedFeature.setStyle(this.getPointStyle("#0095FF", 5));
this.selectedPointFeature = selectedFeature;
```

`setStyle(undefined)` 让该 Feature 回落到图层的 `style` 回调（也就是缓存里的原色样式），不需要重建对象。同时在 `removeTC` / `removeCircle` / `redrawConcentrationByGas` / `createCircle` / `createHistoryLine` 里同步清掉 `selectedPointFeature`，避免指向已移除的 Feature。

**结果**：单次点击的对象分配从 O(n) 降到 O(1)。此项没有单独的性能测量，属于附带修复。

---

### 3.7 二维视角跟随：去掉每次 `updateSize()`

**原本逻辑**：

```js
if (this.$parent.viewFlag) {
  this.map.updateSize();
  this.map.getView().setCenter(center3857);
}
```

每画一个点，只要开着跟随就调一次 `updateSize()`。

**问题**：`updateSize()` 会读取地图容器的实际尺寸并触发 OpenLayers 重新计算视口，是同步布局操作。每帧一次就会在脚本阶段产生强制同步布局（forced layout），LoAF 的 `forcedStyleAndLayoutDuration` 会把它单独计出来。

**为什么改**：批量消费时一帧可能画多个点，`updateSize()` 会被调用多次，而容器尺寸在一个批次内不会变。

**依据**：运行指标面板专门有一行「脚本内强制布局」（`dataVisualization.vue:397`）用来盯这个数；`优化过程.md` 5.3 节指出二维存在单帧尖峰。

**改法**（`components/PlanimetricMap.vue:518`）：

```ts
drawRealtimePoint(pointIndex = this.index, updateView = true) {
  ...
  // 2) 是否跟随居中（保持你原逻辑）
  if (updateView && this.$parent.viewFlag) {
    this.map.getView().setCenter(center3857);
  }
```

`updateSize()` 整段删掉；跟随只在批次的最后一个点执行（`drawRealtimeBatch` 传 `index === lastIndex`）。需要真正的尺寸刷新时（面板展开收起、切地图）走 `updatedMapSize()`，它本来就有 `setTimeout` 包裹。

**结果**：一帧内不再有重复的同步布局。`StereoscopicMap.nowBar` 同步加了 `updateView` 参数，只在最后一个点调 `changeView`。

---

### 3.8 子组件驱动方式：`deep watch mapList` 改成版本号 `realtimeBatchId`

**原本逻辑**：

```js
// PlanimetricMap.vue
mapList: {
  deep: true,
  handler(newVal) {
    ...
    this.drawRealtimePoint();
  },
},

// StereoscopicMap.vue
mapList: {
  deep: true,
  handler(newval) {
    ...
    this.nowBar(newval[this.index]);
    this.updateRealtimeRoute(newval);   // 全量重建轨迹
  },
},
```

**问题**：两个：
1. Vue 2 的 `deep: true` 会对整个数组做递归依赖收集与遍历，数组每加一个点就重新走一遍全部元素。6000 个点时这个遍历本身就是一笔开销，而且它发生在响应式系统内部，不易被 LoAF 归因。
2. watch 回调拿到的是整个新数组，三维的 `updateRealtimeRoute(newval)` 因此是「全量重建」——也就是 3.2 里那个 O(n) 路径的调用方。

**为什么改**：子组件真正需要的只是「这一批新增了哪几个点」，不是整个数组。

**依据**：`优化过程.md` 5.7 节明确把 `mapList 数组规模` 列为二维随历史增长的负担之一。

**改法**——父组件只下发批次和版本号（`dataVisualization.vue:1009`）：

```ts
appendRealtimeBatch(this.realtimeMapStore.points, result.data);
this.visualPointCount = this.realtimeMapStore.points.length;
this.realtimeBatch = result.data.slice();
this.realtimeBatchId += 1;
```

子组件只监听版本号：

```ts
// PlanimetricMap.vue:168
/** 只监听批次版本，不再深度遍历不断增长的完整 mapList。 */
realtimeBatchId() {
  if (this.searchType !== 1) return;
  if (this.$parent && this.$parent.mapType !== 1) return;
  this.drawRealtimeBatch(this.realtimeBatch);
},
```

```ts
// PlanimetricMap.vue:499
drawRealtimeBatch(batch) {
  if (!Array.isArray(batch) || !batch.length) return;
  this.points = Array.isArray(this.mapList) ? this.mapList : [];
  const startIndex = Math.max(0, this.points.length - batch.length);
  const lastIndex = this.points.length - 1;
  for (let index = startIndex; index <= lastIndex; index++) {
    this.drawRealtimePoint(index, index === lastIndex);
  }
  this.index = lastIndex;
  this.dataForm = this.points[lastIndex];
},
```

`startIndex = points.length - batch.length` 用数组长度反推出这批新增点的下标范围，只处理新增部分。`mapList` 的 watch 保留但改成 `deep: false`，并且在实时模式直接 `return`，只留给历史模式用。

三维同理（`StereoscopicMap.vue:59`、`:84`），且 `drawRealtimeBatch` 末尾调的是增量版 `appendRealtimeRoute(batch)`。

**结果**：实时链路不再有对完整数组的深度遍历；三维每批只对新点做 `Cartesian3` 构造。

---

### 3.9 实时点容器：`Object.freeze` 外壳，不让 Vue 观测点数组

**原本逻辑**：

```js
const nextMapPoints = appendRealtimeBatch(this.mapList, result.data);
this.gasdata = { ...result, data: nextGasPoints };
this.mapList = nextMapPoints;
```

`mapList` 是 `data()` 里的普通数组，Vue 2 会对它以及它的每个元素递归 `defineProperty`。每加一个点，新点对象整体被转成响应式。

**问题**：点位对象有十几个字段，6000 个点意味着几万个属性的 getter/setter 劫持，而这些点进地图之后不会再被修改——观测它们没有收益，只有成本。`优化过程.md` 5.7 节把 `mapList 数组规模` 列为二维负担。

**为什么改**：地图点只需要「追加」和「取整条数组」，不需要 Vue 追踪单个字段变化。驱动重绘由 3.8 的版本号负责。

**依据**：3.8 已经把重绘驱动换成版本号，点数组不再需要是响应式的。

**改法**（`dataVisualization.vue:662`、`:692`）：

```ts
// 冻结外壳阻止 Vue 2 对完整实时点数组递归观测；数组本身仍可追加。
realtimeMapStore: Object.freeze({ points: [] }),
```

```ts
computed: {
  currentMapPoints() {
    return this.searchType === 1 ? this.realtimeMapStore.points : this.mapList;
  },
},
```

`Object.freeze` 冻结的是外层对象，Vue 遇到冻结对象会跳过观测；里面的 `points` 数组没有被冻结，仍然可以 `push`。模板和子组件统一改用 `currentMapPoints`。需要展示的点数改成手动维护的 `visualPointCount`。

配套把 `appendRealtimeBatch` 从「返回新数组」改成「原地追加」（`utils/visualizationData.ts:29`）：

```ts
/** 实时地图追加：数组由非深度响应式容器持有，所有点均保留。 */
export function appendRealtimeBatch<T extends object>(points, incoming): T[] {
  const currentPoints = Array.isArray(points) ? points : [];
  if (Array.isArray(incoming)) {
    for (const point of incoming) {
      if (point && typeof point === "object") currentPoints.push(point);
    }
  }
  return currentPoints;
}
```

原来是 `currentPoints.concat(nextPoints)`，每次都复制整个数组——6000 点时是 6000 个元素的复制，改成 `push` 后是 O(新增数)。

**结果**：实时点数组不再进入 Vue 响应式系统；每次追加不再复制整个数组。这一条和 3.8 一起生效，未做单独拆分测量。

---

### 3.10 折线图：deep watch + 每次 `setOption`/`resize` 改成 120 ms 节流 + `lazyUpdate`

**原本逻辑**：

```js
watch: {
  newdata: {
    handler() { this.updateOptions(); },
    deep: true,
  },
},
...
this.chart.setOption(options, { notMerge: true, lazyUpdate: false });
this.chart.resize();
```

页面上有 4 个 `Charts` 实例（CH4、CO2、风速浓度、实时监测，见 `dataVisualization.vue:29`/`:44`/`:453`/`:468`）。父组件每次 `handleRealtimePacket` 都换一个新的 `gasdata` 对象，于是：

- 20 点/秒 × 4 个图 = 每秒 80 次 `setOption`（`lazyUpdate: false` 表示同步立即重绘）；
- 每次后面还跟一次 `chart.resize()`，强制读取容器尺寸并重新布局；
- `deep: true` 让每个图对整个 `data` 数组做深度遍历。

**问题**：折线图是这条链路上被重复触发次数最多的一环。`resize()` 是同步布局操作，80 次/秒的同步布局足以把主线程打满。

**为什么改**：折线图看的是趋势，120 ms 内的多次更新合并成一次，视觉上没有差别，但重绘次数降到约 1/3～1/20（取决于每帧点数）。

**依据**：`优化过程.md` 第 2 章【七】的「空渲染对照」——数据取出后不写入响应式状态、图表不重绘时 FPS 明显回升，说明成本在绘制链路而非取数链路。

**改法**（`components/Charts.vue:93`）：

```ts
scheduleUpdateOptions() {
  if (this.searchType !== 1) {
    this.updateOptions();
    return;
  }
  if (this.chartUpdateTimer !== null) return;   // 窗口内已有待执行更新，直接丢弃
  this.chartUpdateTimer = setTimeout(() => {
    this.chartUpdateTimer = null;
    this.updateOptions();
  }, 120);
},
```

```ts
this.chart.setOption(options, {
  notMerge: true,
  lazyUpdate: true,        // 交给下一帧统一提交
});
// 删掉 this.chart.resize()
```

`lazyUpdate: true` 让 ECharts 把更新推迟到下一帧统一处理；`resize()` 交给 `mixins: [resize]`（`QHZHC_Web/src/utils/resize.ts`，监听 `window.resize` 与侧栏 `transitionend`，debounce 100 ms 后调 `chart.resize()`），不再每次数据更新都调用。`searchType` 切换时先 `clearTimeout` 再立即刷新，保证历史查询不被节流延迟。`newdata` 的 watch 同时改成 `deep: false`。

**结果**：20 点/秒、batch=1 时，折线图 `setOption` 从约 80 次/秒降到约 8 次/秒/图（4 图共约 33 次/秒）；同步 `resize()` 归零。此项未做单独测量。

---

### 3.11 折线图数据：全量保留改成 5 分钟窗口 + 6000 点上限

**原本逻辑**：

```js
applyRealtimeInitialWindow(result) {
  const points = Array.isArray(result.data) ? result.data : [];
  this.gasdata = result;                    // 初始 5 分钟窗口，未做裁剪
  this.mapList = points.slice();
}
```

并且 `appendRealtimeTimeWindow` 只按时间过滤，不限制条数。

**问题**：折线图数据只增不减。跑 30 分钟、20 点/秒就是 36000 个点，每次 `setOption` 都要把这 36000 个点交给 ECharts 重新布局；同时 `appendRealtimeTimeWindow` 每次调用都要把新旧数组拼成一个新数组再做一遍 `map` + `filter` + `sort`。

**为什么改**：折线图的业务语义本来就是「最近 5 分钟趋势」（页面标题就是时序变化图），超出窗口的数据没有展示价值。地图轨迹要保留完整路径，所以两条线用不同策略——这一点在代码注释里写明了。

**依据**：`history-microbenchmark.json` 的 `comparison` 直接给出：`retainedPointsAfter30MinutesAt20PerSecond: 36000` vs `retainedPointsWithFiveMinuteCapAt20PerSecond: 6000`。

**改法**（`utils/visualizationData.ts:13`、`:42`）：

```ts
export const REALTIME_CHART_WINDOW_MS = 5 * 60 * 1000;
export const REALTIME_VISUAL_HISTORY_MAX_POINTS = 6_000;
```

```ts
export function appendRealtimeTimeWindow<T extends { time?: string | number | Date }>(
  points, incoming,
  windowMs = REALTIME_CHART_WINDOW_MS,
  maxPoints = REALTIME_VISUAL_HISTORY_MAX_POINTS,
): T[] {
  const combined = [...(points || []), ...(incoming || [])];
  const timestamped = combined
    .map((point) => { /* 解析 time */ })
    .filter(({ point, timestamp }) => Boolean(point) && Number.isFinite(timestamp));
  if (!timestamped.length) return [];
  const end = Math.max(...timestamped.map(({ timestamp }) => timestamp));
  const start = end - windowMs;
  return timestamped
    .filter(({ timestamp }) => timestamp >= start && timestamp <= end)
    .map(({ point }) => point)
    .slice(-Math.max(1, Math.floor(maxPoints)));
}
```

父组件侧（`dataVisualization.vue:1005`）：

```ts
// 两条曲线用的是不同的保留策略，所以必须各自增量合并，不能共用一份：
// 折线图按时间窗口淘汰（以最新点为基准向前留 REALTIME_CHART_WINDOW_MS），
// 地图轨迹不设上限、全量保留，长度只受运行时长与订阅频率影响。
const nextGasPoints = appendRealtimeTimeWindow(this.gasdata.data, result.data);
appendRealtimeBatch(this.realtimeMapStore.points, result.data);
```

进入实时模式时初始窗口也走同一函数（`applyRealtimeInitialWindow`，`:1204`）。

**结果**：折线图数据上限固定在 6000 点 / 5 分钟，不再随运行时长增长。地图轨迹仍全量保留——这是刻意的选择，代价由 3.2、3.4 的分段与增量承担。

---

### 3.12 每帧批量消费：`maxPerFrame`

**原本逻辑**：`FrameTelemetryQueue` 默认 `maxPerFrame = 1`，一帧只取一个点。

**问题**：1 秒 20 个点、可用帧只有 10 FPS 时，一秒只能消费 10 个，队列必然积压（2.1 节二维消费 414/1180）。

**为什么改**：一次地图更新有固定开销 F（进入更新、遍历场景、样式求值、绘制准备、四个 ECharts 提交）。同一帧里多画几个点，F 只付一次。

**依据**：batch 扫描（20 点/秒固定，改 batch）：

| batch | 二维 消费/接收 | 二维 FPS | 二维 LoAF 次数 | 三维 消费/接收 | 三维 FPS | 三维 LoAF P95 |
| ---: | --- | ---: | ---: | --- | ---: | ---: |
| 1 | 414 / 1180 | 10.49 | 413 | 342 / 1160 | 9.07 | 249.5 ms |
| 2 | 634 / 1160 | 12.83 | 313 | 576 / 1180 | 8.50 | 321.8 ms |
| 5 | 1055 / 1160 | 25.51 | 218 | 860 / 1160 | 6.75 | 582.7 ms |
| 10 | 1180 / 1180 | 46.19 | 138 | 1060 / 1160 | 6.85 | 667.7 ms |
| 20 | 1180 / 1180 | 54.94 | 110 | 1140 / 1140 | 7.47 | 739.2 ms |

二维 batch 1→20：消费 414→1180（2.85×）、FPS 10.49→54.94（5.24×）、LoAF 413→110。数据总量没变，少的只是地图被触发的次数——**固定成本 F 确实是二维的主要项**。

三维则相反：吞吐追平了（pending 归零），但 FPS 从 9.07 掉到 7.47、LoAF P95 从 249.5 涨到 739.2 ms。**三维不能靠加大 batch 解决**，这与 3.1～3.3 要处理的点级成本一致。

**改法**：`FrameTelemetryQueue` 保留 `maxPerFrame` 参数并支持运行时热更新（`services/FrameTelemetryQueue.ts:45`）：

```ts
setMaxPerFrame(value: number): void {
  const next = FrameTelemetryQueue.normalizeLimit(value);
  if (next === this.maxPerFrame) return;
  this.maxPerFrame = next;
  this.schedule();
}
```

界面下拉 `渲染模式` 可选 自动/1/2/5/10/20/50（`dataVisualization.vue:602`）。取点循环里加了 `batch.length === 0 ||` 这个短路（`FrameTelemetryQueue.ts:122`），保证**时间预算耗尽时至少也会取一个点**，否则在极端慢的帧上会出现「预算一到就退出、一个点都没取、下一帧继续空转」的死循环风险。

**结果**：二维 batch=10 即可追平 20 点/秒输入（1180/1180，pending 0，FPS 46.19）。生产上不写死这个值，交给 3.14 的自适应控制器。

---

### 3.13 订阅降档：`maxPointsPerSecond`

**原本逻辑**：客户端在握手时只能说「全部接收」，服务端每秒下发的点数不受客户端控制。

**问题**：三维的单位时间数据量 N 是瓶颈的主要变量之一（rate 扫描结论），但没有客户端侧手段去压 N。

**依据**：rate 扫描（rate 与 batch 同值，一起降）三维：

| rate=batch | FPS 均值 | LoAF P95 | Cesium 回调单帧均值 | Cesium 回调累计 |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 44.08 | 93.2 ms | 13.7 ms | 1123 ms |
| 2 | 34.33 | 84.3 ms | 17.3 ms | 2702 ms |
| 5 | 16.18 | 192.1 ms | 35.5 ms | 16095 ms |
| 10 | 9.62 | 421.6 ms | 57.5 ms | 15978 ms |
| 20 | 7.47 | 739.2 ms | 134.6 ms | 24234 ms |

三维 rate=20 降到 rate=1：FPS 5.9 倍、LoAF P95 -87.4%、Cesium 回调累计 -95.4%。

更关键的交叉对比：**固定 batch、只降 rate**（左侧 rate 扫描，右侧 batch 扫描）：

| batch | 三维 rate=batch | 三维 rate 固定 20 | 倍数 |
| ---: | ---: | ---: | ---: |
| 1 | 44.08 | 9.07 | 4.9× |
| 2 | 34.33 | 8.50 | 4.0× |
| 5 | 16.18 | 6.75 | 2.4× |
| 10 | 9.62 | 6.85 | 1.4× |

每帧点数完全相同时，只把每秒接收量降下来就能拿到数倍改善。**N 比 K（更新次数）强得多。**

**改法**：握手报文带上档位（`services/realtimeClient.ts:348`）：

```ts
socket.send(JSON.stringify({
  type: "authenticate",
  accessToken,
  protocolVersion: PROTOCOL_VERSION,
  robotId: ROBOT_ID,
  resumeFromBucketStartMs: this.latestBatchStartMs + SECOND_MS,
  maxPointsPerSecond: this.maxPointsPerSecond,
}));
```

档位只允许 `[0, 1, 2, 5, 10, 20]`（0 = 全部，`realtimeClient.ts:77`）。改档位需要重连才能让新参数生效，但不能走「异常断线」的恢复路径，所以用专门的关闭码（`:285`）：

```ts
private applyPointLimit(value: DeliveryPointLimit): void {
  if (!ALLOWED_POINT_LIMITS.includes(value) || value === this.maxPointsPerSecond) return;
  this.maxPointsPerSecond = value;
  if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
    this.socket.close(REALTIME_CLOSE_CODE.PAGE_HIDDEN, "subscription changed");
  }
}
```

对比 `setMaxPerFrame`（`:267`）明确不重连：

```ts
/**
 * 热更新每帧渲染数量。
 * 这是纯客户端参数，只影响帧队列每帧取几个点，服务端不感知，
 * 因此不需要像 setMaxPointsPerSecond 那样断开重连。
 */
```

**结果**：界面 `每秒接收` 下拉可手动切档（`dataVisualization.vue:260`），自动模式下由 3.14 控制。降档会丢弃部分点位，所以只作为过载时的兜底手段，不作为常规路径。

---

### 3.14 自适应控制器：按实测帧率与积压自动调整 batch 与订阅档位

**原本逻辑**：`maxPerFrame` 是界面下拉写死的常量，页面卡顿了也不会自己变。

**问题**：目标设备性能未知、网络与数据量会变，写死一个值在一种设备上合适、在另一种设备上就会积压或浪费。

**依据**：3.12 的表格说明 batch 的最优值依赖设备（二维 10 就够、20 收益递减；三维加大反而恶化）；3.13 说明降档有收益但会丢数据，不该一直降。所以需要一个「够了就别动、不够才加、加不动才降」的闭环。

**改法**：`services/AdaptiveRenderController.ts` 是一个纯决策类，不持有定时器和连接，便于用构造出来的样本做单元测试。每秒由 `dataVisualization.vue` 的 rAF 回调喂一次样本（`dataVisualization.vue:769`）：

```ts
this.realtimeClient.reportRenderPerformance({
  nowMs: performance.now(),
  actualFps: snapshot.fps,
  baselineFps: snapshot.baselineFps,
  renderP95Ms: this.renderP95Ms,
  frameIntervalMs: snapshot.frameIntervalMs,
});
```

决策逻辑（`AdaptiveRenderController.ts:147`）：

```ts
const frameBudgetMs = Math.max(1, frameIntervalMs / 2);          // 帧预算 = 帧间隔的一半
const requiredBatchSize = clamp(
  Math.ceil((arrivalRate + pending / catchUpWindowSeconds) / actualFps),
  minBatchSize, maxBatchSize,
);                                                                // 追平输入所需的 batch
const queueSlope = sample.pending - this.previousPending;
const fpsHealthy = sample.baselineFps <= 0 || sample.actualFps >= sample.baselineFps * 0.9;
const renderWithinBudget = sample.renderP95Ms <= 0 || sample.renderP95Ms <= frameBudgetMs;
const overloaded = sample.oldestPendingMs > this.queueAgeLimitMs || queueSlope > 0;
```

四条规则：

1. **渲染未超预算** → 抬高安全上限 `safeBatchSize`；**超了** → 把 `safeBatchSize` 拉到 `batchSize - 1`。
2. **积压在涨或队首等待超 1 秒** → 若渲染仍在预算内，`batchSize` 至少抬到 `requiredBatchSize`；否则压回 `safeBatchSize`。
3. **连续 5 个窗口都健康**（pending 0、队首等待 0、FPS ≥ 基线 90%、渲染在预算内）→ `batchSize` 减 1，慢慢退回小批量。
4. **连续 3 个窗口过载且已经无法再安全加大 batch** → 沿阶梯降一档订阅，冷却 30 秒；反之持续健康 60 秒后试探升一档。

订阅档位阶梯（`AdaptiveRenderController.ts:41`）：

```ts
const POINT_LIMIT_LADDER: DeliveryPointLimit[] = [0, 20, 10, 5, 2, 1];
```

决策结果只作为建议返回，由 `realtimeClient.reportRenderPerformance`（`:238`）负责执行，并且只在自动模式生效：

```ts
if (decision.batchSize !== this.maxPerFrame) this.applyMaxPerFrame(decision.batchSize);
if (decision.requestedPointLimit !== null &&
    decision.requestedPointLimit !== this.maxPointsPerSecond) {
  this.applyPointLimit(decision.requestedPointLimit);
}
```

**结果**：界面默认 `渲染模式 = 自动`（`dataVisualization.vue:602`）。`implementation-validation.json` 记录单元测试 19 个套件 / 146 个用例通过。运行指标面板的「控制状态」一行直接显示当前 `reason`，例如 `queue growing; increase batch`、`render budget reached`、`sustained overload; lower input rate`、`healthy; decrease batch slowly`。

---

### 3.15 帧率测量：不再用「数据提交次数」冒充 FPS

**原本逻辑**：

```js
// FPS 计量：每帧在 handleRealtimePacket 里累加 _frameCount；只有"时间满 1 秒且当前队列
// 不为空"才把累计帧数提交为 FPS，并清零计数与窗口起点。队列空时不提交、不清零，
// FPS 保留最近一次有效值（不会显示 0）。
aggregateFps() {
  const now = performance.now();
  if (now - this._frameWindowStart >= 1000 && this.queuePending > 0) {
    this.fps = this._frameCount;
    ...
  }
}
```

**问题**：这个数字统计的是「这一秒调用了多少次 `handleRealtimePacket`」，它等于「每秒消费的批次数」，不等于浏览器实际出画帧率。副作用有两个：
1. 队列空时不更新，面板上的数字会停在旧值，看不出页面是否已经卡死；
2. 批量调大后提交次数下降，这个数字跟着下降，会被误读成「性能变差了」——与 3.12 里三维加大 batch 后真实 FPS 下降的现象混在一起，无法分辨。

**为什么改**：需要一个与数据无关的、真实反映浏览器调度能力的 FPS，作为 3.14 里 `fpsHealthy` 的判断基准。

**依据**：`优化过程.md` 第 2 章【二】「真正的问题首先表现为可用渲染帧大量减少」——要看的是可用帧，不是提交次数。

**改法**：`services/RenderPerformanceMonitor.ts` 起一条独立的 rAF 循环，不受有没有数据影响：

```ts
private readonly tick = (timestamp: number): void => {
  if (!this.running) return;
  if (this.windowStart === null) this.windowStart = timestamp;
  this.frameCount += 1;
  const elapsed = timestamp - this.windowStart;
  if (elapsed >= this.sampleWindowMs) {
    this.lastFps = this.frameCount * 1000 / elapsed;
    this.frameIntervalMs = elapsed / this.frameCount;
    this.baselineFps = Math.max(this.baselineFps, this.lastFps);   // 取历史最大值当能力基准
    this.onSample?.(this.snapshot());
    this.windowStart = timestamp;
    this.frameCount = 0;
  }
  this.handle = this.scheduler.request(this.tick);
};
```

`baselineFps` 取历史最大帧率，作为「这台机器在这套页面上能跑到多少」的参考，自适应控制器用它算 `fpsHealthy`（`actualFps >= baselineFps * 0.9`）。

原来的提交次数改名为 `submitRate`（`dataVisualization.vue:899`），与 FPS 分两行显示，不再互相冒充。同时新增：

- `recordRenderCompletion`（`:795`）：`$nextTick` 后测一次「数据提交到 DOM 更新完成」的耗时，再在下一个 rAF 测端到端延迟；用最近 120 个样本取 P95 得到 `renderP95Ms`，喂给自适应控制器当渲染预算判据。
- `emptyRender` 开关（`:584`）：取出数据后不写任何响应式状态，用于对照「空渲染」与真实渲染的差值。当前为 `false`。

**结果**：面板上 `rAF FPS` 与 `数据提交频率` 分离；`提交 P95` 成为自适应控制的输入。三维优化后 109.10 FPS 这个数字就是这条独立 rAF 采出来的。

---

### 3.16 长帧归因：Long Task 换成 LoAF

**原本逻辑**：只有 LoAF 的计数，或者用 Long Task（只有 `duration`，没有阶段划分）。

**问题**：Long Task 只有一个总时长，无法区分「脚本算太久」还是「样式布局太久」，也就无法判断该去改 JS 还是改绘制。三维的长帧到底是谁造成的，在这套数据下说不清。

**依据**：`优化过程.md` 第 2 章【三】【四】【五】：二维和三维的长帧主要耗时都不在 DOM Style/Layout 阶段，三维能继续归因到 Cesium 自身的动画帧回调。这些结论必须依赖带阶段划分的数据才能得出。

**改法**：`services/LongFrameDiagnostics.ts` 用 `PerformanceObserver` 订阅 `long-animation-frame`，把一条长帧拆成三段（`dataVisualization.vue:396` 面板上的「rAF 等 / 样式起点后」就是其中两段）：

```ts
latestPreStyleMs: entry.renderStart && entry.styleAndLayoutStart &&
  entry.styleAndLayoutStart >= entry.renderStart
  ? entry.styleAndLayoutStart - entry.renderStart : 0,      // 阶段一：进入渲染周期前
latestRenderMs: entry.renderStart && entry.renderStart < end
  ? end - entry.renderStart : 0,                            // 阶段二之后
latestPostStyleMs: entry.styleAndLayoutStart && entry.styleAndLayoutStart < end
  ? end - entry.styleAndLayoutStart : 0,                    // 阶段三
latestForcedLayoutMs: scripts.reduce(
  (sum, script) => sum + (script.forcedStyleAndLayoutDuration || 0), 0,
),                                                          // 脚本内强制布局
```

同时记录脚本归因（`scripts` 数组）里耗时最大的一项，得到「最耗时脚本入口」和「调用来源」。`durations` 只保留最近 200 条，P95 在这个窗口上算（`LongFrameDiagnostics.ts:106`）。

面板上还写了一条口径说明，避免误读（`dataVisualization.vue:400`）：

```html
<div class="stats-note">无归因时脚本耗时不可判定；“样式起点后”含布局和绘制，不能单独视作布局耗时。</div>
```

**结果**：三维长帧能归因到 Cesium 的 rAF 回调（rate 扫描表里「Cesium 回调累计 / 单帧均值」两列就是这么来的）；二维能确认主要耗时集中在第二阶段。所有实验脚本统一用这套指标产出 `fps.jsonl` / `loafs.jsonl`。

---

### 3.17 天气组件：传整个 `gasdata` 改成只传最新点

**原本逻辑**：

```html
<Weather :location="weather_location_data" :newdata="gasdata"></Weather>
```

`gasdata.data` 每次都被整体替换，Weather 拿到的 props 每次都变，于是每次数据到达都要重算一遍天气卡片。

**问题**：天气只关心「车现在在哪」和最新一个点的气象字段，跟几千个历史点无关，却被绑在整个数据集上。

**依据**：同 3.9、3.10——不必要的 props 变化会触发不必要的子组件更新。

**改法**（`dataVisualization.vue:19`、`:1308`）：

```html
<Weather :location="weather_location_data" :latest-point="weatherLatestPoint"></Weather>
```

```ts
weatherLocationUpdate(point) {
  this.weatherLatestPoint = point || null;
  if (point && Array.isArray(point.geo_location)) {
    const next = point.geo_location.map(Number);
    if (next.length !== 2 || !next.every(Number.isFinite)) return;
    const current = this.weather_location_data;
    if (Array.isArray(current) && current.length === 2 &&
        current.every((value) => Number.isFinite(Number(value))) &&
        current.every((value, index) => Number(value).toFixed(2) === next[index].toFixed(2))) {
      return;                      // 经纬度没变到小数点后两位就不更新
    }
    this.weather_location_data = next;
  }
}
```

加了坐标比较：车辆每秒移动的距离通常远小于 0.01 度，所以经纬度 prop 实际变化频率远低于数据到达频率。

**结果**：天气组件不再随每次数据到达而更新。此项未做单独测量。

---

## 4. 优化后的实测

### 4.1 同条件前后对照

条件：空场景（0 点历史）、订阅 rate=1、渲染 batch=1、60 秒、Chrome headless 1440×900、服务端生成 20 点/秒。
优化前取 `h0-singlepoint-2026-09-24/baseline-2d`、`baseline-3d`；优化后取 `post-2d`、`post-3d`。

| 指标 | 二维 前 | 二维 后 | 三维 前 | 三维 后 |
| --- | ---: | ---: | ---: | ---: |
| rAF FPS 均值 | 131.67 | 132.29 | 42.63 | **109.10** |
| FPS P5 | 108.71 | 104.42 | 24.57 | **78.54** |
| LoAF 次数 | 57 | **40** | 78 | **52** |
| LoAF 中位 | 62.2 ms | 61.0 ms | 67.1 ms | 71.8 ms |
| LoAF P95 | 74.20 ms | 76.40 ms | 95.10 ms | **85.70 ms** |
| LoAF 最大 | 82.30 ms | 267.60 ms | 161.00 ms | **117.20 ms** |
| LoAF > 100 ms 条数 | 0 | 1 | 1 | 2 |
| LoAF > 200 ms 条数 | 0 | 1 | 0 | 0 |
| 接收 / 消费 | 59 / 59 | 59 / 59 | 59 / 59 | 59 / 59 |
| 结束积压 | 0 | 0 | 0 | 0 |

### 4.2 怎么读这张表

**三维的改善是实打实的**：FPS 42.63 → 109.10（2.56 倍）、FPS P5 24.57 → 78.54（3.2 倍）、最长帧 161 → 117.2 ms、LoAF 次数 78 → 52。这与 3.1～3.3 的目标一致：去掉每帧的动态属性求值、去掉全量轨迹重建、让 Cesium 在没有新数据时不要自己画。

**二维基本没变，这符合预期**：空场景只有 59 个点，Feature 数量、Entity 数量都还很小，3.4～3.7 那几条针对「历史规模」的改动在这个条件下没有发挥空间。FPS 131.67 → 132.29 在单次运行的波动范围内。真正体现二维收益的条件是 5000 点历史——但那一组只有优化前的数据（见 4.3）。

**二维出现了一次 267.6 ms 的尖峰**：优化前 57 条长帧全部 ≤ 82.3 ms，优化后出现 1 条 267.6 ms。总条数是降的（57 → 40）、中位数基本持平（62.2 → 61.0），但尾巴变长了一条。这批改动里没有哪一处应当引入 200 ms 级的单次开销，更可能是单次运行的偶发（同批实验每组只跑一次）。需要重复实验确认，不能直接当成回归。

**LoAF 中位数三维反而从 67.1 升到 71.8**：帧率从 42 提到 109 之后，落入统计窗口的帧更多，其中一部分落在 50～72 ms 区间，把中位数顶上去了一点。尾部（P95、最大）是改善的。这也说明「LoAF 条数减少」不能单独当作性能变好的证据——要看 FPS 和尾部一起看。

### 4.3 功能正确性的核对

优化后在 260 点的临时场景上跑过一轮交互烟测（`h0-singlepoint-2026-09-24/interaction-smoke-route-visibility/events.jsonl`）：

```json
{"type":"two_d_loaded","logical":260,"physical":260,"routes":2,
 "pointCache":true,"routeCache":true,"pointStyleReused":true,"routeStyleReused":true}
{"type":"three_d_loaded","physical":260,"routes":2,"routePositionCounts":[256,5],
 "firstPoint":[112,28],"lastPoint":[112.00259,28.00259],
 "clockAnimating":false,"idleRenderTimeChange":true}
{"type":"gas_switched","gas":"pri_co2","framePending":false,"physical":260,"routes":2}
{"type":"history_playback_started","active":true,"clockAnimating":true,"timeDrivenRendering":true}
{"type":"history_playback_stopped","active":false,"clockAnimating":false,"idleRenderTimeChange":true}
```

核对到的项：

- 二维逻辑点 260 = 实际 Feature 260，轨迹对象 2 个（3.4 生效），样式缓存命中（3.5 生效）。
- 三维实际对象 260，轨迹 2 段、点数分布 `[256, 5]`（3.2 生效），空闲态时钟不推进（3.3 生效）。
- 切换气体时 `framePending":false`，说明 128 点/帧的分块重着色（`StereoscopicMap.vue:381`）在采样时已经跑完，没有卡住。
- 历史播放期间时钟驱动渲染打开，播完自动关掉并复位（3.3 生效）。
- `post-2d` / `post-3d` 的 `progress.md` 都记了「地图逻辑/实体点 59/59，轨迹组 1，保留核对 通过」——轨迹分段没有丢点。



### 5.2 满负载（20 点/秒）没有优化后数据

`loaf-60s`、batch 扫描、rate 扫描全部产生于地图优化之前。当前代码在 20 点/秒下的表现没有测过。三维从 42.63 → 109.10 是在 1 点/秒下测的，不能线性外推到 20 点/秒。

### 5.3 三维仍有与数据量无关的固有成本

即使三维在 1 点/秒下跑到 109 FPS，仍然留下 52 个 LoAF、中位数 71.8 ms。二维同条件 132 FPS / 40 个 LoAF。Cesium 场景自身（地形影像、Scene update、Camera）的基线开销还没动过，`优化过程.md` 5.18 节列的「降低同时存在的 Bar Entity 数量」「必要时比较 Entity vs Primitive」还没验证。

### 5.4 长时间运行未验证

`implementation-validation.json` 里 `browserSoak` 状态是 `pending-target-environment`，要求的两个场景（二维、三维各 30 分钟 @ 20 点/秒）都没跑。内存增长、可视对象持续增加后的表现都是未知的。`history-microbenchmark.json` 也写明它的局限：Node 端微基准只能证明算法规模，浏览器 FPS、GPU 成本和堆增长要靠 soak 测。

### 5.5 几个遗留的小口子

- `visualEvicted`（面板「可视保留 / 淘汰」里「淘汰」那一半）在 `dataVisualization.vue` 里只在 `applyRealtimeInitialWindow` 和 `clearData` 里被置 0，没有任何地方累加，所以它恒为 0。地图点目前是不淘汰的（3.11 的注释说明了这是刻意选择），这个计数器要麼补上淘汰逻辑，要麼从面板去掉。
- `emptyRender`（`dataVisualization.vue:584`）是「取出数据不写状态」的实验开关，当前 `false`，留着做对照用。
- 每组实验只跑了一次，没有按 3 次取中位数。4.2 里提到的二维 267.6 ms 尖峰需要重复实验确认。
- `repositoryLint` 状态是 `blocked-by-existing-configuration`：ESLint 解析器没配 TypeScript，7 个既有的 Vue/config 解析错误。与本次改动无关，但挡住了全仓 lint。

---

## 6. 复现方法

### 6.1 单点 / 历史规模采样

```powershell
$env:QHZHC_BENCH_PASSWORD   = '<密码>'
$env:QHZHC_BENCH_MAP_TYPE   = '2'      # 1 = 二维，2 = 三维
$env:QHZHC_BENCH_POINT_LIMIT = '1'     # 订阅档位
$env:QHZHC_BENCH_FRAME_LIMIT = '1'     # 每帧消费点数
$env:QHZHC_BENCH_HISTORY_COUNT = '5000' # 预置历史点数，0 = 空场景
$env:QHZHC_BENCH_PHASE      = 'post-optimizations'
$env:QHZHC_BENCH_OUTPUT     = 'reports/realtime-rendering/h5000-singlepoint-2026-09-24/post-2d'
node scripts/measure-realtime-loaf.mjs
```

脚本会强制把模拟器速率写成 20 点/秒并在采样前后各校验一次，采样结束后恢复并核对（`restoration.json`）。

### 6.2 交互烟测

```powershell
$env:QHZHC_BENCH_PASSWORD = '<密码>'
$env:QHZHC_BENCH_OUTPUT   = 'reports/realtime-rendering/h0-singlepoint-2026-09-24/interaction-smoke'
node scripts/verify-render-interactions.mjs
```

输出 `events.jsonl`，逐条记录二维/三维加载、切气体、切回、历史播放起停，以及 `pointStyleReused` / `routeStyleReused` / `routePositionCounts` 这些可核对字段。

### 6.3 轨迹算法微基准

`history-microbenchmark.json` 是 2026-09-23 07:31 UTC 用一次性脚本跑出来的（JSON 里记了 `runtime: v22.12.0`、`rounds: 5`、`iterationsPerRound: 2000`、`batchSize: 5`），脚本本身没有留在 `scripts/` 下，目前只有产物。要重跑需要照着 JSON 里的字段结构另写一个：对每个 `historySize ∈ {300, 600, 1200, 6000}` 分别测「追加 5 点」「全量重建轨迹」「增量追加轨迹」三项，取中位数。

### 6.4 面板自查

页面右下角「图例」上方有「运行指标」按钮，展开后可以看到：缓存队列、每帧渲染、rAF FPS、数据提交频率、到达/消费、最老等待、提交 P95、订阅（目标/生效）、接收/消费、可视保留/淘汰、LoAF 次数与分位、最耗时脚本入口、控制状态。面板在展开期间每 500 ms 采样一次，关闭后停止轮询（`dataVisualization.vue:852`）。

