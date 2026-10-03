# QHZHC 原界面可视化前端

该目录直接继承原 `2024_QH_ZHC/QHZHC_Web`。数据可视化模板、样式、OpenLayers/Cesium 图层和走航车资源保持原样，活动路由只保留首页、登录注册、数据可视化和独立模拟后台。

```bash
npm run serve
npm test
npm run build
```

TypeScript 实时边界位于 `src/views/DataVisualization/services`：

- `realtimeClient.ts`：连接状态机、最新批次时间、缺口补发、心跳和指数退避；
- `FrameTelemetryQueue.ts`：接收与渲染解耦、暂停恢复、每帧数量与时间预算；
- `historyApi.ts`：历史查询兼容接口。

原二维和三维组件只更换数据入口，没有重画界面。项目根目录的 `npm run verify:original-ui` 会对模板、样式、`truck.png` 和 `Cesium_Car.glb` 做基线校验。
