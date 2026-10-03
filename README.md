# 清华走航车可视化平台（原界面重构版）

本项目不是重新画一套界面，而是先完整复制 `2024_QH_ZHC`，再在副本中收敛功能并替换运行时。原数据可视化页面、二维 OpenLayers 地图、三维 Cesium 地图、图表布局、`truck.png` 和 `Cesium_Car.glb` 均沿用原项目。

当前只保留：

- 首页 `/index`
- 登录 `/login`、注册 `/register`
- 实时与历史数据可视化 `/dataVisualization`
- 独立的管理员模拟后台 `/admin/simulator`

模拟后台不嵌入数据可视化页面。新闻、团队、成果、数据资源和旧管理页面已从活动源码移到 `legacy-reference/QHZHC_Web_removed_modules`，便于追溯但不会参与路由和构建。

## 仓库与工作区

项目独立维护在 [cxDlogver/qhzhc-realtime-platform](https://github.com/cxDlogver/qhzhc-realtime-platform)。[cx-learn-notes](https://github.com/cxDlogver/cx-learn-notes) 通过 Git submodule 保留 `qhzhc-realtime-platform/` 目录及固定提交引用。

当前前端通过 `cx-browser-monitor-sdk: workspace:*` 使用同级 `browser-monitor/sdk`，推荐从父仓库获取完整工作区：

```bash
git clone --recurse-submodules https://github.com/cxDlogver/cx-learn-notes.git
cd cx-learn-notes
pnpm install
pnpm --filter @browser-monitor/protocol build
pnpm --filter cx-browser-monitor-sdk build
cd qhzhc-realtime-platform
npm install --prefix QHZHC_Server
npm run dev
```

已有父仓库时，在父仓库根目录执行 `git submodule update --init --recursive`。单独克隆本项目时，需要另外配置监控 SDK 工作区依赖；`workspace:*` 不能由普通 `npm install` 独立解析。

修改本项目后，先在子模块内提交并推送，再到父仓库提交 `qhzhc-realtime-platform` 的新版本指针。本地 `.data/`、依赖、构建产物与环境变量文件不提交。

## 技术结构

```text
.
├── QHZHC_Web/       # 原 Vue 2 界面；活动业务脚本全部使用 TypeScript
├── QHZHC_Server/    # Node.js + Express + ws + node:sqlite，全部 TypeScript
├── docs/            # 架构、WebSocket 和性能设计
└── legacy-reference/
    ├── QHZHC_Server_Django/       # 原 Django 服务，仅作参考
    ├── QHZHC_fileter_Python/      # 原 Python 数据脚本，仅作参考
    └── QHZHC_Web_removed_modules/ # 已取消的前端板块
```

活动运行时不再依赖 Python、Django 或 PostgreSQL。Node.js 服务使用 SQLite WAL，并在一次事务内批量写入同一批走航点。

## 环境与启动

- Node.js 24 或更高版本（使用内置 `node:sqlite`）
- npm 10 或更高版本

```bash
cd cx-learn-notes/qhzhc-realtime-platform
npm install --prefix QHZHC_Server
npm run dev
```

`npm run dev` 会同时启动前后端；任一进程启动失败时会停止另一进程并返回非零状态。后端默认不启用文件监听，以避免大型原项目及依赖目录触发 macOS 的 `EMFILE: too many open files`。需要单独监听后端源码时可执行：

```bash
npm run dev:watch -w QHZHC_Server
```

开发地址：

- 前端：`http://127.0.0.1:9527`
- HTTP API 与 WebSocket：`http://127.0.0.1:18080`

默认管理员账号：

```text
admin / Admin@123456
```

生产构建并由 Node.js 统一托管：

```bash
npm run build
npm run start
```

可选环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Node.js 监听地址 |
| `PORT` | `18080` | HTTP 与 WebSocket 端口 |
| `DATABASE_PATH` | `.data/qhzhc.sqlite` | SQLite 文件，相对服务端工作目录 |
| `ACCESS_TOKEN_TTL_MINUTES` | `15` | 内存 Access JWT 有效期 |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Refresh Token Family 绝对有效期 |
| `JWT_SECRET` | 仅开发环境提供默认值 | 生产环境必须配置至少 32 字节的随机密钥 |
| `TELEMETRY_RETENTION` | `100000` | 服务端保留的最新走航点数 |
| `VUE_APP_API_BASE_URL` | 自动使用 `18080` | 前端 API 地址 |
| `QWEATHER_API_KEY` | 无，缺失时天气接口返回 503 | 和风天气 Web API key，数据可视化页天气预报必填 |
| `CORS_ALLOWED_ORIGINS` | 开发环境为本机来源，生产仅同源 | 逗号分隔的允许来源，`*` 表示允许全部（此时不返回凭证头） |

以下四项为**前端构建变量**（`VUE_APP_` 前缀由 Vue CLI 注入，写在 `QHZHC_Web/.env.local`；该文件已被 `.gitignore` 忽略）：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VUE_APP_MONITOR_ENABLED` | 关闭 | 必须严格等于 `true` 才启用采集，其他值都不采集 |
| `VUE_APP_MONITOR_DSN` | 无 | 监控平台写入地址，工具形如 `http://localhost:8080/api/v3/ingest/<publicKey>/envelopes` |
| `VUE_APP_MONITOR_APP_NAME` | `qhzhc-web` | 必须与监控平台项目的 appName 完全一致 |
| `VUE_APP_MONITOR_RELEASE` | `0.1.0` | 应用版本，平台按 `app_version` 维度聚合，发版时更新 |

## 天气服务

数据可视化页的天气预报由服务端代理 `https://devapi.qweather.com/v7/grid-weather`，必须在服务端配置 `QWEATHER_API_KEY`（和风天气控制台申请的 Web API key），不能放在前端。

把变量写入仓库根目录的 `.env.local`（该文件已被 `.gitignore` 忽略，不会入库）：

```text
QWEATHER_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

`WeatherService` 在实例化时读取该变量，写入或修改后**必须重启 Node.js 服务**才生效。状态码对应关系：

- `503 天气服务暂不可用`：未读取到 key；
- `502 天气服务请求失败`：key 无效、免费额度耗尽、网络不通或请求超过 5 秒超时。

## 跨域处理

REST API 不应依赖浏览器放宽同源策略：`QHZHC_Web/vue.config.js` 的 `devServer.proxy` 把 `/api` 转发到后端，`src/utils/apiBaseUrl.ts` 在当前端口为 `9527` 时返回相对地址，页面与 API 保持同源。

WebSocket 握手不受同源策略限制，因此**不由 devServer 代理**，`resolveWebSocketBaseUrl()` 始终直连后端。请勿在 `vue.config.js` 中添加 `/ws` 代理规则：`/ws` 是 webpack-dev-server 用于热更新自带的 WebSocket 端点（见其默认配置 `webSocketServer.options.path = "/ws"`），一旦代理它，HMR 连接会连同业务请求一起被转发到后端并判定为非法 Upgrade 后销毁，表现为持续刷屏的 `Proxy error ... (ECONNRESET)`，同时热更新失效。

直连后端（`http://127.0.0.1:18080`）、通过局域网 IP 打开前端或前后端分离部署时，由 `QHZHC_Server/src/server/cors.ts` 负责响应 CORS 头：

- 开发环境默认放行 `localhost`、`127.0.0.1` 的任意本机端口，并允许携带凭证；
- 设置 `CORS_ALLOWED_ORIGINS` 后启用显式白名单，例如 `CORS_ALLOWED_ORIGINS=https://qhzhc.test,http://192.168.1.10:9527`；
- `CORS_ALLOWED_ORIGINS=*` 允许任意来源，此时不返回 `Access-Control-Allow-Credentials`（浏览器不接受通配符下的凭证请求）；
- 生产环境未配置时仅接受同源访问——静态页面与 API 由同一个 Node.js 进程提供。

未通过白名单的请求不会得到 `Access-Control-Allow-Origin`，由浏览器自行拦截；预检请求统一以 `204` 结束并缓存一天。

## 模拟后台

管理员登录后访问 `/admin/simulator`，可配置：

- 每秒 1、5、10 或 20 个数据点；
- 路线、环线和突发三种轨迹模式；
- 启动、暂停和主动断开全部 WebSocket。

模拟器从下一个自然秒开始生成数据，服务端在该秒结束后独立查询 SQLite，再按 WebSocket 连接各自的订阅数量发送。模拟器与发送链路不直接耦合，主动断开连接用于验证重连和按时间补发。

## 质量检查

```bash
npm run verify
npm run test:integration -w QHZHC_Server
```

前端的 `.ts` 文件由严格 `tsc` 检查；Vue CLI 构建使用项目内的轻量转译加载器，以兼容原项目依赖和 Vue 2 单文件组件。WebSocket 集成测试需要允许测试进程临时监听本机随机回环端口。

`npm run verify` 会依次检查原版可视化模板、桌面端样式与车辆资源，执行前后端 TypeScript 检查和 70 个单元测试，再完成两端生产构建。原项目在 1400px 以下把三列错误堆成纵向的规则已隔离修复，不影响大屏视觉基线。

浏览器自动化验收截图保存在 `reports/`：

- `browser-home.png`
- `browser-visualization-2d.png`
- `browser-visualization-3d.png`
- `browser-visualization-3d-map.png`
- `browser-simulator-admin.png`

知识文档：

- [实时前端系统中的背压与自适应调度](docs/01-realtime-rendering-backpressure.md)
- [WebSocket 鉴权与可恢复实时连接](docs/02-websocket-auth-recovery.md)

## 性能监控

前端性能采集通过 [browser-monitor SDK](https://github.com/cxDlogver/browser-monitor/tree/main/sdk) 以 Vue 插件形式接入，采集范围仅包含登录后的数据可视化页面（`/#/dataVisualization`），数据直送 browser-monitor 平台，由平台的投影、评分与连续聚合生成看板；**走航车侧不保存监控数据，也不再实现自建的 SQLite 监控后端**。

| 采集能力 | 说明 |
| --- | --- |
| Web Vitals | LCP / FCP / INP / CLS |
| 渲染质量 | FPS 与 LoAF（大屏实时渲染重点关注） |
| 页面视图 | `view.start` / `view.end`（路由归属与停留时长） |

接入位置与约定：

- 插件：[`QHZHC_Web/src/plugins/monitor.ts`](QHZHC_Web/src/plugins/monitor.ts)，在 `QHZHC_Web/src/main.ts` 通过 `Vue.use` 安装，实例挂在 `Vue.prototype.$monitor`（与 `$axios`、`$echarts` 同一风格）。
- 依赖以 `workspace:*` 引入，走航车 Web 是仓库根 `pnpm-workspace.yaml` 的成员；安装需先构建 SDK：`pnpm --filter @browser-monitor/protocol build`、`pnpm --filter cx-browser-monitor-sdk build`，再在仓库根执行 `pnpm install`。
- 上报地址必须使用指向监控平台的绝对地址（如 `http://localhost:8080/api/v3/ingest/<publicKey>/envelopes`），不能用 `/api/...` 相对路径——`vue.config.js` 已把 `/api` 代理到走航车后端 18080。
- 监控平台项目需先把前端来源加入 `allowed_origins`（开发环境为 `http://127.0.0.1:9527`、`http://localhost:9527`），且项目的 `appName` 必须与 `VUE_APP_MONITOR_APP_NAME` 完全一致，否则上报会被逐条拒绝。
- 平台需运行协议 3.0 版本（`POST /api/v3/ingest/:publicKey/envelopes`）；若平台仍是旧镜像，上报会返回 `unsupported_protocol`，此时需重建平台 api 与 worker 容器。

### 已知取舍

- **路由名必须由插件显式设置**：SDK 会清洗 URL 的 query 与 hash，hash 路由下 `routeName` 恒为 `/`，插件在启动前与每次 hash 变化后调用 `setViewName` 修正。
- **软导航保持关闭**：从登录页进入可视化页属于 hash 软导航，开启后「相对软导航起点」的 LCP 会与硬导航 LCP 混进同一分布，污染平台侧的 p75 与良好率。
- **离开页面时延后一个宏任务再销毁实例**：这样 SDK 能先处理本次 hash 变化以产出完整的 `view.end`（停留时长与样本终态）。代价是会留下一条相邻路由的空 view，已按真实路由命名，可在平台侧按 `routeName` 过滤。

### 与自建设计文档的关系

以下文档保留作设计与口径参考，其中描述的 SQLite Worker、`VUE_APP_PERFORMANCE_ENABLED` 开关与管理端 `/#/admin/performance` 看板属于**已不再实现的方案**，目录 `QHZHC_Web/src/services/performance`、`QHZHC_Server/src/server/performance` 不再承载代码：

- [性能监控平台设计：完整链路、关键代码与扩展接入](docs/frontend-performance-monitoring-platform-design.md)
- [实现、指标阈值与使用说明](docs/performance-monitoring-implementation.md)
- [实际验收记录与开销限制](docs/performance-monitoring-validation.md)
