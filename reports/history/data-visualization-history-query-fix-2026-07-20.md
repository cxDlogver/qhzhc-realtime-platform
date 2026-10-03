# 数据可视化历史查询显示问题修复记录

## 问题概述

数据可视化页面切换到「历史查询」后，接口能够返回历史数据，二维地图也能绘制历史浓度点和路线，但左右两侧图表不能正常展示历史查询结果。

本次修复范围只覆盖历史查询成功后的前端状态同步，不调整后端接口、不改数据库结构，也不改变实时数据链路。

## 复现方式

1. 打开 `http://127.0.0.1:9527/#/dataVisualization`。
2. 使用管理员账号进入「数据可视化」页面。
3. 点击工具栏中的「历史查询」。
4. 查询时间范围：`2026-07-19 08:00:00` 至 `2026-07-19 19:00:00`。
5. 观察地图和左右图表面板。

## 修复前现象

浏览器运行时检查到：

- 历史接口 `/api/chart/dataTrans/between` 已返回数据。
- `mapList` 有 `39109` 条数据。
- 二维地图已绘制 `39109` 个浓度点和 `39108` 段路线。
- 图表数据源 `gasdata` 仍停留在实时数据窗口，仅有 `300` 条旧数据。
- 历史模式下左右图表面板依赖 `checkData` 显示，而查询成功后 `checkData` 仍为 `false`。

因此，历史查询结果只进入了地图链路，没有进入图表链路；同时面板显示条件没有被打开。

## 根因分析

问题位于 `QHZHC_Web/src/views/DataVisualization/dataVisualization.vue` 的 `searchHistory()` 方法。

修复前成功分支只做了这些状态更新：

```js
this.historyData = result;
this.mapList = result.data.slice();
this.historyStatus = result.data.length ? "success" : "empty";
this.renderHistoryResult();
```

这段逻辑存在两个断点：

1. `gasdata` 没有更新。
   左右图表组件接收的是 `:newdata="gasdata"`，不是 `historyData` 或 `mapList`。历史接口结果没有写入 `gasdata`，图表自然继续使用旧实时数据。

2. `checkData` 没有在查询成功后置为 `true`。
   模板中历史模式左右面板的显示条件是：

```vue
v-show="(checkData && searchType == 2 && leftFlag) || (searchType == 1 && leftFlag)"
```

查询开始时 `checkData` 会被重置为 `false`，但成功后没有恢复为 `true`，导致历史查询完成后左右面板仍不可见。

## 修改内容

修改文件：

- `QHZHC_Web/src/views/DataVisualization/dataVisualization.vue`
- `QHZHC_Web/tests/unit/historyModeRace.spec.js`

### 状态同步修复

在历史查询发起时清空旧图表数据，避免加载期间继续携带实时数据：

```js
this.historyData = { code: 200, message: "ok", data: [] };
this.gasdata = { code: 200, message: "ok", data: [] };
this.mapList = [];
this.checkData = false;
```

在历史查询成功后，把同一份历史结果同步给图表数据源，并按是否有数据打开面板：

```js
this.historyData = result;
this.gasdata = result;
this.mapList = result.data.slice();
this.checkData = result.data.length > 0;
this.historyStatus = result.data.length ? "success" : "empty";
```

### 回归测试

新增用例：

```js
test("successful historical query publishes the returned range to charts and panels", async () => {
  // ...
});
```

该用例验证：

- 历史查询成功后 `historyData` 保存接口返回值。
- `gasdata` 同步为同一份历史结果。
- `mapList` 与历史结果一致。
- `checkData` 置为 `true`，历史左右面板具备显示条件。
- `renderHistoryResult()` 被调用，地图渲染链路继续执行。

## 验证记录

### 单用例红绿验证

修复前运行：

```bash
npm test -- --runInBand tests/unit/historyModeRace.spec.js -t "successful historical query publishes"
```

结果：失败。失败点为 `vm.gasdata` 仍等于旧实时数据。

修复后再次运行同一命令：

```bash
PASS tests/unit/historyModeRace.spec.js
Tests: 6 passed, 6 total
```

### 浏览器验证

在干净浏览器标签页重新执行历史查询后，页面状态为：

- `historyStatus: "success"`
- `checkData: true`
- `gasDataLen: 39109`
- `historyDataLen: 39109`
- `mapListLen: 39109`
- 左侧图表面板可见。
- 右侧图表面板可见。
- 二维地图浓度点：`39109`
- 二维地图路线段：`39108`

图表 series 数据同步结果：

| 图表 | 验证结果 |
| --- | --- |
| CH4 时序变化 | Picarro `39109` 条，PRI `39109` 条 |
| CO2 时序变化 | Picarro `39109` 条，PRI `39109` 条 |
| 风速浓度分布 | 分桶数据来自 `39109` 条历史数据 |
| 实时监测 | 组件可见，数据源已切为历史结果 |
| 甲烷碳同位素变化 | `39109` 条 |

干净页面控制台只有 Vue Devtools 信息，没有新增运行时错误。

## 结论

历史查询无法正常显示的根因不是后端接口失败，也不是地图绘制失败，而是前端成功回调只更新了地图数据，遗漏了图表数据源和面板显示状态。

修复后，历史查询成功会同时驱动地图、左右图表面板和图表数据源，历史查询展示链路闭环。
