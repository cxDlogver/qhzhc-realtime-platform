# `localhost` 登录后回退登录页问题记录

## 问题概述

- 访问地址：`http://localhost:9527/#/login?redirect=%2FdataVisualization`
- 登录账号：`admin / Admin@123456`
- 现象：输入账号密码后，页面短暂加载数据可视化资源，但最终仍停留或回退到登录页；页面没有明确错误提示。
- 影响范围：本地开发环境中，使用 `localhost:9527` 访问前端时，登录后的鉴权接口无法稳定携带登录 Cookie，导致数据可视化页被 401 拦截器重定向回登录页。

## 复现与证据

### 账号有效性

直接请求后端登录接口，`admin / Admin@123456` 返回 HTTP 200，并返回管理员用户资料，说明账号密码有效。

### 浏览器复现

修复前从 `localhost:9527` 页面发起以下请求链：

1. `POST http://127.0.0.1:18080/auth/login/` 返回 200。
2. 路由开始加载 `/dataVisualization`。
3. 数据可视化页发起 `GET http://127.0.0.1:18080/api/chart/weather?...`。
4. 后续鉴权请求返回 401，`src/utils/request.js` 中的响应拦截器清理登录态并跳回 `/login`。

浏览器中做最小验证：

```js
// 页面来源：http://localhost:9527
await fetch("http://127.0.0.1:18080/auth/login/", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "Admin@123456" }),
});

await fetch("http://127.0.0.1:18080/auth/session/", {
  credentials: "include",
});
```

结果：

```text
loginStatus: 200
sessionStatus: 401
sessionBody: {"detail":"Authentication credentials were not provided."}
```

将后端地址改为 `localhost:18080` 后，同样的验证返回：

```text
loginStatus: 200
sessionStatus: 200
```

## 根因分析

前端默认 API 地址固定为 `http://127.0.0.1:18080`，但用户通过 `http://localhost:9527` 打开页面。

在浏览器的 Cookie 规则里，`localhost` 和 `127.0.0.1` 属于不同站点。后端登录 Cookie 使用 `SameSite=Lax`，该 Cookie 不会随 `localhost:9527` 到 `127.0.0.1:18080` 的跨站 XHR 请求发送。

因此登录接口虽然返回 200，但后续 `/auth/session/`、天气接口、历史接口等需要鉴权的请求拿不到 `qhzhc_access` Cookie，返回 401。前端 401 拦截器执行清理并重定向到登录页，造成「登录调整不成功」的表现。

## 修改内容

### 新增 API 基地址解析工具

新增 `QHZHC_Web/src/utils/apiBaseUrl.js`：

- 未配置 `VUE_APP_API_BASE_URL` 时，根据浏览器当前 hostname 选择后端地址：
  - `localhost:9527` → `http://localhost:18080`
  - `127.0.0.1:9527` → `http://127.0.0.1:18080`
- 如果显式配置的是本地回环地址（`localhost` 或 `127.0.0.1`），也会与当前页面 hostname 对齐。
- 如果显式配置的是远端 API 地址，则保持原配置不变。

### 统一使用动态基地址

更新以下文件：

- `QHZHC_Web/src/utils/request.js`
  - 普通 Axios 请求使用 `resolveApiBaseUrl()`。
- `QHZHC_Web/src/services/authSession.js`
  - 会话恢复接口使用 `resolveApiBaseUrl()`。
- `QHZHC_Web/src/views/DataVisualization/dataVisualization.vue`
  - WebSocket 地址从同一个 API 基地址派生，避免 HTTP 与 WebSocket 主机名不一致。

## 回归测试

新增 `QHZHC_Web/tests/unit/apiBaseUrl.spec.js`，覆盖：

- `localhost` 页面默认调用 `localhost:18080`。
- `127.0.0.1` 页面默认调用 `127.0.0.1:18080`。
- 显式远端 API 配置保持不变。
- 显式本地回环 API 配置会与浏览器 hostname 对齐。

修复前新增用例失败：

```text
Expected: "http://localhost:18080"
Received: "http://127.0.0.1:18080"
```

修复后通过：

```text
PASS tests/unit/apiBaseUrl.spec.js
Tests: 4 passed, 4 total
```

## 浏览器验证

使用用户提供的地址和账号重新验证：

- 地址：`http://localhost:9527/#/login?redirect=%2FdataVisualization`
- 账号：`admin`
- 密码：`Admin@123456`

验证结果：

- 登录后停留在 `http://localhost:9527/#/dataVisualization`。
- 页面标题为「数据可视化 | 温室气体监测和计量平台」。
- 数据可视化 Vue 实例存在。
- `canVisitRealtime=true`。
- `canVisitHistory=true`。
- 实时连接状态为「连接成功」。
- 天气请求已变为 `GET http://localhost:18080/api/chart/weather?...`。
- 控制台无业务错误。

## 结论

本次问题不是账号密码错误，而是本地开发访问入口与 API 基地址主机名不一致导致 Cookie 不随请求发送。通过统一 API 基地址解析，并在本地回环地址场景下自动对齐 hostname，`localhost:9527` 登录后可以正常进入并停留在数据可视化页面。
