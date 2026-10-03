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

相关知识文档见项目根目录：

- `docs/01-realtime-rendering-backpressure.md`：实时渲染的背压、分帧调度和自适应控制；
- `docs/02-websocket-auth-recovery.md`：WebSocket 鉴权、会话续期、心跳、故障重连与数据恢复。
