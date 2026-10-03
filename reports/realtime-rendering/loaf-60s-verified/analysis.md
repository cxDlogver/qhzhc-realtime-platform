# 实时渲染 1 点/帧、20 点/秒：FPS 与 LoAF 实测

## 条件和产物

- 正式采样：2026-09-23，Chrome 153.0.8010.53，独立 headless 实例，1440 × 900，二维地图，实际采样 60.14 秒。
- 渲染模式：手动每帧 1 点；订阅：全部；模拟器：路线走航、每秒 20 点。脚本在结束后恢复原模拟器配置与运行状态。采样前地图已有 239 个可视点，结束时为 566 个，因此这是**已有历史点的持续运行场景**，不是空白页面冷启动。
- [原始逐秒 FPS、运行指标和逐条 LoAF](./raw.json)、[机器摘要](./summary.json)、[采样结束截图](./dashboard.png)、[模拟器恢复核对](./restoration.json)。测试入口为 [measure-realtime-loaf.mjs](../../../scripts/measure-realtime-loaf.mjs)。截图来自正式采样结束时；采样后面板文字又补充了“无脚本归因”的明确提示，原始截图未改写。
- 首轮冷启动参考另存于 [loaf-60s](../loaf-60s/raw.json)：开始时地图为 0 点，但其采样窗口包含页面启动期，不与正式复测等同；保留它是为了核对趋势及追溯初次运行。

## 结果

| 指标 | 正式复测 |
| --- | ---: |
| 模拟器生成 | 1200 点 |
| 客户端接收 / 消费 | 1180 / 327 点 |
| 结束时队列待消费 | 853 点 |
| 队首等待（末次逐秒样本） | 42.5 秒 |
| rAF FPS：54 个逐秒样本均值 / P5 / 最低 | 7.42 / 3.98 / 3.75 |
| rAF FPS：启动后第 5～15 秒均值 / 末 10 个样本均值 | 6.59 / 4.52 |
| LoAF 次数 / 平均 / P95 / 最大 | 323 / 173.5 / 243.7 / 426.5 ms |
| LoAF 平均 `startTime → renderStart` | 1.3 ms |
| LoAF 平均 `renderStart → styleAndLayoutStart` | 171.7 ms |
| LoAF 平均 `styleAndLayoutStart → 帧结束` | 0.4 ms |
| 带 `sourceFunctionName` 或 `invoker` 脚本条目的 LoAF | 0 / 323 |

每帧最多消费 1 点时，理论消费上限约为 rAF FPS × 1 点。末段约 4.5 FPS 对应约 4.5 点/秒，低于 20 点/秒输入；队列每秒增长约 15 点与实际结果一致。60 秒内少收的 20 点可能来自自然秒批次与采样边界，并不能据此判定数据丢失；接收与消费的差额 853 点则确实留在队列中。

LoAF 将主要耗时定位在渲染周期的**样式计算开始之前**。这个区间包括 rAF 回调等工作，不能直接命名为 Style/Layout，也不能只凭 `scripts: []` 认定没有 JavaScript。样式起点之后平均仅 0.4 ms，因此这批数据不支持“DOM 布局是主要耗时”的判断。LoAF 的脚本归因在正式窗口内全部为空，无法进一步用 `sourceFunctionName` / `invoker` 指认 Vue、ECharts 或 OpenLayers；本次是二维模式，Cesium 不在这条实时绘制路径上。

源码层面的待验证候选有：每个消费点都会触发二维地图的车辆位置、路线与浓度点更新（[PlanimetricMap.vue](../../../QHZHC_Web/src/views/DataVisualization/components/PlanimetricMap.vue)）；图表则在 `newdata` 变化后重建选项并调用 `setOption(..., { notMerge: true, lazyUpdate: true })`（[Charts.vue](../../../QHZHC_Web/src/views/DataVisualization/components/Charts.vue)）。这些是候选调用链，**不是 LoAF 已证明的具体热点**。若要继续归因，应在相同场景录制短时 Chrome Performance trace 或 CPU profile，查看 rAF 回调中的具体调用栈，再针对地图、图表或 Vue 逐项验证。

首轮冷启动参考同样显示积压：1200 点生成、1180 点接收、414 点消费、766 点待消费，末 10 个 FPS 样本均值 4.39。两轮开始时可视点数、采样边界和浏览器运行状态不同，不能用 414 对 327 推断代码性能回退。

## 复用方法与口径

启动本地前后端后，在运行脚本的进程环境中提供 `QHZHC_BENCH_PASSWORD`；可选设置 `QHZHC_BENCH_USER`、`QHZHC_BENCH_SECONDS`、`QHZHC_BENCH_WEB_URL`、`QHZHC_BENCH_API_URL`、`QHZHC_BENCH_CHROME` 和 `QHZHC_BENCH_OUTPUT`。然后在仓库根目录运行：

```powershell
node scripts/measure-realtime-loaf.mjs
```

默认运行 60 秒，输出到带时间戳的新目录；指定的输出目录若已有文件，脚本会拒绝覆盖。脚本使用本地管理接口暂停、设置并启动模拟器，独立 Chrome 页面设置“全部接收 + 1 点/帧 + 二维地图”，记录逐秒 rAF FPS、运行队列、原始 LoAF 和截图，结束后恢复模拟器原状态并记录 `restoration.json`。密码仅从进程环境读取，不写入脚本或产物。

这里的 FPS 是浏览器 rAF 回调频率，不能直接等同于实际提交到屏幕的帧数。LoAF 只记录达到 50 ms 门槛的长帧；低于 50 ms 的掉帧及 GPU 合成等问题仍需 Performance trace 核对。Headless Chrome 的数字也不应直接充当目标设备上的正式验收值。
