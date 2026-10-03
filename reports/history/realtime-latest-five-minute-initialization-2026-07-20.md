# 实时数据页最新 5 分钟初始化问题记录

## 问题概述

- 位置：数据可视化页，实时数据模式。
- 触发场景：
  - 重新进入实时数据页面。
  - 从历史数据模式切回实时数据模式。
- 期望行为：进入实时数据模式时，先返回历史最新 5 分钟数据，用于初始化图表、二维地图、三维地图、详情面板和天气定位；随后 WebSocket 实时点继续追加。
- 修复前表现：
  - 首次进入实时数据页只启动 WebSocket，页面初始化依赖 WebSocket 首包，前端没有统一的最新 5 分钟初始化入口。
  - 从历史数据切回实时数据时只清空 `mapList` 并启动实时连接，`gasdata` 可能继续保留历史查询结果，图表和地图状态不一致。
  - REST 接口 `/api/chart/dataTrans/5min` 必须传 `time`，只能表达“围绕某个点取 5 分钟”，不能表达“最新 5 分钟”。

## 根因分析

实时数据页存在多条初始化路径：

- 页面创建时直接调用 `startRealtime()`。
- WebSocket 打开后发送 `history_data_5min`。
- 历史数据切回实时数据时清空部分状态后再次调用 `startRealtime()`。
- 点击某个点时通过 `fetchFiveMinuteWindow(data.time)` 查询点位附近 5 分钟数据。

这些路径没有统一发布结果到 `gasdata`、`mapList`、`detailData`、`checkData` 和 `weather_location_data`。因此图表、地图、详情面板的初始化口径不一致，历史结果也可能残留到实时模式。

## 修复方案

### 1. 统一实时模式入口

新增实时入口方法 `enterRealtimeMode()`：

- 检查实时权限和当前查询模式。
- 重置历史查询状态、图表数据、地图数据、详情面板和加载态。
- 调用 `fetchFiveMinuteWindow()`，不传 `time`，表示查询最新 5 分钟窗口。
- 将返回结果统一发布到：
  - `gasdata`：初始化图表。
  - `mapList`：初始化 2D / 3D 地图。
  - `detailData`：使用最新点初始化详情面板。
  - `checkData` / `detailsFlag`：控制面板显示。
  - `weather_location_data`：使用最新点坐标刷新天气。
- 初始化完成后启动 WebSocket，后续实时点通过 `handleRealtimePacket()` 追加。

### 2. 避免 WebSocket 首包重复初始化

`RealtimeClient` 增加 `requestInitialHistory` 选项：

- 默认值保持 `true`，保留原有兼容行为。
- 页面已经通过 HTTP 成功加载最新 5 分钟窗口时，启动 WebSocket 时传 `requestInitialHistory: false`，避免 WebSocket 再发 `history_data_5min` 造成重复点。
- 如果 HTTP 初始化失败，则仍允许 WebSocket 请求 `history_data_5min` 作为兜底。

### 3. 扩展 REST 5 分钟接口语义

后端 `parse_five_minute_time()` 保留原行为：

- 传 `time`：查询该时间点前后共 5 分钟窗口。

新增行为：

- 不传 `time`：使用服务端当前时间减去 `QHZHC_QUERY_DELAY_SECONDS`，查询最新 5 分钟窗口。
- 该逻辑与 WebSocket `history_data_5min` 的时间窗口保持一致。

## 修改文件

- `QHZHC_Web/src/views/DataVisualization/dataVisualization.vue`
  - 新增 `enterRealtimeMode()`、`applyRealtimeInitialWindow()`、`isCurrentRealtimeRequest()`。
  - 页面创建和历史切回实时统一调用 `enterRealtimeMode()`。
- `QHZHC_Web/src/views/DataVisualization/services/historyApi.js`
  - `fetchFiveMinuteWindow()` 支持不传 `time`，请求参数为空对象。
- `QHZHC_Web/src/views/DataVisualization/services/realtimeClient.js`
  - 新增 `requestInitialHistory` 选项，控制是否发送 WebSocket 初始化历史窗口命令。
- `QHZHC_Web/tests/unit/historyModeRace.spec.js`
  - 覆盖首次进入实时页、历史切回实时页的最新 5 分钟初始化。
- `QHZHC_Web/tests/unit/historyApi.spec.js`
  - 覆盖最新 5 分钟请求不携带 `time` 参数。
- `QHZHC_Server/api_chart/chartdatatrans.py`
  - `dataTrans/5min` 支持不传 `time` 查询最新 5 分钟。
- `QHZHC_Server/api_chart/test_chartdatatrans.py`
  - 覆盖不传 `time` 时查询最新 5 分钟窗口。

## 验证记录

已执行：

```text
npm test -- tests/unit/historyModeRace.spec.js --runInBand
```

结果：`8 passed`。

```text
npm test -- tests/unit/historyApi.spec.js --runInBand
```

结果：`4 passed`。

```text
npm test -- tests/unit/realtimeClient.spec.js --runInBand
```

结果：`3 passed`。

```text
QHZHC_SECRET_KEY=test-secret DJANGO_DEBUG=true QHZHC_DB_PASSWORD=test ../.venv/bin/python manage.py test api_chart.test_chartdatatrans
```

结果：`8 passed`。

## 结论

实时数据模式现在有统一入口：先加载最新 5 分钟历史数据初始化页面，再进入 WebSocket 追加模式。首次进入实时页和从历史数据切回实时页使用同一套状态发布逻辑，避免历史结果残留、地图和图表初始化不一致、WebSocket 历史首包重复追加等问题。

## 2026-07-20 补充：地图未全量绘制最新 5 分钟窗口

### 补充问题

进入实时模式后，父组件 `mapList` 已经替换为最新 5 分钟窗口，但二维/三维地图仍没有完整绘制这 5 分钟的浓度点、路线和柱状图。

### 补充根因

实时初始化复用了子地图组件的 `mapList` watcher。该 watcher 的语义是“实时增量追加”：

- 2D watcher 将 `index` 指向最后一个点后调用 `drawRealtimePoint()`，只绘制最新点和最后一段路线。
- 3D watcher 将 `index` 指向最后一个点后调用 `nowBar()`，只绘制最新柱。

因此，父组件虽然已经把最新 5 分钟数据写入 `mapList`，地图层实际只消费了最后一个点，没有把整段窗口按历史轨迹方式全量绘制出来。

### 补充修复

- `dataVisualization.vue`
  - 新增 `redrawRealtimeWindow()`。
  - `applyRealtimeInitialWindow()` 写入 `mapList` 后，在 `$nextTick()` 显式触发地图全量重绘。
  - 实时模式下切换 2D/3D 地图时，也重新触发当前实时窗口重绘，覆盖 3D 组件按需挂载后的补画场景。

- `PlanimetricMap.vue`
  - 新增 `redrawRealtimeWindow(gasType, gasName, points)`。
  - 清空旧浓度点、旧路线和旧车辆。
  - 按当前气体字段绘制全部窗口浓度点。
  - 绘制完整路线，并把车辆定位到窗口最后一个点；开启视角跟随时同步居中到最新点。

- `StereoscopicMap.vue`
  - 新增 `redrawRealtimeWindow(gasType, points)`。
  - 复用已有实体重建逻辑，清空旧柱状实体后绘制历史柱和最新柱。

### 补充验证

已新增单测覆盖：

- `historyModeRace.spec.js`
  - 验证 `applyRealtimeInitialWindow()` 后会触发 2D/3D 最新 5 分钟窗口全量重绘。
- `mapLifecycle.spec.js`
  - 验证 2D 实时窗口重绘会清空旧图层、绘制全部点、绘制完整路线并定位车辆到最新点。
  - 验证 3D 实时窗口重绘会重建历史柱和最新柱。

已执行：

```text
npm run test:unit -- --runInBand tests/unit/historyModeRace.spec.js tests/unit/mapLifecycle.spec.js
```

结果：`2 passed, 24 tests passed`。

```text
npm run test:unit -- --runInBand
```

结果：`11 passed, 58 tests passed`。
