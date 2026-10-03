# 清华走航车可视化平台

## 1. 工作重点一：保障实时数据链路的连续性与可恢复性

### 【问题背景与目标】

走航车在运行过程中持续产生位置、气象和气体浓度数据，可视化页面需要通过长连接及时接收这些数据。与一次请求、一次响应的 HTTP 通信不同，WebSocket 连接会长期存在，网络波动、连接失活和访问凭证过期都可能中断页面的数据更新。

这一问题不能只靠“断开后重新连接”解决。网络异常可以重试，身份凭证失效需要先恢复认证，协议或权限异常则不应继续无条件重连。如果所有异常都采用同一种处理方式，轻则形成无效重试，重则让已经失效的会话继续消耗连接资源。

因此，本工作重点围绕 WebSocket 握手、首帧鉴权、心跳检测、异常分流、指数退避重连和长短 Token 轮换建立完整链路，使系统能够持续检查连接与认证状态，并根据异常原因选择重新连接、刷新凭证或终止自动恢复。

> **这里改善的是实时链路在异常环境下的连续性、可恢复性和安全性。**

### 【整体方案】

平台把连接状态与认证状态放在同一条恢复链路中处理：WebSocket 负责连接建立、存活检测和断线恢复；Access Token 与 Refresh Token 负责身份校验、凭证续期和会话失效。两部分共同决定一条连接是否可以继续工作。

```text
登录校验
   ↓
签发 Access Token 与 Refresh Token
   ↓
建立 WebSocket 传输连接
   ↓
首帧携带 Access Token 完成鉴权
   ↓
心跳维持连接并持续复检认证状态
   ↓
正常接收实时数据
   │
   └─发生异常──→ 判断异常类型
                    ├─普通断开────────→ 指数退避重连
                    ├─Access Token 失效→ 刷新凭证──→ 重新建连
                    └─不可恢复异常────→ 停止重连或重新登录
```

WebSocket 解决“连接如何持续运行”，Token 体系解决“连接以什么身份运行”。只有把两类状态统一纳入异常决策，才能避免网络波动时直接退出，也能避免认证失效后反复建立无效连接。

### 【登录校验】

登录是整个链路中**唯一校验用户名和密码**的环节。它只负责把“你是谁”换成一对凭证：短期 Access Token 承担每次请求的身份校验，长期 Refresh Token 承担 Access Token 失效后的续期。此后的 WebSocket 首帧鉴权与 HTTP Bearer 鉴权都只校验 Access Token，不再接触密码。

登录接口本身的完整链路如下：

```text
[浏览器] 表单校验通过 → POST /api/auth/login { username, password }
   │     axios 实例统一开启 withCredentials，为后续写入 Cookie 做准备
   ↓
[服务端] express 路由 /api/auth/login → AuthService.login()
   ├─ findUserByUsername（COLLATE NOCASE，大小写不敏感）
   ├─ scryptSync(password, salt) 后 timingSafeEqual 恒定时间比对
   ├─ 任一不匹配 → throw AuthError(401, "INVALID_CREDENTIALS") → 统一错误中间件
   └─ 匹配 → 生成 familyId(UUID) 与 refreshToken(randomBytes(32).base64url)
        ├─ 落库：refresh_tokens 只保存 token 的 SHA-256 哈希，不存明文
        └─ SignJWT 签发 Access Token：HS256 / sub=userId / sid=familyId / jti / role / 15min
   ↓
[服务端] 200 OK（双通道下发）
   ├─ 响应体 { user, accessToken, accessTokenExpiresAt }        ← Access Token 走这里
   └─ Set-Cookie: qhzhc_refresh=...; HttpOnly; SameSite=Lax; Path=/api/auth   ← Refresh Token 走这里
   ↓
[浏览器] userLogin() 收到响应
   ├─ accessTokenManager.setAccessToken(accessToken)  → 只存 JS 内存，刷新即失
   ├─ localStorage.user                               → 权限位 can_visit_realtime / can_visit_history
   └─ 跳转 redirect 或 /index → 建立 WebSocket，首帧携带这个 Access Token
```

#### <u>1. 路由跳转检查：先恢复访问凭证，再确认用户档案</u>

用户发起页面跳转时，路由守卫先读取目标路由的 `requireAuth` 与 `adminOnly` 配置。公共页面直接放行；受保护页面按照“先检查 Access Token，再检查用户档案”的顺序处理。

```text
进入目标路由
├─ 不需要认证
│  └─→ 直接放行
└─ 需要认证
   ├─ 检查当前标签页内存中的 Access Token
   │  ├─ 已存在 → 继续检查用户档案
   │  └─ 不存在 → 请求 POST /api/auth/refresh
   │     ├─ 成功 → 将新 Access Token 写入当前标签页内存，继续检查用户档案
   │     └─ 失败 → 清理凭证与用户缓存，跳转登录页
   ├─ 检查 localStorage.user
   │  ├─ 字段完整 → 直接使用缓存档案
   │  └─ 缺失或不完整 → 请求 GET /api/auth/session
   │     ├─ 成功 → 校验并缓存用户档案
   │     └─ 401 → 刷新 Access Token 后重放一次 /session
   └─ 管理员路由
      ├─ is_superuser = true → 放行
      └─ is_superuser = false → 转到数据可视化页
```

```javascript
router.beforeEach(async (to, _from, next) => {
  document.title = `${String(to.meta?.title || "平台")} | 温室气体监测和计量平台`;
  const requiresAuth = to.matched.some((record) => record.meta.requireAuth);
  const adminOnly = to.matched.some((record) => record.meta.adminOnly);
  if (!requiresAuth) {
    next();
    return;
  }

  try {
    // Refresh Token 是 HttpOnly Cookie，前端无法读取；刷新请求成功即表示它存在且有效。
    if (!accessTokenManager.getAccessToken()) {
      await accessTokenManager.refreshAccessToken();
    }

    let profile = cachedProfile();
    if (!profile) {
      profile = await bootstrapSession();
      if (!isCompleteSessionProfile(profile)) {
        throw new Error("会话用户信息不完整");
      }
      localStorage.setItem("user", JSON.stringify(profile));

    }
    if (adminOnly && !profile.is_superuser) {
      next("/dataVisualization");
      return;
    }
    next();
  } catch (_error) {
    accessTokenManager.clearAccessToken();
    clearSessionProfile();
    next({ path: "/login", query: { redirect: to.fullPath } });
  }
});
```

路由守卫不再维护额外的“已认证”标记。Access Token 表示当前标签页是否已经取得访问凭证，`user` 表示客户端是否已经取得完整的用户档案，两者分别决定是否调用 `refresh` 和 `session`。

**<u>Refresh 接口：恢复访问凭证并轮换 Refresh Token</u>**

Access Token 只保存在 JavaScript 内存中，刷新网页或新开标签页后都会为空。此时路由守卫调用 `accessTokenManager.refreshAccessToken()`。这个请求使用独立的 `refreshClient`，不经过普通业务请求的 Access Token 注入和 401 重试逻辑，因此不会携带已经失效的 Access Token，也不会出现“刷新接口再次触发刷新”的循环。

```text
[路由守卫] 当前标签页内存中没有 Access Token
   ↓
[AccessTokenManager] refreshAccessToken()
   ├─ 已有 refreshPromise → 复用正在执行的刷新请求
   └─ 没有 refreshPromise → 创建一次刷新请求
        ↓
[浏览器] POST /api/auth/refresh
   ├─ 请求体：无
   ├─ Authorization：无须携带
   └─ Cookie：浏览器自动附带 qhzhc_refresh
        ↓
[服务端路由] 从 Cookie 中读取 qhzhc_refresh
   ├─ 缺失 → 401 REFRESH_TOKEN_INVALID
   └─ 存在 → AuthService.refresh(refreshToken)
        ↓
[数据库事务] rotateRefreshToken(currentToken, nextToken)
   ├─ 无对应记录 → invalid
   ├─ 已过期 → expired
   ├─ family 已撤销 → revoked
   ├─ 旧 Token 已被消费 → reused，并撤销整个 Token Family
   └─ 正常 → 标记旧 Token 已消费，写入同一 Family 的新 Refresh Token
        ↓
[服务端签发]
   ├─ 新 Access Token → 响应体
   └─ 新 Refresh Token → Set-Cookie 覆盖原 qhzhc_refresh
        ↓
[客户端]
   ├─ 成功 → 新 Access Token 写入当前标签页内存，路由检查继续
   └─ 失败 → 清空内存凭证，路由守卫清理用户缓存并跳转登录页
```

Refresh Token 保存在 `HttpOnly Cookie` 中，前端 JavaScript 无法读取它，因此前端不能先通过代码判断 Refresh Token 是否存在或是否有效。`withCredentials: true` 允许浏览器按 Cookie 规则自动携带它，最终以 `/refresh` 的成功或失败作为判断结果。

客户端只保留以下关键逻辑：同一标签页中的并发刷新调用共享一个 `refreshPromise`；刷新成功后只把 Access Token 写入内存。

```ts
refreshAccessToken: () => {
  if (!refreshPromise) {
    refreshPromise = refreshRequest()
      .then((response) => {
        accessToken = response.accessToken;
        return response.accessToken;
      })
      .catch((error) => {
        accessToken = null;
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}
```

服务端收到请求后先轮换 Refresh Token，再通过两条通道返回新凭证：

```ts
const refreshToken = parseCookies(request.headers.cookie)[REFRESH_COOKIE];
if (!refreshToken) {
  throw new AuthError("缺少刷新凭证", 401, "REFRESH_TOKEN_INVALID");
}

const tokens = await services.auth.refresh(refreshToken);
setRefreshCookie(request, response, tokens);
response.json({
  accessToken: tokens.accessToken,
  accessTokenExpiresAt: tokens.accessTokenExpiresAt,
});
```

`setRefreshCookie()` 设置了 `HttpOnly`、`SameSite=Lax` 和 `Path=/api/auth`。刷新失败且属于认证错误时，服务端会清除 Refresh Token Cookie；客户端随后结束当前登录流程。

**<u>Session 接口：校验 Access Token 并补齐用户档案</u>**

完成 Access Token 检查后，路由守卫读取 `localStorage.user`，并通过 `isCompleteSessionProfile()` 校验 `id`、`username`、`role`、权限位等必需字段。缓存完整时直接使用，不请求 `/session`；缓存缺失、解析失败或字段不完整时才请求会话接口。

```text
[路由守卫] localStorage.user 缺失或不完整
   ↓
[bootstrapSession] 合并当前标签页内同时发生的会话加载
   ↓
[fetchSessionProfile] GET /api/auth/session
   ↓
[请求拦截器] 读取内存中的 Access Token
   └─ 写入 Authorization: Bearer <accessToken>
   ↓
[服务端 requireAuth]
   ├─ principalFromRequest()：只从 Authorization 请求头提取 Bearer Token
   └─ verifyAccessToken()
      ├─ 校验 JWT 算法、签发方、接收方、签名和过期时间
      ├─ 校验 sub、sid、jti 等必要字段
      ├─ 根据 sid 确认 Token Family 仍处于有效状态
      └─ 根据 sub 重新查询用户
   ↓
[Session 路由] publicProfile(request.user)
   └─ 返回 id、username、role、is_superuser 和页面访问权限
   ↓
[路由守卫]
   ├─ 档案结构完整 → 写入 localStorage.user
   ├─ 管理员页面 → 再判断 is_superuser
   └─ 放行目标路由
```

`/session` 的认证依据是 `Authorization` 中的 Access Token，关键代码证明了 Access Token 的注入位置和服务端校验入口：

```ts
// 客户端：发起 session 请求前，由请求拦截器统一注入 Access Token
service.interceptors.request.use((config) => {
  return applyAccessToken(config, accessTokenManager.getAccessToken());
});

export async function fetchSessionProfile(): Promise<SessionProfile> {
  const response = await request.get<SessionProfile>("/api/auth/session");
  return response.data;
}

// 服务端：session 必须先经过 requireAuth
app.get("/api/auth/session", requireAuth, (request, response) => {
  response.json(publicProfile((request as AuthenticatedRequest).user));
});
```

如果 `/session` 返回 401，普通请求的响应拦截器会调用 `refreshAccessToken()`，取得新 Access Token 后重新写入 `Authorization`，再重放一次原 `/session` 请求。重放请求带有 `_authRetry` 标记：第二次仍然返回 401 时立即结束会话，不会再次刷新，从而避免形成“401 → refresh → 重放 → 401 → refresh”的循环。

```text
GET /api/auth/session → 401
   ↓
POST /api/auth/refresh
   ├─ 成功 → 新 Access Token → 标记 _authRetry → 重放 GET /session 一次
   │          ├─ 200 → 返回并缓存用户档案
   │          └─ 再次 401 → 清理登录态，跳转登录页
   └─ 失败 → 清理登录态，跳转登录页
```

**<u>Refresh 与 Session 的组合关系</u>**

| 当前状态 | 路由守卫的请求顺序 | 结果 |
| --- | --- | --- |
| 有 Access Token，`user` 完整 | 不请求 `refresh`，不请求 `session` | 直接进入权限判断 |
| 有 Access Token，`user` 缺失或不完整 | `session` | 用 Access Token 重新加载用户档案 |
| 有 Access Token 但已过期，`user` 完整 | 路由阶段不发请求；后续受保护业务请求返回 401 后执行 `refresh`，再重放该业务请求一次 | 路由守卫只判断凭证是否存在，实际有效性由服务端确认 |
| 无 Access Token，Refresh Token 有效，`user` 完整 | `refresh` | 恢复 Access Token 后使用现有档案 |
| 无 Access Token，Refresh Token 有效，`user` 缺失或不完整 | `refresh` → `session` | 先恢复访问凭证，再加载用户档案 |
| 无 Access Token，Refresh Token 无效、过期、撤销或重放 | `refresh` 返回 401，不再请求 `session` | 清理登录态并跳转登录页 |
| 有 Access Token 但已过期，且需要加载 `user` | `session` 返回 401 → `refresh` → 重放一次 `session` | 成功则恢复页面；再次失败则跳转登录页 |

两类接口不能合并：`refresh` 解决“当前标签页没有可用 Access Token”的问题，并承担 Refresh Token 的一次性轮换；`session` 解决“客户端没有完整用户档案”的问题，并用 Access Token 重新确认服务端身份。`refresh` 不返回用户档案，`session` 也不负责凭证续期，两者按路由守卫中的条件串联。

#### <u>2. 客户端发起：只提交凭据，不携带 Token</u>

登录页先做一次表单校验，通过后调用登录接口；接口返回的用户档案与 Access Token 分离处理，Access Token 不进入任何持久化存储：

```ts
const profile = await userLogin(this.user);
localStorage.setItem("user", JSON.stringify(profile));
```

```ts
export async function userLogin(payload: LoginPayload): Promise<SessionProfile> {
  const response = await request.post<AuthResponse>("/api/auth/login", payload);
  accessTokenManager.setAccessToken(response.data.accessToken);
  return response.data.user;
}
```

源码位置：[`loginPage.vue`](../QHZHC_Web/src/views/loginPage.vue#L47-L65)、[`api/auth.ts`](../QHZHC_Web/src/api/auth.ts#L20-L24)

#### <u>3. 服务端校验与签发</u>

路由层只做参数取用，校验与签发全部下沉到 `AuthService.login()`：

```ts
app.post(
  "/api/auth/login",
  asyncSafe(async (request, response) => {
    const { username, password } = request.body as Record<string, unknown>;
    const tokens = await services.auth.login(String(username ?? ""), String(password ?? ""));
    setRefreshCookie(request, response, tokens);
    response.clearCookie(SESSION_COOKIE, { path: "/" });
    response.json(authResponse(tokens));
  }),
);
```

```ts
async login(username: string, password: string): Promise<TokenPair> {
  const user = this.database.findUserByUsername(username);
  if (!user || !verifyPassword(password, user.password_salt, user.password_hash)) {
    throw new AuthError("账号或密码错误", 401, "INVALID_CREDENTIALS");
  }
  const familyId = randomUUID();
  const refreshToken = randomBytes(32).toString("base64url");
  const refreshTokenExpiresAt = Date.now() + this.options.refreshTokenTtlMs;
  this.database.createRefreshTokenFamily(
    refreshToken, familyId, user.id, refreshTokenExpiresAt,
  );
  return this.issueTokenPair(sessionUser, familyId, refreshToken, refreshTokenExpiresAt);
}
```

源码位置：[`app.ts`](../QHZHC_Server/src/server/app.ts#L154-L163)、[`auth.ts`](../QHZHC_Server/src/server/auth.ts#L93-L114)

Access Token 本身是无状态 JWT，服务端不存、也不查库即可校验，但**签发时把 `sid`（Token Family ID）写进载荷**，后续每次校验都会据此确认该会话未被撤销：

```ts
const accessToken = await new SignJWT({ sid: familyId, role: user.role })
  .setProtectedHeader({ alg: "HS256", typ: "JWT" })
  .setIssuer(ACCESS_TOKEN_ISSUER)
  .setAudience(ACCESS_TOKEN_AUDIENCE)
  .setSubject(String(user.id))
  .setJti(tokenId)
  .setIssuedAt(Math.floor(issuedAt / 1000))
  .setExpirationTime(Math.floor(accessTokenExpiresAt / 1000))
  .sign(this.jwtKey);
```

源码位置：[`auth.ts`](../QHZHC_Server/src/server/auth.ts#L201-L230)

#### <u>4. 响应下发：两种凭证走两条通道</u>

返回的示例

```JSON
{
  "user": {
    "id": 1,
    "username": "admin",
    "first_name": "系统管理员",
    "displayName": "系统管理员",
    "is_superuser": true,
    "role": "admin",
    "can_visit_realtime": true,
    "can_visit_history": true
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzaWQiOiIzZjFjOWUyMC04YTUxLTRkMTMtYjM3Yi1hMmQ0ZTU5Zjc4MTMiLCJyb2xlIjoiYWRtaW4iLCJpc3MiOiJxaHpoYy1hdXRoIiwiYXVkIjoicWh6aGMtYXBpIiwic3ViIjoiMSIsImp0aSI6ImI3ZTM0YzEwLTVlN2EtNGY4MS05YjA3LTQxZGYyYjBhOTMzZiIsImlhdCI6MTc2OTk5OTEwMCwiZXhwIjoxNzcwMDAwMDAwfQ.5oJ8kZ2mQ7rX9pLcNvT4YhUwFaD3sE1bGqR6xKtIuPo",
  "accessTokenExpiresAt": 1770000000000
}

// 对应响应头（Refresh Token 不走报文体）：
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Set-Cookie: qhzhc_refresh=8Kq2Zp7vT1xR4nLmYc9AbDeFgHjKMnPqRsTuVwXyZ0_3i6o; Path=/api/auth; Expires=Wed, 27 Jan 2027 00:00:00 GMT; HttpOnly; SameSite=Lax

// accessToken 解出来的载荷（auth.ts 的 issueTokenPair）
{
  "sid": "3f1c9e20-8a51-4d13-b37b-a2d4e59f7813",
  "role": "admin",
  "iss": "qhzhc-auth",
  "aud": "qhzhc-api",
  "sub": "1",
  "jti": "b7e34c10-5e7a-4f81-9b07-41df2b0a933f",
  "iat": 1769999100,
  "exp": 1770000000
}
```

Access Token 放响应体，是为了让前端 JavaScript 能拿到并用在 `Authorization: Bearer` 与 WebSocket 首帧里；Refresh Token 放 `HttpOnly` Cookie，是为了让它对前端代码不可见，只在刷新接口上由浏览器自动携带：

```ts
response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
  httpOnly: true,
  sameSite: "lax",
  secure: request.secure,
  expires: new Date(tokens.refreshTokenExpiresAt),
  path: "/api/auth",
});
```

`path: "/api/auth"` 把 Cookie 的可见范围收窄到认证相关接口，业务接口（遥测、天气）的请求不会带上它；`Secure` 跟随请求的协议自动开启。

Access Token 只保存在模块级变量中，是**刻意选择**：页面刷新或关闭即失效，把长期凭证的暴露面压到最小。

```ts
let accessToken: string | null = null;
return {
  getAccessToken: () => accessToken,
  setAccessToken: (token) => { accessToken = token; },
  clearAccessToken: () => { accessToken = null; },
  // ...
};
```

源码位置：[`accessToken.ts`](../QHZHC_Web/src/services/accessToken.ts#L22-L29) [`app.ts`](../QHZHC_Server/src/server/app.ts#L62-L84)

---

### 【WebSocket 正常建连链路】

正常链路按照“建立传输通道，再完成业务鉴权”的顺序执行：用户登录成功后获得 Access Token 和 Refresh Token；浏览器发起 WebSocket 握手；连接打开后，客户端把 Access Token 放在第一条 `authenticate` 消息中；服务端完成协议字段和身份校验后，连接才进入可用状态。

WebSocket 握手只负责把 HTTP 连接升级为双向通信通道，不直接代表用户已经通过身份认证。服务端要求未初始化连接的第一条消息必须是 `authenticate`，从而把传输连接与业务身份分成两个边界。

客户端在连接打开后发送鉴权首帧：

```ts
socket.onopen = () => {
  if (this.socket !== socket || this.stopped) return;
  this.lastSeenAt = Date.now();
  // 服务端要求 5 秒内完成 authenticate，否则会被判协议错误关闭。
  // 无令牌时主动以 4001 关闭，交给 handleClose 走刷新令牌流程。
  const accessToken = this.getAccessToken();
  if (!accessToken) {
    socket.close(
      REALTIME_CLOSE_CODE.AUTHENTICATION_EXPIRED,
      "access token missing",
    );
    return;
  }
  socket.send(JSON.stringify({
    type: "authenticate",
    accessToken,
    protocolVersion: PROTOCOL_VERSION,
    robotId: ROBOT_ID,
    resumeFromBucketStartMs: this.latestBatchStartMs + SECOND_MS,
    maxPointsPerSecond: this.maxPointsPerSecond,
  }));
};
```

源码位置：[`realtimeClient.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L168-L190)

服务端拒绝鉴权前的其他业务消息，并使用首帧中的 Access Token 校验连接身份：

```ts
const context: ClientContext = {
  id: randomUUID(),
  socket,
  principal: null,
  accessToken: null,
  robotId,
  initialized: false,
  authenticating: false,
  maxPointsPerSecond: 0,
  replaying: false,
  lastSeenAt: Date.now(),
  protocolAlive: true,
  // 回调延时执行，届时 context 必定已赋值完毕，闭包引用是安全的。
  authTimer: setTimeout(() => {
    if (!context.initialized) {
      socket.close(WS_CLOSE.PROTOCOL_ERROR, "authentication timeout");
    }
  }, 5_000),
};

// ...

if (!context.initialized && parsed.type !== "authenticate") {
  context.socket.close(WS_CLOSE.PROTOCOL_ERROR, "authentication required");
  return;
}

try {
  principal = await this.auth.verifyAccessToken(message.accessToken);
} catch (error) {
  const reason = error instanceof AuthError ? error.code : "ACCESS_TOKEN_INVALID";
  context.socket.close(WS_CLOSE.AUTHENTICATION_EXPIRED, reason);
  return;
}
```

源码位置：[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L151-L194)

#### <u>服务端的首帧鉴权：handleAuthenticate</u>

不符合协议状态的报文在 `onMessage` 阶段就被挡掉了：未鉴权却不是 `authenticate`、鉴权期间重复发 `authenticate`、已鉴权还发 `authenticate`，三种情况都以 `4100` 关闭。真正通过闸门的 `authenticate` 进入 `handleAuthenticate`，它内部的鉴权逻辑可以拆成五步：

```text
handleAuthenticate(context, message)
  ① 订阅对象校验：message.robotId 必须等于 URL 路径里的 robotId
       不一致 → close(4100, "invalid authentication")
  ② 令牌校验：await auth.verifyAccessToken(message.accessToken)（异步）
       失败   → 清 5s 定时器 + 放开 authenticating + close(4001, AuthError.code)
       成功   → 重查 readyState 后再继续（await 期间连接可能已被关闭）
  ③ 绑定身份：principal / accessToken 写入上下文，清 5s 定时器
  ④ 绑定订阅：记录 maxPointsPerSecond，并读取服务端最新处理到的自然秒
  ⑤ 下发顺序：welcome → 按 resumeFromBucketStartMs 补发各秒数据 → initialized = true
```

第一步约束的是**权限范围**。连接建立时 `robotId` 已从 URL 路径确定，服务端不接受后续报文改写订阅对象：

```ts
// robotId 以 URL 路径为准；报文里若声称订阅另一个机器人，一律视为非法握手。
if (context.initialized || message.robotId !== context.robotId) {
  context.socket.close(WS_CLOSE.PROTOCOL_ERROR, "invalid authentication");
  return;
}
```

第二步是**唯一用到异步的地方**，也是唯一会拿到新数据的地方：

```ts
context.authenticating = true;
try {
  principal = await this.auth.verifyAccessToken(message.accessToken);
} catch (error) {
  // 校验失败要放开 authenticating，否则该连接再也无法重试握手，只能等超时被踢。
  clearTimeout(context.authTimer);
  context.authenticating = false;
  const reason = error instanceof AuthError ? error.code : "ACCESS_TOKEN_INVALID";
  context.socket.close(WS_CLOSE.AUTHENTICATION_EXPIRED, reason);
  return;
}
// await 期间连接可能已被对端关闭，下发 welcome 前必须重查一次。
if (context.socket.readyState !== WebSocket.OPEN) return;
clearTimeout(context.authTimer);
```

源码位置：[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L249-L292)

这里有三个容易忽略的细节：

- **失败时要放开 `authenticating`**。它是用来拦并发握手的（第二条 `authenticate` 会被 `onMessage` 直接拒），校验失败时不复位，这条连接就再也无法重试，只能等 5 秒超时被踢。
- **关闭码区分得和客户端的重连策略对齐**：令牌类失败用 `4001`（客户端走 `refresh-token` 恢复），越权 / 重复握手用 `4100`（客户端走 `stop`，不重连）。这个对应关系见 [`realtimeConnectionPolicy.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeConnectionPolicy.ts#L19-L32)。
- **`await` 之后必须重查 `readyState`**。令牌校验是异步的，期间对端可能已断开，此时下发 `welcome` 会打到一个已关闭的 socket 上。

---

### 【连接存活检测与异常恢复】

连接存活检测与异常恢复是一条闭合回路：**心跳负责发现连接已死，关闭码负责判定死因，恢复策略负责决定怎么处理，重连则回到建连链路重新鉴权补发**。整条链路如下：

```text
[正常] welcome 到达 → attempt 归零 → 采用服务端下发的心跳间隔 → 启动心跳定时器
   │
   ├─ 客户端每 8s 一次巡检
   │     ├─ 连续 3×8s 毫无任何入站消息 → close(4000, "heartbeat timeout")
   │     └─ 否则 send { type: "ping", nonce, sentAt }
   │
   ├─ 服务端每 8s 一次巡检
   │     ├─ 先重验 access token → 失效则 close(4001)
   │     ├─ 上轮 ping 无 pong 或 30s 未活跃 → terminate()
   │     └─ 否则 protocolAlive = false; socket.ping()
   │
   └─ 任意入站消息（含非法包）都刷新双方 lastSeenAt
   ↓
[异常] 连接关闭
   ├─ 网络 offline → 暂停渲染并保留队列 → close()（不带码，按 1006 处理）
   ├─ 页面隐藏   → 暂停渲染并保留队列 → close(4002, "page hidden")
   └─ 服务端关闭 / 心跳超时 / 1006
   ↓
[恢复] handleClose(socket, event) —— 唯一恢复入口
   ├─ stopped === true       → 不做任何恢复（页面已主动离开）
   ├─ 4001 → refresh-token   → 刷新令牌 → 立即 connect()；刷新失败 → onStatus("error") + 跳登录
   ├─ 4003 / 4100 → stop     → stopped = true + onStatus("error")
   └─ 其余（1006 / 1012 / 1013 / 4500 / 4002…）→ reconnect → 指数退避 → connect()
   ↓
[回到建连] connect() → 首帧 authenticate（携带下一批数据的起始时间 + 新 Token）→ welcome → 补发 → 恢复
```

#### <u>1. 双层心跳检测</u>

长连接收不到数据有两种可能：只是暂时没有业务数据，或者已经形成 **TCP 半开连接**——对端进程已消失，但本端 socket 仍停留在 `ESTABLISHED`，浏览器和 Node 都不会主动通知。单看「有没有数据」无法区分，因此平台在**协议层**和**应用层**各设一层判活。

| | 客户端 `realtimeClient` | 服务端 `RobotSocketHub` |
| --- | --- | --- |
| 巡检周期 | `welcome` 下发的 `heartbeatIntervalMs`（默认 8s） | `HEARTBEAT_INTERVAL_MS = 8_000` |
| 协议层 | 发送应用层 `ping`（JSON，带 nonce） | `socket.ping()` 控制帧；收到 pong 帧置 `protocolAlive = true` |
| 应用层 | `lastSeenAt`：**任意**入站消息都刷新（含 `telemetry_second`） | `lastSeenAt`：任意 JSON 消息或 pong 帧都刷新 |
| 超时阈值 | `3 × heartbeatIntervalMs`（24s） | `CLIENT_STALE_AFTER_MS = 30_000`（约 3.75 × 间隔） |
| 超时动作 | `close(4000, "heartbeat timeout")` | `socket.terminate()`（直接断 TCP，不走关闭握手） |
| 附加职责 | 另用 3 秒数据接收超时检查识别“连接在但业务流已停” | 每轮重验 access token，失效即 `close(4001)` |

两侧的 ping / pong 是**两条互不相干的通道**，这点最容易看错：客户端发的是应用层 JSON `ping`，服务端在 `routeMessage` 里回一个 JSON `pong`（带 `serverTime` 与 `latestBucketStartMs`）；服务端发的是 WebSocket **控制帧** ping，由浏览器自动回 pong 帧，客户端代码里并没有监听 pong 帧。

客户端的判活依据是「收到过任意消息」而不是「收到过 pong」——服务端在持续推流时，即便 pong 一个没回也应视为存活：

```ts
//客户端
private startHeartbeat(): void {
  this.clearHeartbeat();
  this.heartbeatTimer = window.setInterval(() => {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    // 连续 3 个周期毫无响应，说明连接已死（TCP 半开时浏览器不会主动通知），
    // 主动关闭并交给 handleClose 走重连流程。
    if (Date.now() - this.lastSeenAt > this.heartbeatIntervalMs * 3) {
      this.socket.close(REALTIME_CLOSE_CODE.HEARTBEAT_TIMEOUT, "heartbeat timeout");
      return;
    }
    const now = Date.now();
    this.send({ type: "ping", nonce: String(now), sentAt: now });
  }, this.heartbeatIntervalMs);
}

// 服务端
/** 按消息类型分发；其中只有 authenticate 是异步的（涉及令牌校验）。 */
private async routeMessage(context: ClientContext, message: ClientMessage): Promise<void> {
  switch (message.type) {
    case "authenticate":
      await this.handleAuthenticate(context, message);
      break;
    case "ping":
      this.send(context, {
        type: "pong",
        nonce: message.nonce,
        serverTime: Date.now(),
        latestBucketStartMs: this.stream.getLatestBucketStartMs(context.robotId),
      });
      break;
      ...
  }
}
```

源码位置：[`realtimeClient.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L330-L371)

服务端则**两个判据都要满足**：`protocolAlive` 为 false（上轮 ping 没被应答）或应用层超时，任一成立即淘汰。它还要顺带做一次令牌复检——长连接不应活得比令牌久：

```ts
 socket.on("pong", () => {
   context.protocolAlive = true;
   context.lastSeenAt = Date.now();
 });

/**
 * 每轮巡检做两件事：
 *
 * 1. 对已认证连接重验 access token——长连接不应活得比令牌久，令牌轮换 / 封禁后能及时踢掉；
 * 2. 用「协议层未完成 ping-pong」+「应用层超时」双判据淘汰僵尸连接，清掉半开占位。
 */
private async checkHeartbeats(): Promise<void> {
  const now = Date.now();
  // 串行 await：连接数大时单轮耗时会随客户端数量线性增长，当前规模下可接受。
  for (const context of this.clients.values()) {
    if (context.initialized && context.accessToken) {
      try {
        context.principal = await this.auth.verifyAccessToken(context.accessToken);
      } catch {
        context.socket.close(WS_CLOSE.AUTHENTICATION_EXPIRED, "access token expired");
        continue;
      }
    }
    // 上一轮 ping 未被应答，或应用层超时 ⇒ 半开连接；terminate 直接断 TCP，不走关闭握手。
    if (!context.protocolAlive || now - context.lastSeenAt > CLIENT_STALE_AFTER_MS) {
      context.socket.terminate();
      continue;
    }
    context.protocolAlive = false;
    context.socket.ping();
  }
}
```

源码位置：[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L416-L441)

三个配套细节：

- **心跳间隔由服务端下发**，客户端在收到 `welcome` 时才写入并启动定时器（`realtimeClient.ts` 第 214-221 行）。调整服务端常量即可全局生效，客户端不需要同步改配置。
- **超时阈值两侧故意不一致**（24s vs 30s）。客户端更激进，通常先于服务端发现问题并主动关闭，从而带上明确的 `4000` 关闭码；服务端作为兜底，用 `terminate()` 清理那些连关闭帧都发不出去的死连接。
- **单个坏包不关连接**。JSON 解析失败只上报 `invalid-packet` 状态，连 `lastSeenAt` 照样刷新——能发包说明对端进程还在，剩下的交给心跳兜底。

#### <u>2. 异常恢复决策</u>

连接关闭后，客户端先判断自身是否已经主动停止。页面离开时，`stop()` 会提前切换生命周期状态并清理定时器、连接和事件监听，后续关闭事件直接返回，不进入异常恢复。

仍在运行的连接根据关闭码收束为三类动作：`refresh-token` 表示先恢复认证；`reconnect` 表示进入指数退避；`stop` 表示异常无法通过自动重连解决。

```ts
export function resolveRealtimeRecoveryAction(
  closeCode: number,
): RealtimeRecoveryAction {
  if (closeCode === REALTIME_CLOSE_CODE.AUTHENTICATION_EXPIRED) {
    return "refresh-token";
  }
  if (
    closeCode === REALTIME_CLOSE_CODE.FORBIDDEN ||
    closeCode === REALTIME_CLOSE_CODE.PROTOCOL_ERROR
  ) {
    return "stop";
  }
  return "reconnect";
}
```

不同异常进入不同恢复路径，判断依据不是笼统的“连接失败”，而是关闭来源、关闭码和凭证状态。

| 异常场景                             | 判断依据               | 处理方式                 | 最终状态           |
| ------------------------------------ | ---------------------- | ------------------------ | ------------------ |
| 页面主动离开                         | `stopped = true`       | 清理连接、定时器和监听器 | 不重连             |
| 心跳超时                             | 客户端关闭码 `4000`    | 指数退避                 | 重新连接           |
| Access Token 失效                    | 服务端关闭码 `4001`    | 刷新凭证后重新建连       | 恢复连接或重新登录 |
| 权限不足                             | 关闭码 `4003`          | 停止自动重连             | 进入错误状态       |
| 协议错误                             | 关闭码 `4100`          | 停止自动重连             | 等待修正           |
| 异常关闭                             | 客户端观察到 `1006`    | 指数退避                 | 重新连接           |
| 服务重启或临时不可用                 | `1012`、`1013`、`4500` | 指数退避                 | 重新连接           |
| Refresh Token 无效、过期、撤销或重放 | 刷新接口认证失败       | 清理认证状态             | 跳转登录页         |

这张决策表形成了连接恢复的收口：可以恢复的连接异常统一进入退避重连；Access Token 失效先恢复认证；Refresh Token 无法继续使用时结束当前会话；协议与权限类异常停止无意义的自动重试。

源码位置：[`realtimeConnectionPolicy.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeConnectionPolicy.ts#L19-L32)

真正的分发在 `handleClose`：它是**唯一的恢复入口**，服务端主动断开、心跳超时、网络异常、页面隐藏，全部收束到这里，先排除「已被新连接替换的旧 socket」和「用户已主动停止」，再按策略分三路：

```ts
private async handleClose(socket: WebSocket, event: CloseEvent): Promise<void> {
  // 已被新连接替换的旧 socket 关闭时要忽略，否则会误删新连接并触发多余重连。
  if (this.socket !== socket) return;
  this.socket = null;
  this.clearHeartbeat();
  this.clearBucketWatchdog();
  this.frameQueue.pause();
  // 用户主动 stop（页面离开）后不再做任何恢复动作。
  if (this.stopped) return;

  const recoveryAction = resolveRealtimeRecoveryAction(event.code);
  switch (recoveryAction) {
    case "refresh-token": {
      // 4001：access token 过期。先刷新令牌，成功则清零退避立即重连。
      this.options.onStatus("auth-recovering");
      try {
        await this.refreshAccessToken();
        if (!this.stopped) {
          this.attempt = 0;
          this.connect();
        }
      } catch (_error) {
        // 刷新失败说明登录态已失效，停止重连并交由上层跳转登录。
        this.stopped = true;
        this.options.onStatus("error");
        await this.onAuthenticationFailure();
      }
      return;
    }
    case "stop":
      // 无权限（4003）或协议错误（4100）属于不可恢复，重试只会得到同样结果。
      this.stopped = true;
      this.options.onStatus("error");
      return;
    case "reconnect":
      this.options.onStatus("disconnected");
      this.scheduleReconnect();
      return;
  }
}
```

源码位置：[`realtimeClient.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L304-L371)

三路动作的差别在于**要不要重试、重试前要不要换凭证**：

| 分支 | 触发码 | 是否重连 | 关键差别 |
| --- | --- | --- | --- |
| `refresh-token` | `4001` | **立即**重连 | 先刷新令牌；成功后 `attempt` 清零，不等退避 |
| `reconnect` | `1006`、`1012`、`1013`、`4500`、`4000`、`4002` | 退避后重连 | 保留 `attempt`，延迟随失败次数增长 |
| `stop` | `4003`、`4100` | 不重连 | 置 `stopped = true`，重试只会得到同样结果 |

除了被动关闭，客户端还有两类**主动关闭**，它们同样会流回 `handleClose`，只是关闭码不同以便表达意图：

```ts
// 网络断开：暂停渲染、保留队列，再关闭连接
this.frameQueue.pause();
if (this.socket && this.socket.readyState < WebSocket.CLOSING) this.socket.close();

// 页面隐藏：同样暂停渲染并保留队列
this.frameQueue.pause();
this.socket.close(REALTIME_CLOSE_CODE.PAGE_HIDDEN, "page hidden");
```

源码位置：[`realtimeClient.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L395-L411)

两者都只暂停帧队列，不清空已经接收的数据。重新建连时，客户端从“下一批应接收数据的起始时间”继续请求；旧队列仍从原队首继续渲染，接收进度与渲染进度互不覆盖。

#### <u>3. 带随机抖动的指数退避</u>

普通网络断开不能立即、无限地发起重连。服务尚未恢复时，固定间隔重试会持续产生无效请求；多个客户端同时恢复时，还可能在同一时刻集中建立连接。RFC 6455 因此建议客户端在异常关闭后采用随机初始延迟，并让后续重试逐步延长。[[1]](https://www.rfc-editor.org/rfc/rfc6455.html#section-7.2.3)

平台的重连上限按照失败次数从 500 毫秒逐步增长到 15 秒，再在 250 毫秒到当前上限之间生成随机延迟。收到服务端 `welcome` 后，失败次数归零。

```ts
const ceiling = Math.min(15_000, 500 * 2 ** Math.min(this.attempt, 6));
const delay = Math.max(250, Math.round(ceiling * this.random()));
this.attempt += 1;
this.reconnectTimer = window.setTimeout(() => {
  this.reconnectTimer = null;
  this.connect();
}, delay);
```

源码位置：[`realtimeClient.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L416-L432)

这里采用的是带随机抖动、最小等待时间和最大上限的指数退避。随机抖动负责分散客户端的重连时间，指数增长负责降低连续失败时的请求频率，上限则避免用户等待时间无限增长。

**<u>1006 是客户端观察到的异常关闭结果，不能由服务端通过 Close 帧发送；它也不等同于某一种确定的网络故障。</u>** [[1]](https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4.1) 客户端将 1006 与其他可恢复异常统一归入 `reconnect`，再由指数退避控制重试节奏。

---

### 【长短 Token 鉴权与认证恢复】

平台使用短期 Access Token 和长期 Refresh Token 分离访问权限与登录会话。Access Token 默认有效期为 15 分钟，用于 HTTP Bearer 鉴权和 WebSocket 首帧鉴权；Refresh Token 默认有效期为 7 天，用于 Access Token 失效后的凭证刷新。生命周期配置见 [`config.ts`](../QHZHC_Server/src/server/config.ts#L34-L39)。

登录阶段校验的是用户名和密码。校验成功后，服务端创建 Token Family，签发 Access Token 和 Refresh Token。Access Token 只保存在当前页面的 JavaScript 内存中；Refresh Token 由浏览器保存在 `HttpOnly` Cookie 中，前端代码不能直接读取。对应代码见 [`accessToken.ts`](../QHZHC_Web/src/services/accessToken.ts#L17-L46) 和 [`app.ts`](../QHZHC_Server/src/server/app.ts#L65-L76)。

#### <u>1. Access Token 失效后的恢复</u>

先厘清一件事：**Access Token 的"重放"和 Refresh Token 的"重放"是两回事**，服务端的应对能力也完全不同。

| | Access Token | Refresh Token |
| --- | --- | --- |
| 形态 | 无状态 JWT，服务端不存 | 随机串，服务端存 SHA-256 哈希 |
| 服务端能否检测重放 | **不能**（没有 jti 黑名单/消耗记录） | **能**（库里有 `consumed_at`） |
| 能否单张作废 | 不能（签发后只能等它过期） | 可以（消费 / 撤销） |
| 主要防御 | 15 分钟短有效期 + 只存 JS 内存 + HTTPS | 一次性轮换 + 重放即撤销整个 Family |

因此 Access Token 的泄露窗口就是它的剩余寿命：攻击者拿到后可以在过期前冒充用户发 HTTP 请求、建立 WebSocket，**服务端无法分辨这是第二个使用者**。可行的补救只有一条——撤销整个 Token Family，让这个 family 签发的所有 Access Token 一起失效（见第 3 小节）。

**Access Token 失效后的恢复走两条独立通道，但共用同一个刷新入口：**

```text
HTTP 侧                                    WebSocket 侧
任意业务请求 → 401                          心跳每 8s 重验 AT
   ↓                                          ↓ 失败
handleAuthError（排除 login/register/refresh）  close(4001, reason)
   ↓                                          ↓
manager.refreshAccessToken()  ←—————— 同一个刷新方法 ——————→  refreshAccessToken()
   ↓                                          ↓
成功：applyAccessToken + 重放原请求（仅一次）   成功：attempt 归零 + 立即 connect()
失败：clearAccessToken + 跳登录页               失败：stopped = true + 跳登录页
```

**关于"失败要不要重试"，三条规则是明确的：**

| 情形 | 是否重试 | 依据 |
| --- | --- | --- |
| 请求返回 401 | **重试一次** | 必须先刷新令牌；`_authRetry` 标记保证最多一次 |
| 重试后仍 401 | 不再重试 | 新令牌也不被接受，继续只会形成风暴 |
| **刷新本身失败** | **绝不重试** | Refresh Token 是一次性凭据，重试拿不到不同结果 |

刷新失败立即终止而非重试，这一点在 `accessTokenManager` 里也有体现——`catch` 中先把内存令牌置空，再向上抛，避免任何调用方拿着旧凭证继续：

```ts
service.interceptors.response.use(
  (response) => response,
  async (rawError: AxiosError<{ message?: string; detail?: string }>) => {
    if (rawError.response?.status === 401) {
      return handleAuthError(rawError);
    } else {
      Message.error(
        rawError.response?.data?.message || rawError.response?.data?.detail || rawError.message
      );
    }
    return Promise.reject(rawError);
  }
);

export function createAuthErrorHandler(
  client: HttpClient,
  manager: AccessTokenManager,
  onUnauthenticated: () => void | Promise<void>
): (error: AxiosError) => Promise<AxiosResponse> {
  return async (error) => {
    const config = error.config as RetriableRequestConfig | undefined;
    const path = requestPath(config?.url);
    // 已经重试过仍 401 ⇒ 新换来的 Access Token 也不被接受，刷新这条路走不通了，
    // 不能再退避重试，否则会把一次登出放大成持续的请求风暴。
    if (error.response?.status === 401 && config?._authRetry) {
      manager.clearAccessToken();
      await onUnauthenticated();
      return Promise.reject(error);
    }
    // 三类请求直接放弃：非 401（不是认证问题）、拿不到 config（无法重放）、
    // 登录 / 注册 / 刷新本身（刷新它们只会循环，密码错误也不属于认证失效）。
    if (error.response?.status !== 401 || !config || NON_REFRESHABLE_PATHS.has(path)) {
      return Promise.reject(error);
    }

    try {
      // 并发的多个 401 会在这里共享同一次刷新，不会出现重复提交同一个 Refresh Token。
      const accessToken = await manager.refreshAccessToken();
      // 打上 _authRetry 再重放：新 Token 仍失败时靠这个标记终止循环。
      const retryConfig = applyAccessToken({ ...config, _authRetry: true }, accessToken);
      return client.request(retryConfig);
    } catch (refreshError) {
      // 刷新失败说明 Refresh Token 已过期 / 撤销 / 重放，只能清空内存凭证并交回上层结束会话。
      manager.clearAccessToken();
      await onUnauthenticated();
      // 抛出刷新错误而非原始 401：原始 401 只是症状，真正的失败原因在这里。
      return Promise.reject(refreshError);
    }
  };
}
```

源码位置：[`accessToken.ts`](../QHZHC_Web/src/services/accessToken.ts#L30-L46)、[`httpAuth.ts`](../QHZHC_Web/src/services/httpAuth.ts#L52-L81)、[`realtimeClient.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L330-L371)

#### <u>2. 单页内合并并发刷新</u>

同一页面里，HTTP 请求和 WebSocket 可能在相近时间各自发现凭证失效。Refresh Token 又是一次性凭据，若两个调用各自发出刷新请求，后到的那个提交的已经是**被前一个轮换掉的旧凭据**，会被服务端判定为重放。

管控办法是页内共享一个 Promise：第一个调用负责发起，其余调用等待同一个结果。

```ts
refreshAccessToken: () => {
  if (!refreshPromise) {
    refreshPromise = refreshRequest()
      .then((response) => {
        accessToken = response.accessToken;
        return response.accessToken;
      })
      .catch((error) => {
        accessToken = null;
        throw error;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
},
```

源码位置：[`accessToken.ts`](../QHZHC_Web/src/services/accessToken.ts#L30-L46)

三个细节：

- `finally` 里把 `refreshPromise` 置空是必须的。失败后不清空，后续所有调用会一直等待那个已经 reject 的 Promise，页面再也刷不动。
- 刷新请求走的是**独立的 axios 实例**，没有挂载 401 拦截器：

```ts
const refreshClient = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
  timeout: 10_000,
});
```

  这层隔离是刻意的——若复用 `request`，刷新接口自己返回 401 时会再次进入 `handleAuthError` → 再次刷新，形成递归。

- 覆盖范围仅限**同一页面（同一 JS 上下文）**。`refreshPromise` 是模块级变量，跨标签页不共享，这就是下面第 3 小节要讨论的问题。

#### <u>3. Refresh Token 轮换与重放处理</u>

##### 轮换：一次更换一块，旧凭据立即作废

Refresh Token 每次成功使用后都会被消费，服务端签发一个新的，并保留新旧之间的关联。RFC 9700 称之为 Refresh Token Rotation。[[2]](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14.2)

```ts
this.database.exec("BEGIN IMMEDIATE");
// UPDATE 旧行：consumed_at = now, replaced_by_hash = nextHash
// INSERT 新行：token_hash = nextHash, parent_token_hash = currentHash
this.database.exec("COMMIT");
```

源码位置：[`database.ts`](../QHZHC_Server/src/server/database.ts#L230-L256)

`BEGIN IMMEDIATE` 让整个判定与写入在同一事务里完成，两个并发请求不可能先后读到"未被消费"的旧记录——**这是轮换能否成立的前提**。

##### 冲突：五路判定与它们的顺序

```ts
if (!row)                    return { kind: "invalid" };   // 查无此凭据
if (row.revoked_at !== null) return { kind: "revoked" };   // Family 已被撤销
if (row.consumed_at !== null) {                            // 已被用掉 → 判定重放
  UPDATE refresh_tokens SET revoked_at = now WHERE family_id = ? AND revoked_at IS NULL;
  return { kind: "reused", familyId: row.family_id };
}
if (row.expires_at <= now)   return { kind: "expired" };
// …正常轮换…
```

源码位置：[`database.ts`](../QHZHC_Server/src/server/database.ts#L206-L228)、[`auth.ts`](../QHZHC_Server/src/server/auth.ts#L118-L137)

顺序是有讲究的：`revoked` 排在 `consumed` 前面，所以**同一个已消费的凭据第二次出现时，返回的是 `revoked` 而不是重复一次 `reused`**——Family 只会被撤销一次，语义清晰。

| 判定 | HTTP 状态码 / code | 客户端处置 |
| --- | --- | --- |
| `invalid` | 401 `REFRESH_TOKEN_INVALID` | 清 Cookie + 跳登录 |
| `expired` | 401 `REFRESH_TOKEN_EXPIRED` | 清 Cookie + 跳登录 |
| `revoked` | 401 `TOKEN_FAMILY_REVOKED` | 清 Cookie + 跳登录 |
| `reused` | 401 `REFRESH_TOKEN_REUSED` | 清 Cookie + 跳登录（并已撤销整个 Family） |
| `rotated` | 200 + 新 Cookie | 写内存，继续原请求 |

四条失败分支都返回 401，且都在路由层统一清掉 Refresh Cookie：

```ts
} catch (error) {
  if (error instanceof AuthError) clearRefreshCookie(response);
  throw error;
}
```

源码位置：[`app.ts`](../QHZHC_Server/src/server/app.ts#L183-L200)

##### Token Family 是怎么被校验的

无论 HTTP 还是 WebSocket，判定最终都落到同一条查询：

```ts
isTokenFamilyActive(familyId: string, now = Date.now()): boolean {
  const row = this.database
    .prepare(
      `SELECT 1 AS active
       FROM refresh_tokens
       WHERE family_id = ?
         AND consumed_at IS NULL
         AND revoked_at IS NULL
         AND expires_at > ?
       LIMIT 1`,
    )
    .get(familyId, now);
  return row?.active === 1;
}
```

源码位置：[`database.ts`](../QHZHC_Server/src/server/database.ts#L263-L276)

语义是：**Family 下只要还存在一条「未消费、未撤销、未过期」的记录，就认为这个会话有效。** 四种状态的对应关系：

| 状态 | Family 内的行 | `isTokenFamilyActive` |
| --- | --- | --- |
| 刚登录 / 正常轮换后 | 有一条未消费的新记录 | `true` |
| 撤销 Family（登出、检测到重放） | 全部行 `revoked_at` 非空 | `false` |
| Family 整体过期 | 全部行 `expires_at <= now` | `false` |

这个查询被 `verifyAccessToken` 调用，而 `verifyAccessToken` 又被三条链路共用：HTTP 的 `requireAuth`、WebSocket 首帧鉴权、服务端心跳的周期性重验。

```161:164:QHZHC_Server/src/server/auth.ts
      if (!this.database.isTokenFamilyActive(familyId)) {
        throw new AuthError("登录会话已撤销", 401, "TOKEN_FAMILY_REVOKED");
      }
```

因此**撤销 Family 会让这个 Family 签发的所有 Access Token 同时失效**——这正是前面说的"Access Token 无法单张作废"的补偿机制，也是服务端能在 ≤8 秒内踢掉所有连接的根本原因。

反过来，这也是一个必要的特性：**正常的 Refresh Token 轮换不会踢掉已有连接**。轮换后旧记录 `consumed_at` 非空、但新记录未消费，Family 依然活跃，正在运行的 WebSocket 不会受到影响；只有"旧凭据被再次使用"这种异常情况才会连坐。

#### <u>4. 数据库如何管理凭证状态</u>

上面的判定最终都落在 `refresh_tokens` 一张表上。这张表**没有 `status` 字段**，状态是靠「一行一个凭据 + 三列时间戳 + `family_id` 串联」表达出来的。

##### 表结构

```sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash        TEXT PRIMARY KEY,   -- SHA-256(凭据)，主键 ⇒ 同一张凭据不可能存在两行
  family_id         TEXT NOT NULL,      -- 登录会话 ID：同一次登录派生出的所有凭据共享
  user_id           INTEGER NOT NULL,
  parent_token_hash TEXT,               -- 上一张（血缘）
  replaced_by_hash  TEXT,               -- 下一张（血缘）
  created_at        INTEGER NOT NULL,
  expires_at        INTEGER NOT NULL,   -- 整个 Family 共用一个到期时间
  consumed_at       INTEGER,            -- 被用掉的时间
  revoked_at        INTEGER             -- 被撤销的时间
);
CREATE INDEX refresh_tokens_family_id ON refresh_tokens(family_id);
```

源码位置：[`database.ts`](../QHZHC_Server/src/server/database.ts#L86-L96)

##### 单个凭据的状态 = 三个时间戳的组合

| `consumed_at` | `revoked_at` | 与 `now` 比较 | 状态 |
| --- | --- | --- | --- |
| NULL | NULL | `expires_at > now` | **当前有效**（链上最新的一张） |
| 有值 | NULL | — | 已用掉（正常轮换留下的历史） |
| | 有值 | — | 已撤销 |
| NULL | NULL | `expires_at <= now` | 已过期 |

##### 状态变迁：不是「改状态」，而是「加一行」

每次刷新不会把旧记录改写为新凭据，而是**旧行标记消费 + 插入新行**，表里因此形成一条链表。以 Family `F1` 为例：

**登录**——只插入一行：

| token_hash | parent | replaced_by | consumed_at | revoked_at | |
| --- | --- | --- | --- | --- | --- |
| `H(R1)` | NULL | NULL | NULL | NULL | ← 当前有效 |

**第一次刷新 R1 → R2**——旧行写 `consumed_at`，插新行：

| token_hash | parent | replaced_by | consumed_at | revoked_at | |
| --- | --- | --- | --- | --- | --- |
| `H(R1)` | NULL | `H(R2)` | `t1` | NULL | |
| `H(R2)` | `H(R1)` | NULL | NULL | NULL | ← 当前有效 |

**第二次刷新 R2 → R3**——链继续变长：

| token_hash | consumed_at | revoked_at | |
| --- | --- | --- | --- |
| `H(R1)` | `t1` | NULL | |
| `H(R2)` | `t2` | NULL | |
| `H(R3)` | NULL | NULL | ← 当前有效 |

历史全部保留，这正是识别重放的前提：正因为 `H(R2)` 这行还在且 `consumed_at` 有值，系统才能认出「R2 已经用过了」。

##### 冲突与撤销：批量 UPDATE，不删行

当有人再次拿 **R2** 来刷新时，查到 `H(R2)` 的 `consumed_at` 非空 → 判定 `reused` → 把整个 Family 里尚未撤销的行**全部**打上 `revoked_at`：

| token_hash | consumed_at | revoked_at | |
| --- | --- | --- | --- |
| `H(R1)` | `t1` | `t3` | |
| `H(R2)` | `t2` | `t3` | ← 触发者 |
| `H(R3)` | NULL | `t3` | ← 当前有效的凭据被连坐 |

登出执行的是同一条 SQL（`revokeTokenFamily`），只是调用点不同。所以**「重放」与「登出」在数据库层面是同一个动作**，区别只在触发原因。

保留行而不删除的意义在于：凭 `parent_token_hash` / `replaced_by_hash` 可以事后还原"这次重放由哪张凭据触发、它替换掉了谁"；同时也保证同一张凭据再次出现时仍能被查到并判定——删了就无从判断。

##### Family 是否还有效：一条查询收口

```sql
SELECT 1 FROM refresh_tokens
WHERE family_id = ?
  AND consumed_at IS NULL      -- 还没被用掉
  AND revoked_at IS NULL       -- 还没被撤销
  AND expires_at > ?           -- 还没过期
LIMIT 1
```

语义是：**这条链上，是否还存在一张「没用过、没被撤、没过期」的凭据。**

| 场景 | 链上状态 | 查询结果 | 会话 |
| --- | --- | --- | --- |
| 刚登录 / 正常轮换后 | 存在一张干净的新行 | 有 | 活着 |
| 重放 / 登出后 | 所有行 `revoked_at` 非空 | 无 | 已死 |
| 7 天到期 | 所有行 `expires_at <= now` | 无 | 已死 |

##### 容易困惑的点

**(a) 刷新不延长登录时长。** 新行的 `expires_at` 直接沿用旧行的值，因此是**绝对窗口**（登录起 7 天），而不是滑动窗口：

```ts
.run(nextHash, row.family_id, row.user_id, currentHash, now, row.expires_at);
```

**(b) 撤销是打标记，不是删行。** 见上文：保留血缘才能继续识别已消费凭据的再次出现。

### 【方案价值与适用场景】

这项工作的价值不只是完成登录和 WebSocket 建连，而是把两类容易散落在业务代码里的问题集中起来：一类是凭证如何签发、续期和失效，另一类是连接发生异常后应该重试、重新认证还是停止。业务页面只负责发起访问和展示结果，具体判断由统一的认证流程和连接状态机处理。

#### <u>1. 双 Token 解决凭证续期与访问控制问题</u>

在前后端分离、通过 Bearer Token 访问接口的系统中，Access Token 与 Refresh Token 是一种常见的凭证管理方案。两种 Token 不是简单地把同一份凭证保存两次，而是分别承担不同职责：

- 登录接口校验用户名和密码，确认用户身份；
- Access Token 有效期较短，用于 HTTP 接口和 WebSocket 首帧鉴权；
- Refresh Token 有效期较长，只用于换取新的 Access Token，不直接访问业务数据；
- 服务端通过角色、资源范围和会话状态决定当前请求是否有权访问目标资源。

RFC 9700 指出，Refresh Token 可以配合较短生命周期的 Access Token，降低 Access Token 泄露后的影响；面向公共客户端签发 Refresh Token 时，需要采用发送方约束或 Refresh Token Rotation 检测重放。轮换成功后，旧 Refresh Token 失效，但服务端仍保留新旧凭证之间的关系，以便旧凭证再次出现时撤销当前有效凭证。[[2]](https://www.rfc-editor.org/rfc/rfc9700.html#section-4.14)

本项目采用的处理顺序可以概括为：

`校验登录凭据 → 签发 Access Token 与 Refresh Token → Access Token 保护业务请求 → Access Token 到期后刷新 → Refresh Token 轮换 → 发现过期、撤销或重放后重新登录`

这套处理适合前后端分离、登录状态需要保持较长时间，同时希望缩短业务访问凭证有效期的系统。如果系统使用服务端 Session Cookie，或者不需要长期会话，则不一定需要相同的双 Token 结构。需要注意的是，双 Token 管理的是凭证生命周期；真正的权限校验仍由接口鉴权、角色判断和资源访问规则完成。

#### <u>2. WebSocket 异常恢复解决连接中断后的处理问题</u>

WebSocket 标准规定了握手、Ping/Pong、关闭流程和关闭码，也建议客户端在异常关闭后采用随机延迟和逐步增长的重连间隔。标准并没有规定收到某个关闭码后必须刷新凭证、重新连接还是停止，这些动作需要业务系统自己决定。[[1]](https://www.rfc-editor.org/rfc/rfc6455.html#section-7.2.3)

因此，完整的连接处理不能只写一个 `onclose` 后立即重连，而要先判断连接为什么结束：

```text
连接发生异常
├─ 网络中断、服务重启或心跳超时 → 指数退避后重连
├─ Access Token 失效             → 刷新凭证后立即重连
├─ Refresh Token 失效或发生重放  → 清理登录状态，返回登录页
├─ 权限不足或协议错误             → 停止重连，交给上层处理
└─ 页面离开或主动关闭             → 正常结束，不再恢复
```

这里处理的是**超时判定和断线重连**，这套判断适合实时监控、消息推送、在线协作、设备状态展示等需要保持长连接的系统。对于普通远程调用和后台任务，其中“先分类、再决定是否重试”的处理方式同样适用，但重试前还要确认操作是否可以安全地重复执行。

#### <u>3. 同样的判断方式也适用于任务执行</u>

任务系统或 Agent 在执行过程中也会遇到网络超时、工具调用失败、凭证失效、权限不足和程序错误。处理这些异常时，同样不能把所有失败都放进一个无限重试循环。AWS Step Functions 按错误类型分别配置 `Retry` 和 `Catch`，并支持重试次数、退避倍率、最大等待时间和随机抖动，说明任务恢复的前提仍然是先识别错误，再选择处理方式。[[3]](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html)

两者可以对应到同一组判断：暂时性的网络或服务异常可以有限重试；凭证失效需要重新认证；权限不足或不可恢复的业务错误应当停止；执行被中断时，应从已经保存的状态继续。OpenAI Agents SDK 的 `RunState` 用于保存和恢复中断的运行状态，也说明任务恢复不能只依赖当前连接是否还在。[[4]](https://openai.github.io/openai-agents-python/ref/run_state/)

不过，连接恢复和任务恢复不是一回事。WebSocket 重连主要恢复通信通道；任务或 Agent 可能已经调用过数据库、支付、消息发送等有副作用的工具，还需要检查点、幂等键、结果持久化、去重或补偿机制。这里可以沿用的是异常分类和恢复判断，不能只靠重连代码完成任务恢复。

## 2. 工作重点二：保证实时数据稳定性和可靠性

### 【问题背景与目标】

走航车采集数据时，页面看到的并不是一条永远匀速、永远连续的数据流。采集任务可能暂停后再恢复，网络也可能中断或抖动。页面停止更新时，前端首先要分清两件事：是服务端查询后确认“数据库中这一秒没有新数据”，还是客户端连这一秒的消息都没有收到。

这两种情况外观相似，处理方式却不同：

- 没有最新采集数据，说明链路仍然正常，只是当前自然秒没有点位；
- 连续收不到按秒发送的数据，说明实时链路异常，需要暂停渲染并恢复连接；
- 数据仍在到达时，前端要保证进入渲染队列的点按时间递增，避免轨迹回头、折线倒退。

这里的目标不是强制每个采样点都到达前端。服务端按照采样时间发送数据，同一条 WebSocket 连接保持消息顺序，前端直接按接收顺序入队。设计重点落在三件事上：按自然秒划分数据，通过最新批次时间判断是否连续，连接异常后从缺失时间开始补发，再把接收与逐帧渲染拆开。

### 【整体链路】

```text
模拟器或真实采集程序向遥测表写入数据
   ↓
独立的实时数据服务等待当前自然秒结束
   ↓
实时数据服务查询数据库中该秒的数据并封装 telemetry_second
   ├─ bucketStartMs / bucketEndMs：这一批属于哪个自然秒
   ├─ status = live：本秒有采集数据
   └─ status = no-data：数据库中该秒没有数据，points 为空
   ↓
按每条 WebSocket 连接的订阅上限做确定性抽样
   ↓
客户端先比较 bucketStartMs 与“下一批数据的期望起始时间”
   ├─ 连续缺 0～2 秒 → 接受当前批次，允许少量缺失
   ├─ 连续缺 3 秒及以上 → 请求从缺口起点补发，当前批次不入队
   ├─ 已处理过的批次 → 丢弃
   └─ 空批次             → 不产生数据点，但照常更新接收进度
   ↓
服务端已经按 sampledAt 排好点位，前端直接追加到帧队列尾部
   ↓
渲染循环每帧从队首取固定数量的点，默认每帧 1 点
```

### 【按自然秒分组：先统一采集与发送边界】

#### <u>1. 采集频率与发送频率分开</u>

模拟器允许选择每秒 `1 / 5 / 10 / 20` 个采样点。这个配置决定一秒内生成多少点，不改变服务端的发送节奏。发送端始终等一个自然秒结束后发送该秒对应的一批数据，因此一批不会由“前一秒后半段 + 后一秒前半段”拼成。

```ts
export const SIMULATOR_POINT_RATES = [1, 5, 10, 20] as const;

private generateBucket(bucketStartMs: number) {
  const count = this.config.pointsPerSecond;
  const spacing = SECOND_MS / count;
  const pending = Array.from({ length: count }, (_, offset) =>
    createTelemetryPoint(
      this.generatedPoints + offset,
      bucketStartMs + offset * spacing,
      this.config.robotId,
      this.config.pattern,
    ),
  );
  return this.database.insertTelemetry(pending);
}
```

当频率为 20 点/秒时，点位时间依次落在该秒的 `0ms、50ms、100ms……950ms`；频率为 5 点/秒时，间隔为 200ms。这里不存在同一个毫秒生成多个点，也不会把点生成在桶结束时间上。

源码位置：[`simulator.ts`](../QHZHC_Server/src/server/simulator.ts#L85-L112)、[`types.ts`](../QHZHC_Server/src/shared/types.ts#L80-L88)

#### <u>2. 采集时钟与读取时钟相互独立</u>

模拟器从下一个自然秒开始写入数据；实时数据服务也从下一个自然秒开始推进，但要等该秒结束后再读取数据库。两者使用相同的自然秒边界，却不存在调用关系。

```ts
// 模拟器：只负责在桶起点写库
function nextNaturalSecond(now = Date.now()): number {
  return Math.floor(now / SECOND_MS) * SECOND_MS + SECOND_MS;
}

start(): SimulatorStatus {
  if (!this.running) {
    this.running = true;
    this.nextBucketStartMs = nextNaturalSecond();
    this.scheduleNextBucket();
  }
  return this.getStatus();
}

// 实时数据服务：负责在桶结束后读库
private scheduleNextBucket(): void {
  const bucketStartMs = this.nextBucketStartMs ?? nextNaturalSecond();
  const delay = Math.max(0, bucketStartMs + SECOND_MS - Date.now());
  this.timer = setTimeout(() => {
    const bucket = this.readBucket(this.defaultRobotId, bucketStartMs);
    this.publisher(bucket);
    this.nextBucketStartMs = bucketStartMs + SECOND_MS;
    this.scheduleNextBucket();
  }, delay);
}
```

这样既能让客户端通过 `bucketStartMs` 判断先后关系，也能把数据来源替换掉：停止模拟器并接入真实采集程序后，只要真实数据仍写入同一张遥测表，实时读取与 WebSocket 投递代码都不需要修改。

#### <u>3. 实时读取不依赖模拟器状态</u>

服务端将采集来源与实时读取拆成两个独立方向：

```text
模拟器 ─────┐
            ├→ 遥测表 → TelemetryStreamService 查询 → RobotSocketHub 投递
真实采集程序 ┘
```

模拟器只是一种可替换的数据写入端。`TelemetryStreamService` 位于服务端实时业务代码中，只依赖数据库，不引用模拟器，也不读取模拟器的 `running` 状态。WebSocket Hub 同样不引用模拟器，只接收实时数据服务按自然秒整理好的数据批次。

```ts
// TelemetryStreamService：根据数据库查询结果构造该秒的数据批次
readBucket(robotId: string, bucketStartMs: number): TelemetrySecondBucket {
  const points = this.database.telemetryByTimeBucket(robotId, bucketStartMs);
  return {
    bucketStartMs,
    bucketEndMs: bucketStartMs + SECOND_MS,
    status: points.length > 0 ? "live" : "no-data",
    points,
  };
}
```

因此，数据库中该秒存在数据时就是 `live`，查询结果为空时就是 `no-data`。`no-data` 只表达“数据库中没有这一秒的新数据”，不能反推出模拟器或真实采集设备处于什么状态。

数据库查询为空时，服务端仍会发送一个 `points: []` 的空批次。空批次没有“最新数据点”，但它证明这一秒的消息已经到达，因此客户端只更新已经接收到的最新时间，不更新最大数据点。这也是页面区分“无新数据”和“网络异常”的基础。

源码位置：[`telemetry-stream.ts`](../QHZHC_Server/src/server/telemetry-stream.ts#L26-L84)、[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L67-L140)、[`simulator.ts`](../QHZHC_Server/src/server/simulator.ts#L39-L112)

### 【按连接控制发送数量】

前端可以选择每秒最多接收 `1 / 2 / 5 / 10 / 20` 个点，`0` 表示接收该秒全部点。这个参数属于单条 WebSocket 连接，在首帧鉴权时和断线恢复的起始时间一起提交，不会改变模拟器的采集频率，也不会影响其他连接。

```ts
// 客户端
socket.send(JSON.stringify({
  type: "authenticate",
  accessToken,
  protocolVersion: PROTOCOL_VERSION,
  robotId: ROBOT_ID,
  resumeFromBucketStartMs: this.latestBatchStartMs + SECOND_MS,
  maxPointsPerSecond: this.maxPointsPerSecond,
}));
```

服务端先把同一秒内的数据点按采样时间排好，再根据“车辆 + 自然秒起始时间 + 数量上限 + 点位时间”计算稳定哈希。哈希较小的点被选中，最后重新按时间排序后发送：

```ts
const seed = `${robotId}:${bucketStartMs}:${limit}:v1`;
return ordered
  .map((point) => ({
    point,
    score: this.stableHash(`${seed}:${point.sampledAt}`),
  }))
  .toSorted((left, right) => left.score - right.score)
  .slice(0, limit)
  .map(({ point }) => point)
  .toSorted((left, right) => left.sampledAt.localeCompare(right.sampledAt));
```

相同车辆、相同自然秒和相同数量上限会得到相同结果。首次发送和缺口补发不会因为再次抽样而选出另一组点。

源码位置：[`protocol.ts`](../QHZHC_Server/src/shared/protocol.ts#L63-L104)、[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L248-L292)

### 【首次进入页面：最近五分钟数据与实时接收进度衔接】

页面进入实时模式时，先通过 HTTP 请求最近五分钟的数据，用于恢复地图和图表的可见上下文；然后根据最后一个历史点确定 WebSocket 从哪个自然秒继续。

```text
enterRealtimeMode()
  ├─ ++realtimeRequestSequence                ← 作废上一次入口，抵御竞态
  ├─ 清空 gasdata / mapList / checkData / detailsFlag，移除地图上的重建轨迹
  ├─ loading = true
  ├─ await fetchFiveMinuteWindow()            ← GET /api/chart/dataTrans/5min
  │     服务端：to = time ?? now；from = to - 5min；queryHistory(limit 300)
  │     返回 { code, message, data }，data 为按时间升序的下划线字段点位
  ├─ isCurrentRealtimeRequest(seq) 为假 → 直接放弃本次结果
  │     （用户已切到历史模式，或重新进入实时模式）
  ├─ applyRealtimeInitialWindow(result)
  │     gasdata = result；mapList = 全部点
  │     checkData / detailsFlag = points.length > 0
  │     detailData 与天气 = 最后一个点
  │     $nextTick → redrawRealtimeWindow()    ← 等 mapList 触发视图更新后再绘制
  └─ finally：isCurrentRealtimeRequest(seq) 成立才启动实时连接
        initialBucketStartMs = 最后一个点所属自然秒 + 1000
        startRealtime({ initialBucketStartMs })
              ↓
        new RealtimeClient({ initialBucketStartMs, maxPointsPerSecond, maxPerFrame: 1 })
        → latestBatchStartMs = normalizeBucketStart(initialBucketStartMs) - 1000
        → start() → connect() → 首帧 authenticate 携带 resumeFromBucketStartMs
```

起点由最后一个历史点算出，而不是直接用当前时间：

```ts
const latestPoint = this.mapList[this.mapList.length - 1];
const latestPointTime = Date.parse(latestPoint && latestPoint.time);
const initialBucketStartMs = Number.isFinite(latestPointTime)
  ? Math.floor(latestPointTime / 1000) * 1000 + 1000
  : Math.floor(Date.now() / 1000) * 1000 + 1000;
this.startRealtime({ initialBucketStartMs });
```

源码位置：[`dataVisualization.vue`](../QHZHC_Web/src/views/DataVisualization/dataVisualization.vue#L798-L840)、[`dataVisualization.vue`](../QHZHC_Web/src/views/DataVisualization/dataVisualization.vue#L841-L864)、[`app.ts`](../QHZHC_Server/src/server/app.ts#L313-L322)、[`historyApi.ts`](../QHZHC_Web/src/views/DataVisualization/services/historyApi.ts#L62-L78)

需要说明的是，五分钟窗口在服务端最多返回 300 个点。按 20 点/秒计算，五分钟有 6000 个点，因此超出上限时服务端会按 `step = ceil((total - 1) / (limit - 1))` 做等间隔抽样，并在 SQL 中显式保留 `row_number = 1` 与 `row_number = total` 两行：

```sql
WHERE row_number = 1
   OR row_number = ?
   OR ((row_number - 1) % ?) = 0
ORDER BY sequence ASC LIMIT ?
```

源码位置：[`database.ts`](../QHZHC_Server/src/server/database.ts#L458-L473)

也就是说，返回的点被均匀抽稀到约每秒一个，但**首尾两点必定包含**。这一点是「用最后一个历史点推算接收起点」能够成立的前提：只有最后一个点确实是最新采集点，`+1 秒` 才是正确的后继秒。

`this.startRealtime({ initialBucketStartMs });` 启动实时链路，客户端对这个起点还会再校验一次：非法值或非整秒会回落到下一个自然秒，保证最新批次时间始终对齐自然秒边界。

```ts
this.latestBatchStartMs = normalizeBucketStart(options.initialBucketStartMs) - SECOND_MS;
```

服务端拿到 `resumeFromBucketStartMs` 后只做一件事：判断客户端是否落后，落后才补发。`latestBucketStartMs` 表示实时数据服务最近处理到的自然秒，不是数据库里最后一个点的时间：

```ts
const latest = this.stream.getLatestBucketStartMs(context.robotId);
this.send(context, {
  type: "welcome",
  // …
  latestBucketStartMs: latest,
  resumedFromBucketStartMs: message.resumeFromBucketStartMs,
});

if (latest !== null && message.resumeFromBucketStartMs <= latest) {
  this.replayBuckets(context, message.resumeFromBucketStartMs, latest);
}
context.initialized = true;
```

源码位置：[`realtimeClient.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L85-L105)、[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L277-L292)

两侧的时间边界关系如下：

```text
HTTP 窗口        ├──────────── 最近 5 分钟 ────────────┤
                                                      最后一个点所属秒 S
WebSocket 起点                                          ├── 从 S+1s 开始接收
服务端已处理时间（latest）                                └── 最多到 S-1s（S 秒结束后到 S）
```

由此得到三种衔接结果：

| 情况 | 判定 | 行为 |
| --- | --- | --- |
| HTTP 刚返回，服务端还没走到起点 | `resumeFrom > latest` | 不补发，直接等下一批 live |
| HTTP 请求期间服务端又处理了几秒数据 | `resumeFrom <= latest` | 先补发 `resumeFrom … latest` 的每一秒，再转 live |
| 起点早于留存范围或补发预算 | 桶数 > `MAX_REPLAY_BUCKETS` | 下发 `gap`，跳到最新秒继续 |

**整秒数据在查询前完成写入，是这套衔接成立的前提。** 模拟器在自然秒起点一次性写入该秒的全部点位，因此可以从最后一个历史点所属自然秒的下一秒继续。如果换成逐点写入的真实采集程序，应先明确“该秒数据已经写完”的判断方式，再允许实时数据服务读取，不能依赖前端去重弥补服务端过早查询。

最后有三点边界行为值得说明：

- **HTTP 失败不阻塞实时链路**。请求失败只写入 `signalState` 并弹提示，`finally` 里照样启动 WebSocket；此时 `mapList` 为空，起点回落到下一个自然秒，页面会先空着、再等真实点位到达。
- **实时连接一定在历史请求之后建立**。建连写在 `finally` 中，因此不存在“WebSocket 已在写入、HTTP 又整体替换 `mapList`”的交叉。
- **HTTP 取回的点不参与实时缺失判断**。客户端只用构造参数初始化 `latestBatchStartMs`，之后由 WebSocket 消息持续更新；两套数据来源不会混在一起计算缺失时间。

### 【服务端定时投递：空转、补发与实时的切换】

#### <u>1. 定时器在进程启动时就跑起来，与连接无关</u>

采集端与投递端各有一个独立节拍器，都在 `server.listen` 成功回调里启动：

```ts
server.listen(config.port, config.host, () => {
  telemetryStream.start();   // 投递节拍：每秒读库并交给 hub 投递
  simulator.start();         // 采集节拍：每秒把该秒点位写入遥测表
  // …
});
```

两者靠一行代码接线，`publisher` 是「投递节拍」唯一的出口：

```ts
socketHub = new RobotSocketHub(server, auth, telemetryStream);
telemetryStream.setPublisher((bucket) => socketHub?.publish(bucket));
```

源码位置：[`index.ts`](../QHZHC_Server/src/server/index.ts#L32-L42)

#### <u>2. 每秒一轮的固定动作</u>

投递节拍用的是**自链式 setTimeout**，不是 `setInterval`：下一轮在上一轮执行完才排期，延迟固定算到「该自然秒结束的那一刻」，因此节拍永远对齐自然秒边界，也不会堆积回调。

```ts
private scheduleNextBucket(): void {
  const bucketStartMs = this.nextBucketStartMs ?? nextNaturalSecond();
  this.nextBucketStartMs = bucketStartMs;
  const delay = Math.max(0, bucketStartMs + SECOND_MS - Date.now());
  this.timer = setTimeout(() => {
    this.timer = null;
    const bucket = this.readBucket(this.defaultRobotId, bucketStartMs);
    this.latestBucketStartMs = bucketStartMs;
    this.publisher(bucket);
    this.nextBucketStartMs = bucketStartMs + SECOND_MS;
    this.scheduleNextBucket();
  }, delay);
}
```

源码位置：[`telemetry-stream.ts`](../QHZHC_Server/src/server/telemetry-stream.ts#L72-L83)

每一轮固定做四件事：**读库 → 更新服务端最新处理时间 → 交给 publisher → 排下一轮**。其中 `latestBucketStartMs` 无论有没有连接都会更新，握手时用它判断是否需要补发。

#### <u>3. 没有连接时：定时器照跑，投递空转</u>

`publish` 遍历的是连接集合，集合为空就什么都不发：

```ts
publish(bucket: TelemetrySecondBucket): void {
  for (const context of this.clients.values()) {
    // 未握手的连接跳过后期的实时流：它缺的那段会由重放计划补齐，两边不会重复。
    if (!context.initialized || context.replaying) continue;
    // …
  }
}
```

这里有两个容易被忽略的点：

- **空转只发生在"投递"这一步，"读库"照样执行**。所以一个客户端都没有、或模拟器已暂停时，服务端每秒仍会查一次库；该秒没有数据时生成 `no-data`。这是空闲状态下的固定开销。
- **即使连接已建立，也可能被跳过**。`initialized === false`（握手尚未完成）和 `replaying === true`（正在补发）的连接都不参与实时投递，它们缺的那段由补发负责，避免同一秒被投递两次。

#### <u>4. 建立连接时：先判要不要补发，再决定进实时</u>

握手最后一步只比较服务端最新处理时间与客户端提交的恢复起点。

```ts
const latest = this.stream.getLatestBucketStartMs(context.robotId);
this.send(context, {
  type: "welcome",
  // …
  latestBucketStartMs: latest,
  resumedFromBucketStartMs: message.resumeFromBucketStartMs,
});

if (latest !== null && message.resumeFromBucketStartMs <= latest) {
  this.replayBuckets(context, message.resumeFromBucketStartMs, latest);
}
context.initialized = true;
```

源码位置：[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L277-L292)

| `resumeFromBucketStartMs` 与 `latest` 的关系 | 行为                                |
| -------------------------------------------- | ----------------------------------- |
| `latest === null`（库里从未有数据）          | 不补发，直接进入实时                |
| `resumeFrom > latest`（起点比服务端还新）    | 不补发，直接进入实时                |
| `resumeFrom <= latest`                       | 从起点逐秒补发到 `latest`，再进实时 |
| 桶数 > `MAX_REPLAY_BUCKETS`（5 000）         | 下发 `gap`，跳到最新秒，不补发      |

##### 两个入口，同一套逻辑

`replayBuckets` 只有两个调用点，入参语义完全一致（起点与终点都对齐整秒，且**两端都含**）：

| 调用点               | 起点                               | 终点          | 触发原因                           |
| -------------------- | ---------------------------------- | ------------- | ---------------------------------- |
| `handleAuthenticate` | 报文里的 `resumeFromBucketStartMs` | 当前 `latest` | 建连 / 断线重连握手                |
| `handleResend`       | 报文里的 `fromBucketStartMs`       | 当前 `latest` | 客户端发现跳秒 ≥3 秒，主动请求补发 |

```ts
private handleResend(context: ClientContext, fromBucketStartMs: number): void {
  const latest = this.stream.getLatestBucketStartMs(context.robotId);
  if (latest === null || fromBucketStartMs > latest) return;
  this.replayBuckets(context, fromBucketStartMs, latest);
}
```

判断依据是“服务端最近处理到的自然秒”，而不是“数据库里最后一个点的时间”：

| 取值来源                          | 含义                                 | 为什么用它                                                   |
| --------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `stream.getLatestBucketStartMs()` | 定时器最近查询过的自然秒 | 补发只进行到服务端已经处理的位置 |
| `database.latestTelemetry()` | 数据库最后写入点的时间 | 只在进程启动后第一次定时查询尚未执行时作为兜底 |

##### 超限就整段放弃，不做部分补发

```ts
const bucketCount = Math.floor((throughBucketStartMs - fromBucketStartMs) / 1_000) + 1;
const earliest = this.stream.earliestTelemetryBucketStartMs(context.robotId);
if (bucketCount > MAX_REPLAY_BUCKETS) {
  this.sendGap(context, fromBucketStartMs, earliest, throughBucketStartMs);
  return;
}
```

因为两端对齐整秒，桶数是精确值：`from = 08:15:07`、`through = 08:15:09` → `(2000) / 1000 + 1 = 3` 个桶（07、08、09 秒）。

超过 `MAX_REPLAY_BUCKETS`（5 000 桶 ≈ 83 分钟）时**整段放弃**，而不是先补一段再跳：部分补发会让客户端渲染出一段并不连续的曲线，不如直接跳过。

##### 逐秒补发的完整报文序列

以 `resumeFromBucketStartMs = 1789892107000`（08:15:07）、`latest = 1789892109000`（08:15:09）、`maxPointsPerSecond = 1` 为例，客户端会依次收到 **1 条 welcome + 3 条 telemetry_second + 1 条 replay_complete**。

```jsonc
// ① 握手确认，随后才开始补发
{ "type": "welcome", "protocolVersion": 2, "connectionId": "3f1c9e20-…", "robotId": "QH-ZHC-01",
  "heartbeatIntervalMs": 8000, "latestBucketStartMs": 1789892109000, "resumedFromBucketStartMs": 1789892107000 }

// ② 08:15:07 秒有数据，limit=1 抽样后 1 个点
{ "type": "telemetry_second", "batchId": "QH-ZHC-01:1789892107000:1:v1",
  "bucketStartMs": 1789892107000, "bucketEndMs": 1789892108000,
  "status": "live", "replay": true, "sentAt": 1789892110123,
  "points": [ { "sequence": 123456, "robotId": "QH-ZHC-01", "sampledAt": "2026-09-20T08:15:07.850Z",
                "longitude": 116.4213097, "latitude": 39.9124561, "altitude": 118.42,
                "speed": 21.37, "heading": 45.12, "priCo2": 452.318, "priCh4": 2.4213,
                "priC2h6": 0.1654, "priCo": 0.1732, "priN2o": 0.3481, "priH2o": 0.9321,
                "picarroCh4": 2.3847, "picarroCo2": 456.912, "picarroH2o": 0.8712,
                "windSpeed": 3.42, "windDirection": 93.17, "temperature": 24.83,
                "humidity": 63.45, "pressure": 1008.71 } ] }

// ③ 08:15:08 秒数据库无数据，仍发送空批次
{ "type": "telemetry_second", "batchId": "QH-ZHC-01:1789892108000:1:v1",
  "bucketStartMs": 1789892108000, "bucketEndMs": 1789892109000,
  "status": "no-data", "replay": true, "sentAt": 1789892110124, "points": [] }

// ④ 08:15:09 秒有数据
{ "type": "telemetry_second", "batchId": "QH-ZHC-01:1789892109000:1:v1",
  "bucketStartMs": 1789892109000, "bucketEndMs": 1789892110000,
  "status": "live", "replay": true, "sentAt": 1789892110125,
  "points": [ { "sequence": 123457, "sampledAt": "2026-09-20T08:15:09.100Z", "…": "…" } ] }

// ⑤ 补发结束标记
{ "type": "replay_complete", "throughBucketStartMs": 1789892109000 }
```

三点值得对照：

- **`batchId` 不是随机值**，格式为 `${robotId}:${bucketStartMs}:${limit}:v1`，因此同一秒同一上限的批次标识稳定，便于排查"这条数据是哪次发送的"。
- **第 ③ 条是空批次**，说明数据库中该秒没有点位。客户端仍更新最新批次时间，从而区分“该秒没有数据”和“该秒的消息没有到达”。
- **`replay: true` 与会话无关**，它只标记"这条属于补发"。补发结束后正常实时投递的是结构完全相同、但 `replay: false` 的批次。

如果桶数超限，上面那张表里的「逐秒补发」就不会发生，取而代之的是一条 `gap`：

```json
{ "type": "gap", "requestedFromBucketStartMs": 1789892107000,
  "earliestAvailableBucketStartMs": 1789895407000,
  "latestBucketStartMs": 1789895709000, "action": "skip-to-latest" }
```

注意 `gap` 之后不会再发 `replay_complete`，因为补发没有开始。客户端在 `skipUnavailableGap()` 中把最新批次时间更新到服务端给出的时间，并将 `recoveringGap` 复位。

##### 客户端如何消费这些字段

| 字段                                        | 客户端动作                                                   |
| ------------------------------------------- | ------------------------------------------------------------ |
| `bucketStartMs < latestBatchStartMs + 1000` | 丢弃已经处理过的批次 |
| 跳秒 ≥3 且 `replay === false`               | 发 `resend_time_range`，进入 `recoveringGap`                 |
| `status === "no-data"` | 更新最新批次时间，`frameQueue.pause()` |
| `points` 非空且 `replay === true`           | 入队并 `frameQueue.resume()`，补发过程中就开始渲染           |
| `replay_complete`                           | `recoveringGap = false`，按 `lastBucketStatus` 决定恢复渲染还是保持 no-data |

补发选出的点与首次发送的点**完全一致**，靠的是采样用的确定性种子 `${robotId}:${bucketStartMs}:${limit}:v1`：同一秒无论发几次，`samplePoints` 都选出同一组点，因此客户端即便重复收到同一秒，也不会因为抽样结果不同而出现曲线抖动。

##### 关于 `context.replaying` 的一点说明

`context.replaying = true` 与 `= false` 出现在**同一个同步函数体**内，中间没有 `await`（`readBucket`、`samplePoints`、`send` 均为同步）。而 `publish` 只可能由定时器回调触发，无法插入到这个函数中间。

也就是说，`publish` 里的 `if (!context.initialized || context.replaying) continue;` 中，`replaying` 这一项在当前实现下不会被命中；客户端那侧的 `if (this.recoveringGap && !message.replay) return;` 同理。这两处都是**为将来预留的防御性代码**：一旦补发改成"分批 + `await` 让出事件循环"（例如每 200 桶让步一次以避免长时间阻塞），它会立刻变成必需的——届时没有这个标记，实时桶就会插进补发序列中间。

#### <u>5. 进入实时后：每条连接独立完成发送</u>

补发结束（或无需补发）后，该连接进入实时投递。注意**采样发生在分发循环内部**：`maxPointsPerSecond` 是单条连接的参数，同一次 `publish` 对不同连接会算出不同的点集，因此不存在「先统一采样、再分发给所有连接」的做法。

```text
publish(bucket)
  └─ 遍历每条已握手且未在补发的连接
       ├─ 1. 过滤：只保留 robotId 匹配的点位
       ├─ 2. 采样：按本连接 maxPointsPerSecond 做确定性抽样（0 表示全部）
       ├─ 3. 打包：telemetry_second（bucketStartMs、bucketEndMs、status、replay = false）
       └─ 4. 发送：readyState 检查 → 2MB 背压检查 → 序列化写出
```

```ts
publish(bucket: TelemetrySecondBucket): void {
  for (const context of this.clients.values()) {
    if (!context.initialized || context.replaying) continue;
    const matching = bucket.points.filter((point) => point.robotId === context.robotId);
    const sampled = this.samplePoints(matching, context.maxPointsPerSecond, context.robotId, bucket.bucketStartMs);
    this.sendTelemetrySecond(context, bucket.bucketStartMs, bucket.bucketEndMs, bucket.status, sampled, false);
  }
}
```

源码位置：[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L111-L131)、[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L405-L414)

最后的 `send` 有两个检查：

```ts
private send(context: ClientContext, message: ServerMessage): void {
  if (context.socket.readyState !== WebSocket.OPEN) return;
  if (context.socket.bufferedAmount > 2 * 1024 * 1024) {
    context.socket.close(1013, "client backpressure");
    return;
  }
  context.socket.send(serializeServerMessage(message));
}
```

`socket.send()` 是**同步非阻塞**的：数据先进入 socket 缓冲区，背压由此产生。积压超过 2MB 说明客户端消费不动，此时服务端主动断开连接。客户端重连时从最新批次的下一秒继续请求，服务端重新查询数据库并发送这一段数据。

##### 采样：`samplePoints` —— 确定性抽稀

这一步决定"这一秒到底发给这条连接哪些点"。它必须在**同一次抽样的结果可复现**这个前提下工作，否则补发与实时会选出不同的点，曲线就会抖动。

```ts
private samplePoints(
  points: TelemetryPoint[],
  limit: DeliveryPointLimit,
  robotId: string,
  bucketStartMs: number,
): TelemetryPoint[] {
  // ① 先按采样时间排序（同一毫秒时按序号兜底），与入参顺序无关
  const ordered = points.toSorted((left, right) =>
    left.sampledAt.localeCompare(right.sampledAt) || left.sequence - right.sequence,
  );
  // ② 不限制，或本秒点数本来就少于上限 → 全部发送
  if (limit === 0 || ordered.length <= limit) return ordered;
  // ③ 种子由「车辆 + 自然秒 + 上限 + 版本」组成，与连接无关
  const seed = `${robotId}:${bucketStartMs}:${limit}:v1`;
  return ordered
    .map((point) => ({ point, score: this.stableHash(`${seed}:${point.sampledAt}`) }))
    .toSorted((left, right) => left.score - right.score)   // 按哈希分数升序
    .slice(0, limit)                                       // 取分数最小的 limit 个
    .map(({ point }) => point)
    .toSorted((left, right) => left.sampledAt.localeCompare(right.sampledAt)); // 再排回时间顺序
}
```

源码位置：[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L376-L403)

四个设计点：

- **确定性来自"哈希分数"而不是随机数**。若用 `Math.random()` 抽稀，同一秒两次发送会选出不同点，补发段与实时段拼接时曲线会跳变。
- **种子不含连接 ID**，只含 `robotId:bucketStartMs:limit:v1`。所以同一辆车、同一秒、同一上限，在任何一条连接上抽出的都是同一组点；`v1` 留给将来更换算法时做版本隔离。
- **抽样结果在时间上天然分散**。哈希分数与 `sampledAt` 无关，所以选中的点是随机散布在该秒内，而不是"总是取整秒开头那一批"或"等间隔取"。
- **`limit === 0` 表示不限制**。合法取值为 `[0, 1, 2, 5, 10, 20]`，由协议层在首帧就校验过：

```ts
return (
  typeof candidate.accessToken === "string" &&
  candidate.protocolVersion === PROTOCOL_VERSION &&
  isNaturalSecond(candidate.resumeFromBucketStartMs) &&
  DELIVERY_POINT_LIMITS.includes(candidate.maxPointsPerSecond as DeliveryPointLimit)
);
```

源码位置：[`protocol.ts`](../QHZHC_Server/src/shared/protocol.ts#L63-L85)、[`types.ts`](../QHZHC_Server/src/shared/types.ts#L49)

`stableHash` 是手写的 FNV-1a 32 位哈希，用它而不是加密哈希，是因为这里只需要"稳定 + 快 + 分布均匀"，不涉及安全：

```ts
private stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
```

**抽稀是不可逆的**：`limit = 1` 时，无论该秒实际生成了 20 个点还是 2 个点，客户端都只收到 1 个。这是"按连接控制发送数量"的直接含义——降低带宽换取的代价就是点位密度下降，而不是把点攒到后面补上。

##### 打包：`sendTelemetrySecond` —— 信封的唯一出口

实时与补发共用同一个打包函数，唯一差别就是 `replay` 布尔值：

```ts
private sendTelemetrySecond(
  context: ClientContext,
  bucketStartMs: number,
  bucketEndMs: number,
  status: TelemetryBucketStatus,
  points: TelemetryPoint[],
  replay: boolean,
): void {
  this.send(context, {
    type: "telemetry_second",
    batchId: `${context.robotId}:${bucketStartMs}:${context.maxPointsPerSecond}:v1`,
    bucketStartMs,
    bucketEndMs,
    status,
    points,
    sentAt: Date.now(),
    replay,
  });
}
```

源码位置：[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L356-L374)

| 字段 | 语义 | 什么时候被读 |
| --- | --- | --- |
| `bucketStartMs` / `bucketEndMs` | 这一批属于哪个自然秒 | 客户端判断重复和连续缺失，更新最新批次时间 |
| `status` | `live` / `no-data` | 决定客户端暂停还是恢复渲染 |
| `points` | 确定性抽样后、按采集时间排列的点 | 追加到渲染队列尾部 |
| `replay` | 是否属于补发 | 客户端选择"补发语义"还是"实时语义" |
| `batchId` | `${robotId}:${bucketStartMs}:${limit}:v1` | 日志与排查，同一秒同一上限稳定不变 |

包体不做任何校验后就直接交给 `send()`，由它完成最后一次过滤：

```ts
private send(context: ClientContext, message: ServerMessage): void {
  if (context.socket.readyState !== WebSocket.OPEN) return;
  if (context.socket.bufferedAmount > 2 * 1024 * 1024) {
    context.socket.close(1013, "client backpressure");
    return;
  }
  context.socket.send(serializeServerMessage(message));
}
```

`socket.send()` 是**同步非阻塞**的：数据先进入 socket 缓冲区，`bufferedAmount` 反映的就是这个积压量。因此实时投递与瞬时补发都可能在这里被主动断开。页面先进入“网络异常”，重连后客户端从最新批次的下一秒继续请求。

#### <u>6. 四种连接状态下的行为对照</u>

| 连接状态                                      | `publish` 是否投递 | 缺口由谁补                              |
| --------------------------------------------- | ------------------ | --------------------------------------- |
| 尚未建立 WebSocket                            | 无投递对象         | 建立后按 `resumeFromBucketStartMs` 补发 |
| 已建立、`initialized === false`（握手进行中） | 跳过               | 握手中收到的补发覆盖这段                |
| `replaying === true`（补发进行中）            | 跳过               | 补发流自身覆盖，直到 `replay_complete`  |
| 已握手、空闲                                  | 投递               | —                                       |

一句话概括整条链路：**服务端按自然秒查询和发送，每条连接保存自己的订阅参数；客户端重连时提交下一批应从哪一秒开始，服务端据此补发后再进入实时发送。**

### 【有序接收与缺口决策】

前端只保留两个与实时处理直接相关的位置：

| 位置 | 变量 | 含义 |
| --- | --- | --- |
| 最新批次时间 | `latestBatchStartMs` | 最近接受的一批数据所属自然秒；用于判断连续缺失和确定重连起点，空批次也会更新 |
| 下一个渲染点 | `nextRenderPoint` | 渲染队列中下一帧准备绘制的点；队列为空时为 `null` |

这两个位置分别属于数据接收和页面渲染，彼此不替代。页面可能尚未画完队列中的旧点，但客户端已经收到更新的批次；因此重连起点依据最新批次时间，而不是依据当前画到哪个点。

客户端接受一批数据后，无论其中是否有数据点，都先更新接收进度：

```ts
this.latestBatchStartMs = message.bucketStartMs;
this.lastBucketStatus = message.status;

if (message.points.length > 0) {
  this.frameQueue.enqueue(message.points);
  this.nextRenderPoint = this.frameQueue.peekNext();
}
```

源码位置：[`realtimeClient.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L250-L302)

#### <u>1. 只判断数据批次是否连续</u>

每批只属于一个自然秒。前端用 `latestBatchStartMs + 1000` 得到下一批的期望时间，再与收到的 `bucketStartMs` 比较：

| 收到的数据批次 | 判断 | 处理 |
| --- | --- | --- |
| 小于期望时间 | 已处理过的数据 | 整批丢弃 |
| 等于期望时间 | 连续到达 | 接受并更新最新批次时间 |
| 比期望时间晚 1～2 秒 | 少量缺失 | 跳过缺失时间，接受当前批次 |
| 比期望时间晚 3 秒及以上 | 连续缺失达到阈值 | 当前批次不入队，从期望时间请求补发 |

“连续缺少三个及以上”计算的是没有收到完整数据批次的自然秒数，而不是少了三个采样点。只要该秒的消息已经到达，就不属于连续缺失。

#### <u>2. 连续缺少三秒触发补发</u>

```ts
const expectedStartMs = this.latestBatchStartMs + SECOND_MS;
const missingBucketCount = Math.floor(
  (message.bucketStartMs - expectedStartMs) / SECOND_MS,
);
if (!message.replay && missingBucketCount >= 3) {
  this.recoveringGap = true;
  this.send({
    type: "resend_time_range",
    fromBucketStartMs: expectedStartMs,
  });
  return;
}
```

触发补发的当前批次不会先进入队列。`recoveringGap` 置为 `true` 后，补发完成前到达的普通实时批次也直接丢弃，避免后续数据先入队、补发数据再插到前面。

服务端收到 `resend_time_range` 后，从请求的自然秒开始查库，一直补到服务端当前已经处理的最新自然秒。补发期间，该连接暂停普通实时投递；每一秒的补发数据仍使用这条连接自己的抽样上限。最后发送 `replay_complete`，客户端再退出补发状态。

```ts
context.replaying = true;
for (
  let bucketStartMs = fromBucketStartMs;
  bucketStartMs <= throughBucketStartMs;
  bucketStartMs += 1_000
) {
  const source = this.database.telemetryByTimeBucket(
    context.robotId,
    bucketStartMs,
  );
  this.sendTelemetrySecond(
    context,
    bucketStartMs,
    bucketStartMs + 1_000,
    source.length > 0 ? "live" : "no-data",
    this.samplePoints(source, context.maxPointsPerSecond, context.robotId, bucketStartMs),
    true,
  );
}
this.send(context, { type: "replay_complete", throughBucketStartMs });
context.replaying = false;
```

如果请求跨度超过单次补发预算，服务端返回 `gap`，客户端保留已经进入渲染队列的数据，把接收进度更新到服务端给出的最新时间，再继续接收后续数据。无法补齐的区间不阻塞整条实时链路。

源码位置：[`realtimeClient.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L250-L302)、[`robot-socket-hub.ts`](../QHZHC_Server/src/server/robot-socket-hub.ts#L301-L354)

#### <u>3. 数据点直接追加到队列尾部</u>

服务端在 `samplePoints` 中已经按 `sampledAt` 整理好同一批的数据；同一条 WebSocket 连接又会保持消息的发送顺序。因此前端接受一个数据批次后，直接追加到队列尾部：

```ts
this.frameQueue.enqueue(message.points);
this.nextRenderPoint = this.frameQueue.peekNext();
```

网络断开期间没有到达客户端的数据，在重连后按时间补发。接收逻辑只处理批次是否连续，渲染逻辑只处理队列消费，两者边界清楚。

### 【接收与渲染解耦】

WebSocket 批次到达后，合格点位立即追加到队列尾部；地图和图表不在消息回调里一次性绘制整秒数据，而是由 `requestAnimationFrame` 从队首逐帧消费。默认每帧最多取 1 个点。

```ts
private flush(): void {
  this.frameHandle = null;
  const startedAt = this.scheduler.now();
  const batch: TelemetryPoint[] = [];
  while (
    this.cursor < this.queue.length &&
    batch.length < this.maxPerFrame &&
    this.scheduler.now() - startedAt < this.budgetMs
  ) {
    const point = this.queue[this.cursor++];
    if (point) batch.push(point);
  }
  if (batch.length) this.onFrame(batch);
  if (this.cursor < this.queue.length) this.schedule();
}
```

“服务端每秒发一批”和“前端每帧画几个点”是两个独立参数：前者控制网络消息边界，后者控制页面渲染节奏。即使某秒收到 20 个点，也不会要求页面在一次回调中把 20 个点全部画完。

队列支持暂停和恢复。网络异常或服务端明确无新数据时，前端取消下一帧调度但保留队列与游标；状态恢复后继续从原队首消费，不会因为暂停清空已经接收的数据。

源码位置：[`FrameTelemetryQueue.ts`](../QHZHC_Web/src/views/DataVisualization/services/FrameTelemetryQueue.ts#L20-L80)

### 【三种页面状态如何判定】

页面只向用户表达三种与实时数据直接相关的状态：

| 状态 | 判断依据 | 渲染处理 | 页面提示 |
| --- | --- | --- | --- |
| 实时更新 | 收到 `live` 批次，或正在接收补发数据 | 恢复帧队列 | 默认状态，不额外强调 |
| 无最新采集数据 | 服务端查询数据库中该秒的数据为空，返回 `status: "no-data"` | 暂停帧队列，保留数据 | `无最新采集数据` |
| 网络异常 | WebSocket 关闭，或连接存在但连续 3 秒收不到任何按秒发送的数据 | 暂停帧队列，进入重连 | `网络异常` |

空批次和网络超时的关键区别是：空批次本身就是一条有效消息，会刷新 `lastBucketSeenAt` 并更新 `latestBatchStartMs`；网络异常则是三秒内没有收到任何按秒发送的消息。

```ts
private startBucketWatchdog(): void {
  this.bucketWatchdogTimer = window.setInterval(() => {
    if (
      !this.socket ||
      this.socket.readyState !== WebSocket.OPEN ||
      Date.now() - this.lastBucketSeenAt < BUCKET_TIMEOUT_MS
    ) return;
    this.frameQueue.pause();
    this.options.onStatus("disconnected");
    this.socket.close(
      REALTIME_CLOSE_CODE.HEARTBEAT_TIMEOUT,
      "telemetry bucket timeout",
    );
  }, SECOND_MS);
}
```

页面把 `connected` 映射为空文本，把另外两种状态映射为明确提示。用户能从页面直接判断“设备暂时没有新数据”还是“数据链路已经中断”，正常实时绘制时则不增加额外视觉干扰。

源码位置：[`realtimeClient.ts`](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L395-L411)、[`dataVisualization.vue`](../QHZHC_Web/src/views/DataVisualization/dataVisualization.vue#L621-L634)

### 【最终处理结果】

这条链路最终形成了明确的处理边界：

```text
有数据：自然秒结束 → 确定性抽样并按时间排列 → 追加到队列尾部 → 从队列头部逐帧渲染
无数据：数据库中该秒没有数据 → 发送空批次 → 更新接收进度 → 页面提示“无最新采集数据”
小缺口：缺 1～2 个自然秒 → 接受后续批次，继续向前
大缺口：缺 3 个及以上自然秒 → 当前批次不入队 → 从缺口起点补发 → 恢复实时流
网络中断：连续 3 秒没有收到按秒发送的数据或连接关闭 → 暂停渲染 → 按已接收的最新时间重连补发
无法补齐：服务端返回 gap → 跳过缺失区间 → 从服务端给出的最新时间继续
```

同一条 WebSocket 连接按发送顺序交付消息，服务端又把每批数据点按采集时间排列，因此前端只需顺序追加。`latestBatchStartMs` 负责连续缺失判断和重连起点，`nextRenderPoint` 表示下一帧要画的点，队列为空时为 `null`。数据库当前秒无数据与网络异常有不同的状态来源，页面停止更新时可以明确说明原因，并在连接恢复后从正确的自然秒继续。

## 3. 参考文献

[1] IETF. [RFC 6455: The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455.html)[S/OL]. 2011-12[2026-09-20].

[2] IETF. [RFC 9700: Best Current Practice for OAuth 2.0 Security](https://www.rfc-editor.org/rfc/rfc9700.html)[S/OL]. 2025-01[2026-09-20].

[3] AMAZON WEB SERVICES. [Handling errors in Step Functions workflows](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-error-handling.html)[EB/OL]. [2026-09-20].

[4] OPENAI. [Run state](https://openai.github.io/openai-agents-python/ref/run_state/)[EB/OL]. [2026-09-20].
