# QHZHC Node.js 服务

TypeScript 服务同时提供登录注册、历史数据、天气代理、模拟器管理和 RobotSocket WebSocket。默认监听 `127.0.0.1:18080`，生产构建后还会托管 `../QHZHC_Web/dist`。

```bash
npm run typecheck
npm test
npm run build
npm run start
```

主要模块：

- `src/server/database.ts`：SQLite WAL、单次 Refresh Token Family 和批量走航点事务；
- `src/server/simulator.ts`：按自然秒生成 1、5、10 或 20 个数据点，支持轨迹切换与暂停；
- `src/server/robot-socket-hub.ts`：鉴权、握手、心跳、补传、背压；
- `src/server/weather.ts`：服务端天气代理与分时缓存；
- `src/server/app.ts`：HTTP API 与前端静态托管。

实时遥测的 WebSocket、补发、背压和前端分帧渲染语义见项目根目录
`docs/01-realtime-telemetry-pipeline.md`；Access JWT 与 Refresh Token 的完整会话机制建议作为独立知识点继续梳理。
