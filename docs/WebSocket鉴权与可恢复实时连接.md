# WebSocket 鉴权与可恢复实时连接

> 本篇是 **QHZHC 实时平台的 WebSocket 实践分析文档**，重点记录鉴权、会话恢复、心跳、重连、Cursor、Replay 和 Gap 在真实源码中的实现证据与边界。
>
> WebSocket 的完整通用知识体系统一维护在 Full-Stack-AI-NOTES：
> [WebSocket 完整知识体系](https://github.com/cxDlogver/cx-learn-notes/blob/main/Full-Stack-AI-NOTES/WebSocket完整知识体系.md)
>
> 推荐先通过通用文档理解协议、API、状态机、可靠性、背压与服务端架构，再用本文对照 QHZHC 的源码、测试和工程取舍。

---

## 1. WebSocket 实时连接同时包含可信连接、稳定连接和数据恢复三层问题

WebSocket 主要提供 Persistent Full-duplex Connection（持久全双工连接）。它让浏览器和服务端在一次连接建立后持续双向发送消息，但协议本身并不会自动处理登录身份、资源权限、Token 过期、断线重连和历史数据补发。

完整实时链路可以拆成三层：

~~~text
可信连接
HTTP Upgrade
    ↓
应用层认证
    ↓
身份认证
    ↓
资源授权
    ↓
连接上下文绑定

稳定连接
Access Token / Refresh Token
    ↓
Session Revalidation
    ↓
Heartbeat / Watchdog
    ↓
Close Classification
    ↓
Backoff + Reconnect

可恢复数据
Recovery Cursor
    ↓
Replay
    ↓
Gap Detection
    ↓
Replay Complete
    ↓
Live
~~~

三层分别对应不同故障：

| 层次 | 典型问题 | 正确处理 |
| --- | --- | --- |
| 可信连接 | Token 无效、用户越权、协议版本不一致 | 不允许进入业务状态 |
| 稳定连接 | 网络断开、Token 过期、服务重启 | 恢复会话或连接 |
| 可恢复数据 | 断线期间遗漏消息、历史已过留存期 | 补发或明确声明 Gap |

所以必须先建立三个判断：

~~~text
WebSocket OPEN
≠ 已完成业务鉴权

重新连接成功
≠ 登录会话已经恢复

登录会话恢复
≠ 断线期间的数据已经补齐
~~~

后面的知识点都挂在这三层之下，而不是把 JWT、心跳、重连、ACK 当作互不相关的名词。

---

## 2. HTTP Upgrade 只建立协议通道，业务系统还需要第二次握手

这一层先解决最容易被简化的问题：浏览器已经触发 open，为什么服务端还不能立即发送业务数据。

### 【HTTP Upgrade 只证明双方切换到了 WebSocket 协议】

RFC 6455 规定 WebSocket 从 HTTP Opening Handshake（开启握手）开始。浏览器发出 Upgrade 请求，服务端接受后返回 101 Switching Protocols，之后双方才开始交换 WebSocket Frame。[[1]](https://www.rfc-editor.org/rfc/rfc6455)

请求可以抽象成：

~~~http
GET /ws/resource/123 HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: ...
Sec-WebSocket-Version: 13
~~~

服务端接受：

~~~http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: ...
~~~

到这里能够证明的是：

> 客户端和服务端已经完成协议升级，底层可以交换 WebSocket Frame。

它不能证明：

- 这条连接属于哪个用户；
- 这个用户的登录状态是否仍有效；
- 用户是否允许访问 resource/123；
- 客户端和服务端是否使用相同的业务协议版本。

因此 Transport Connection（传输连接）和 Authenticated Business Connection（已认证业务连接）必须分开理解。

---

### 【浏览器 WebSocket API 决定了鉴权方案的边界】

浏览器创建连接的标准 API 是：

~~~ts
const socket = new WebSocket(url, protocols?);
~~~

WebSocket 构造器只暴露 URL 和可选 Subprotocol，没有类似 fetch 或 Axios 的 headers 配置入口。MDN 的 WebSocket() constructor 文档可以直接验证这一点。[[2]](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket)

也就是说，浏览器原生 API 不能这样使用：

~~~ts
// 浏览器原生 WebSocket 不支持这种写法
new WebSocket(url, {
  headers: {
    Authorization: "Bearer token"
  }
});
~~~

因此常见鉴权方式其实是由浏览器能力推导出来的：

| 方案 | 凭证如何进入连接 | 优点 | 主要代价 |
| --- | --- | --- | --- |
| Cookie | Upgrade 请求自动携带 | 与 Server Session 容易结合 | 自动携带凭证，需要重点防 CSWSH |
| Query Token | URL 参数 | 实现简单 | Token 容易进入日志、代理和监控 |
| 首条认证消息 | OPEN 后发送认证 Frame | Token 不进入 URL，协议边界清楚 | 未认证 socket 已经占用服务端资源 |
| 一次性 Ticket | 先用 HTTP 换临时票据，再通过 URL 使用 | 长期 Token 不暴露在 URL | 多一次签发和状态管理 |

这张表只说明方案差异，还不足以指导实现。以“首条认证消息”为例，还必须继续设计连接状态。

---

### 【首条认证消息必须配套 AUTH_PENDING 状态】

完整状态不是：

~~~text
OPEN
↓
发送 auth
↓
完成
~~~

而应该是：

~~~text
CONNECTING
    ↓ HTTP Upgrade 成功
AUTH_PENDING
    ↓ authenticate(token)
AUTHENTICATING
    ↓ 校验成功
AUTHENTICATED
    ↓
BUSINESS / REPLAY / LIVE
~~~

失败路径：

~~~text
AUTH_PENDING / AUTHENTICATING
    ↓
Token Invalid / Token Expired / Timeout
    ↓
CLOSED
~~~

AUTH_PENDING 存在的意义是限制认证完成前允许发生的事情。

假设服务端没有状态约束：

~~~text
socket 已 OPEN
但 Token 还没验证
    ↓
客户端先发 subscribe / command
    ↓
业务逻辑提前执行
~~~

那么“认证”就只是形式存在。

首包认证至少需要四个约束：

1. 认证前只允许 authenticate 等少量初始化消息；
2. 设置认证超时，防止未认证连接永久占用资源；
3. 认证过程中禁止并发重复认证；
4. 认证成功后再绑定可信身份并开放业务消息。

一个最小服务端示例：

~~~ts
type State =
  | "AUTH_PENDING"
  | "AUTHENTICATING"
  | "AUTHENTICATED";

function accept(socket: WebSocket) {
  let state: State = "AUTH_PENDING";

  const timer = setTimeout(() => {
    if (state !== "AUTHENTICATED") {
      socket.close(4100, "authentication timeout");
    }
  }, 5000);

  socket.on("message", async raw => {
    const message = JSON.parse(String(raw));

    if (
      state === "AUTH_PENDING" &&
      message.type !== "authenticate"
    ) {
      socket.close(4100, "authenticate first");
      return;
    }

    if (message.type === "authenticate") {
      if (state !== "AUTH_PENDING") {
        socket.close(4100, "duplicate authentication");
        return;
      }

      state = "AUTHENTICATING";

      const principal =
        await verifyAccessToken(message.accessToken);

      clearTimeout(timer);
      bindPrincipal(socket, principal);

      state = "AUTHENTICATED";

      socket.send(JSON.stringify({
        type: "welcome"
      }));
    }
  });
}
~~~

这段代码的重点不在 API 写法，而在于：

~~~text
网络状态
和
业务认证状态
必须分开维护
~~~

---

### 【源码证据：协议升级、认证倒计时和身份绑定是三个阶段】

真实实现可以进一步验证上面的模型。

第一步只处理 Upgrade：

~~~ts
server.on("upgrade", (request, socket, head) => {
  const url = new URL(
    request.url ?? "/",
    "http://localhost"
  );

  const match =
    /^\/ws\/robots\/([a-zA-Z0-9_-]+)$/
      .exec(url.pathname);

  if (!match) {
    socket.destroy();
    return;
  }

  this.webSocketServer.handleUpgrade(
    request,
    socket,
    head,
    webSocket => {
      this.accept(webSocket, match[1]);
    }
  );
});
~~~

源码：
[robot-socket-hub.ts L70-L97](../QHZHC_Server/src/server/robot-socket-hub.ts#L70-L97)

这里没有 Access Token 校验，因此可以明确得出：

~~~text
handleUpgrade()
只完成协议升级
≠
用户认证成功
~~~

第二步，accept() 创建连接上下文并启动 5 秒认证超时：

~~~ts
authTimer: setTimeout(() => {
  if (!context.initialized) {
    socket.close(
      WS_CLOSE.PROTOCOL_ERROR,
      "authentication timeout"
    );
  }
}, 5_000)
~~~

源码：
[robot-socket-hub.ts L140-L180](../QHZHC_Server/src/server/robot-socket-hub.ts#L140-L180)

第三步才真正验证身份并绑定上下文：

~~~ts
principal =
  await this.auth.verifyAccessToken(
    message.accessToken
  );

// 异步鉴权期间可能已经关闭连接或撤销会话。
if (this.closed || context.socket.readyState !== WebSocket.OPEN) return;
this.auth.assertPrincipalActive(principal);
context.principal = principal;
this.scheduleAuthenticationExpiry(context);
if (!this.authenticationCurrent(context)) return;
context.maxPointsPerSecond =
  message.maxPointsPerSecond;

this.send(context, {
  type: "welcome",
  protocolVersion: PROTOCOL_VERSION,
  connectionId: context.id
});
~~~

源码：
[robot-socket-hub.ts：handleAuthenticate](../QHZHC_Server/src/server/robot-socket-hub.ts)

三段代码合起来才能支撑“OPEN 不等于业务可用”这个结论。

---

## 3. 身份认证、会话控制和资源授权是连续但不同的三层

完整身份系统仍然遵循：

~~~text
Authentication
证明你是谁
    ↓
Session Management
让身份跨时间持续成立
    ↓
Authorization
判断你能对什么资源做什么
~~~

Cookie、JWT、Refresh Token、RBAC 不是同一层概念。

### 【Authentication 的输出应该是可信 Principal】

Authentication（身份认证）不应该只返回 true / false，而应该形成服务端可信的 Principal（身份主体）。

例如：

~~~ts
interface Principal {
  userId: number;
  role: string;
  sessionId: string;
}
~~~

以 JWT 为例，验证过程通常包含：

~~~text
Access Token
    ↓
Signature
    ↓
Algorithm
    ↓
Issuer
    ↓
Audience
    ↓
Expiration
    ↓
Required Claims
    ↓
Server-side Session State
    ↓
Principal
~~~

只验证“签名正确”仍然不够。

例如没有 Audience（受众）校验时，一个原本签给 Service A 的 Token 可能被错误地拿给 Service B 使用。

---

### 【JWT 自包含不等于整个会话系统无状态】

RFC 7519 定义 JWT 的 Claim 和签名表示，但并没有规定“用了 JWT 就不能保存服务端状态”。[[3]](https://www.rfc-editor.org/rfc/rfc7519)

纯无状态验证：

~~~text
signature valid
+
exp not expired
    ↓
accept
~~~

会带来一个现实问题：

~~~text
用户已经 logout
    ↓
Access Token 还有 10 分钟过期
    ↓
只检查 JWT 本身仍会 accept
~~~

如果系统需要：

- 立即 logout；
- Refresh Token Rotation；
- Token Reuse Detection；
- 单会话撤销；

就需要额外的 Server-side Session State（服务端会话状态）。

---

### 【源码证据：JWT 验证后还要检查 Token Family】

当前 verifyAccessToken() 不只是验证 JWT：

~~~ts
const verified =
  await jwtVerify(accessToken, this.jwtKey, {
    algorithms: ["HS256"],
    issuer: ACCESS_TOKEN_ISSUER,
    audience: ACCESS_TOKEN_AUDIENCE
  });

const userId =
  Number(verified.payload.sub);

const familyId =
  verified.payload.sid;

const tokenId =
  verified.payload.jti;

const expiresAt =
  Number(verified.payload.exp) * 1000;

const familyExpiresAt =
  this.database.activeTokenFamilyExpiresAt(familyId);

if (familyExpiresAt === null) {
  throw new AuthError(
    "登录会话已撤销",
    401,
    "TOKEN_FAMILY_REVOKED"
  );
}
~~~

源码：
[auth.ts：verifyAccessToken](../QHZHC_Server/src/server/auth.ts)

校验返回的 Principal 同时携带 `accessTokenExpiresAt` 和 `familyExpiresAt`，单位都是毫秒。前者取自已验证 JWT 的 `exp × 1000`，后者取自数据库中有效 Token Family 的绝对过期时间。WebSocket 不保存原始 Access Token，也不会在心跳中再次验证 JWT。

因此更准确的结构是：

~~~text
Access JWT
负责表达短期身份
+
Token Family
负责表达服务端会话是否仍可信
~~~

而不是简单说“JWT 是无状态登录”。

---

### 【设计判断：当前 JWT 已经属于 Stateful Hybrid，而 Opaque Access Token 是可选演进】

当前 Access Token 虽然采用 JWT，但 `verifyAccessToken()` 并不是只做本地验签：

~~~text
JWT signature / iss / aud / exp
        ↓
sid = familyId
        ↓
isTokenFamilyActive(familyId)
        ↓
findUserById(userId)
        ↓
Principal
~~~

所以当前系统更准确地说是：

~~~text
Self-contained JWT
负责表达短期 Claims
        +
Server-side Session State
负责 Family revoke 和用户状态
~~~

这意味着 JWT “完全不查中心状态即可验证”的优势已经被部分放弃，但换来了立即撤销会话的控制力。

另一种可行方案是 Opaque Access Token（不透明访问令牌）：

~~~text
高熵随机 Access Token
        ↓
SHA-256 / Token Lookup
        ↓
Server-side Access Session
userId / familyId / role / expiresAt / revokedAt
~~~

对于当前这种中心化后台、强 Session Control 的单服务架构，Opaque Token 可以让“Access Token 只是 Session 索引”这一模型更统一；但它不是天然更安全或更高级。若未来出现多个 Resource Server 希望独立验证 Token、减少中心 Store 依赖，JWT 又会重新体现优势。

因此这属于后续架构选择，而不是当前必须修改的缺陷。更高优先级的问题是：不要为了判断 Access Token 自然到期而对每条长连接高频重复执行完整校验。

### 【Authorization 继续回答“能不能访问这个资源”】

一个合法 Principal 并不代表可以访问所有资源。

通用权限决策应继续引入：

~~~text
Principal
+
Resource
+
Action
+
Context
    ↓
Authorization Decision
    ↓
Allow / Deny
~~~

例如：

~~~ts
authorize({
  principal,
  resource: {
    type: "robot",
    id: robotId
  },
  action: "telemetry:subscribe"
});
~~~

所以：

~~~text
Token valid
只能说明：
“这是一个合法登录用户”

Authorization
继续判断：
“这个用户能不能订阅当前资源”
~~~

当前服务端已经检查 URL 中的 robotId 与认证消息中的 robotId 必须一致：

~~~ts
if (
  context.initialized ||
  message.robotId !== context.robotId
) {
  context.socket.close(
    WS_CLOSE.PROTOCOL_ERROR,
    "invalid authentication"
  );
  return;
}
~~~

源码：
[robot-socket-hub.ts L250-L260](../QHZHC_Server/src/server/robot-socket-hub.ts#L250-L260)

它解决的是：

> 一条连接不能在 URL 和认证消息中声明两个不同资源。

但它还不是完整的：

~~~text
Principal
是否真正有权访问该 robotId
~~~

如果进入多租户或多设备权限场景，还需要资源级 Authorization。

---

## 4. Access Token 和 Refresh Token 解决不同时间尺度的会话问题

WebSocket 可以保持很久，而 Access Token 通常应该保持较短生命周期，因此实时连接必须接入完整的 Session Lifecycle（会话生命周期）。

### 【双 Token 设计是在拆分暴露面和职责】

一种常见浏览器模型：

~~~text
登录
  ↓
Access Token
短期
JavaScript Memory
  ↓
HTTP API / WebSocket 高频使用

Refresh Token
长期
HttpOnly Cookie
  ↓
仅访问 refresh endpoint
~~~

这不是为了得到“绝对安全”，而是在做风险分层。

| 凭证 | 使用频率 | 生命周期 | 核心风险 |
| --- | --- | --- | --- |
| Access Token | 高频 | 短 | 泄漏后短时间可调用业务 API |
| Refresh Token | 低频 | 长 | 泄漏后可持续换新 Access Token |

因此 Refresh Token 通常需要额外保护：

- HttpOnly；
- Secure；
- SameSite；
- Cookie Path；
- Rotation；
- Reuse Detection；
- Server-side Revocation。

---

### 【Refresh Token Rotation 把长期凭证变成一次性凭证链】

Refresh Token Rotation（刷新令牌轮换）的核心不是“每次换字符串”，而是：

> 每个 Refresh Token 只能消费一次。

状态变化：

~~~text
Refresh A
    ↓ 第一次使用
A = consumed
    ↓
Refresh B

Refresh A
    ↓ 再次使用
Reuse Detected
    ↓
Token Family Revoked
~~~

为什么旧 Token 再出现时要撤销整个 Family？

因为服务端无法知道：

~~~text
合法客户端持有 B
攻击者持有 A

还是

攻击者已经持有 B
合法客户端错误地再次提交 A
~~~

所以一旦同一 Token Chain 出现重放，整条会话链都不再可信。

RFC 9700 将 Refresh Token Rotation 列为检测 Refresh Token Replay 的标准方法之一。[[4]](https://www.rfc-editor.org/rfc/rfc9700)

---

### 【Rotation 必须具备事务原子性】

假设 Rotation 被拆成：

~~~text
SELECT old token
    ↓
UPDATE old token consumed
    ↓
INSERT new token
~~~

两个并发请求可能同时在第一步读到：

~~~text
old token
consumed = false
~~~

如果数据库没有事务保护，两次请求都有机会继续向下执行。

因此正确实现需要把：

~~~text
检查旧 Token
+
标记旧 Token consumed
+
创建新 Token
~~~

放在同一个原子事务里。

真实实现：

~~~ts
this.database.exec("BEGIN IMMEDIATE");

const row = queryCurrentToken();

if (row.consumed_at !== null) {
  revokeWholeFamily(row.family_id);

  this.database.exec("COMMIT");

  return {
    kind: "reused",
    familyId: row.family_id
  };
}

markCurrentConsumed(
  currentHash,
  nextHash
);

insertNextToken({
  familyId: row.family_id,
  parentTokenHash: currentHash,
  expiresAt: row.expires_at
});

this.database.exec("COMMIT");
~~~

源码：
[database.ts L190-L263](../QHZHC_Server/src/server/database.ts#L190-L263)

这里还能观察到三个重要设计。

第一，数据库保存 Hash，而不是 Refresh Token 原文。

~~~text
Refresh Token
    ↓ SHA-256
token_hash
    ↓
Database
~~~

第二，新 Token 继承原 expires_at：

~~~text
Rotation
≠
重新获得完整 7 天寿命
~~~

因此属于 Absolute Expiration（绝对过期）。

第三，Reuse 发生时撤销整个 Family，而不是只拒绝当前 Token。

---

### 【源码证据：Token Family 由 refresh_tokens 中相同 family_id 的记录共同组成】

当前实现没有单独的 `token_families` 表，而是通过 `refresh_tokens.family_id` 把一次登录以后不断 Rotation 的 Refresh Token 组织成一个逻辑 Family。

当前表结构：

~~~sql
CREATE TABLE refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  parent_token_hash TEXT,
  replaced_by_hash TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  revoked_at INTEGER
);
~~~

源码：
[database.ts L80-L95](../QHZHC_Server/src/server/database.ts#L80-L95)

这些字段实际表达两类不同状态。

| 字段 | 当前项目中的语义 |
| --- | --- |
| `parent_token_hash` | 当前 Token 由哪一代 Token 轮换而来 |
| `replaced_by_hash` | 当前 Token 被哪一代 Token 替代 |
| `consumed_at` | 这枚 Token 是否已经正常完成过一次 Rotation |
| `revoked_at` | 系统是否已经主动终止对这枚 Token / Family 的信任 |
| `expires_at` | 当前 Family 的绝对过期边界 |

`consumed_at` 和 `revoked_at` 不能合并。

正常 Rotation：

~~~text
A
consumed_at = T1
revoked_at  = null
        ↓
B
consumed_at = null
revoked_at  = null
~~~

这里 A 并没有发生安全问题，只是已经正常消费过，不能再次用于 Refresh。

如果 A 之后再次出现：

~~~text
A.consumed_at != null
        +
A 再次被提交
        ↓
Reuse Detected
        ↓
整个 Family revoke
~~~

当前代码会执行：

~~~sql
UPDATE refresh_tokens
SET revoked_at = ?
WHERE family_id = ?
  AND revoked_at IS NULL
~~~

源码：
[database.ts L205-L225](../QHZHC_Server/src/server/database.ts#L205-L225)

Logout 也不是把当前 Token 标记 consumed，而是主动撤销整个 Family：

~~~text
POST /api/auth/logout
    ↓
JWT sid → familyId
    ↓
revokeTokenFamily(familyId)
    ↓
同 family_id 所有记录 revoked_at = now
~~~

源码：
[app.ts L220-L226](../QHZHC_Server/src/server/app.ts#L220-L226)

以及：
[database.ts L278-L286](../QHZHC_Server/src/server/database.ts#L278-L286)

因此两个字段分别记录：

~~~text
consumed_at
= Token 世代是否已经正常推进

revoked_at
= Session 信任是否被主动终止
~~~

这也是 Reuse Detection 能成立的关键：旧 Token 必须保留“正常消费过”的历史状态，不能在 Rotation 后直接删除。

当前 `isTokenFamilyActive()` 判断的是 Family 中是否还存在至少一条：

~~~text
consumed_at = null
AND
revoked_at = null
AND
expires_at > now
~~~

的 Refresh Token。

源码：
[database.ts L264-L276](../QHZHC_Server/src/server/database.ts#L264-L276)

### 【当前 Refresh Token 是 7 天 Absolute Expiration，而不是无限 Sliding Expiration】

配置默认值：

~~~text
ACCESS_TOKEN_TTL_MINUTES = 15
REFRESH_TOKEN_TTL_DAYS   = 7
~~~

源码：
[config.ts L34-L40](../QHZHC_Server/src/server/config.ts#L34-L40)

首次登录时生成：

~~~text
refreshTokenExpiresAt
=
loginTime + 7 days
~~~

Rotation 创建下一代 Refresh Token 时继续继承：

~~~ts
expiresAt: row.expires_at
~~~

而不是重新计算 `now + 7 days`。

因此：

~~~text
Login T0
  ↓
A expires = T0 + 7d
  ↓ Rotation
B expires = T0 + 7d
  ↓ Rotation
C expires = T0 + 7d
~~~

无论中间 Refresh 多少次，首次登录后的第 7 天都必须重新认证。这对普通 Human Session 是明确的安全边界，但对需要长期无人值守的数据大屏会带来可用性冲突。

这里不建议直接改成“每次 Refresh 都重新 +7 天”的纯 Sliding Expiration，因为只要持续活动，会话理论上可以无限延长。

更合理的演进有两种：

~~~text
普通用户会话
→ Sliding / Idle Window
+
更长但有限的 Absolute Maximum

真正 7×24 无人值守展示
→ 独立 Display / Kiosk Identity
+
只读 Scope
+
独立撤销策略
~~~

当前项目尚未实现这两种演进，因此答辩时应明确表述为设计建议，而不是当前能力。

当前被 revoke 的 Token Family 也不会立即物理删除；服务端每小时清理 `expires_at <= now` 的 Refresh Token：

~~~ts
const tokenCleanup = setInterval(() => {
  database.cleanupExpiredSessions();
  database.cleanupExpiredRefreshTokens();
}, 60 * 60 * 1000);
~~~

源码：
[index.ts L38-L42](../QHZHC_Server/src/server/index.ts#L38-L42)

所以当前生命周期是：

~~~text
Active
→ Consumed / Rotated
→ Reused or Logout → Revoked
→ Absolute Expiration
→ Periodic Physical Cleanup
~~~

### 【Single Flight 是 Rotation 正确性的一部分】

Rotation 会自然引入并发冲突。

假设同时出现：

~~~text
HTTP Request A → 401
HTTP Request B → 401
WebSocket → Access Token expired
~~~

如果三条路径都独立 refresh：

~~~text
第一次 Refresh A
→ 成功
→ A consumed
→ 返回 B

第二次 Refresh A
→ A 已 consumed
→ Reuse Detected
→ Family Revoked
~~~

合法客户端自己触发了“疑似 Token 被盗”。

所以需要 Single Flight（并发合并）：

~~~ts
let refreshPromise:
  Promise<string> | null = null;

function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise =
      requestRefresh()
        .then(result => {
          accessToken =
            result.accessToken;

          return accessToken;
        })
        .finally(() => {
          refreshPromise = null;
        });
  }

  return refreshPromise;
}
~~~

这不是简单性能优化，而是为了确保同一 Refresh Token 不会因为本地并发被重复消费。

---

### 【源码证据：HTTP 与 WebSocket 共用同一个 refreshPromise】

当前 Token Manager：

~~~ts
let accessToken:
  string | null = null;

let refreshPromise:
  Promise<string> | null = null;

refreshAccessToken: () => {
  if (!refreshPromise) {
    refreshPromise =
      refreshRequest()
        .then(response => {
          accessToken =
            response.accessToken;

          return response.accessToken;
        })
        .finally(() => {
          refreshPromise = null;
        });
  }

  return refreshPromise;
}
~~~

源码：
[accessToken.ts L15-L46](../QHZHC_Web/src/services/accessToken.ts#L15-L46)

HTTP 401 处理器调用同一个 Manager：

~~~ts
const accessToken =
  await manager.refreshAccessToken();

const retryConfig =
  applyAccessToken(
    {
      ...config,
      _authRetry: true
    },
    accessToken
  );

return client.request(retryConfig);
~~~

源码：
[httpAuth.ts L50-L88](../QHZHC_Web/src/services/httpAuth.ts#L50-L88)

因此同一 Tab 中：

~~~text
多个 HTTP 401
+
WebSocket 认证过期
    ↓
同一个 refreshPromise
    ↓
一次真实 Refresh 请求
~~~

当前边界也很明确：不同 Tab 有不同 JavaScript Heap，因此单 Tab Single Flight 不会自动扩展到跨 Tab。

跨 Tab 需要再引入 Web Locks 等协调手段。

---

### 【当前实现：周期重验由服务端主动执行，不是客户端定期重新认证】

当前客户端只在 WebSocket `open` 后发送一次 `authenticate`：

~~~text
10:00
Access Token 有效
→ 建连成功

10:15
Access Token 过期

14:00
socket 仍然在传业务数据
~~~

这意味着连接寿命超过了身份凭证寿命。

常见策略：

| 策略 | 优点 | 局限 |
| --- | --- | --- |
| 只在建连验证 | 简单 | 无法及时处理过期和 revoke |
| 每条消息验证 | 最及时 | 成本高 |
| 到 exp 定时关闭 | 处理自然过期准确 | 不覆盖提前 revoke |
| 周期重验 | 成本与及时性折中 | 存在检测窗口 |
| revoke 主动关闭 | 最及时 | 要维护 Session → Connections |

当前服务端采用周期重验：

~~~ts
if (
  context.initialized &&
  context.accessToken
) {
  try {
    context.principal =
      await this.auth
        .verifyAccessToken(
          context.accessToken
        );
  } catch {
    context.socket.close(
      WS_CLOSE.AUTHENTICATION_EXPIRED,
      "access token expired"
    );

    continue;
  }
}
~~~

源码：
[robot-socket-hub.ts L416-L447](../QHZHC_Server/src/server/robot-socket-hub.ts#L416-L447)

这段代码真正把：

~~~text
Session Lifecycle
和
WebSocket Lifecycle
~~~

连接起来了。

---

## 5. 心跳不是一个开关，而是三层不同的存活判断

很多实现增加一个 ping 就称为“已经做了心跳”，但不同心跳回答的是不同问题。

### 【协议 Ping/Pong 检查 WebSocket Endpoint】

RFC 6455 定义了 Ping / Pong Control Frame。Node 的 ws 等服务端库通常可以主动发送协议 Ping：

~~~ts
socket.ping();
~~~

客户端 WebSocket Stack 返回 Pong。

它主要回答：

> 底层 WebSocket Endpoint 是否还能够响应？

当前服务端实现：

~~~ts
context.protocolAlive = false;
context.socket.ping();

socket.on("pong", () => {
  context.protocolAlive = true;
  context.lastSeenAt = Date.now();
});
~~~

源码：
[robot-socket-hub.ts L168-L188](../QHZHC_Server/src/server/robot-socket-hub.ts#L168-L188)

以及：
[robot-socket-hub.ts L431-L447](../QHZHC_Server/src/server/robot-socket-hub.ts#L431-L447)

---

### 【应用层 ping/pong 检查消息处理链】

浏览器 JavaScript WebSocket API 没有暴露主动发送协议 Ping Control Frame 的方法，所以前端常设计普通业务消息：

~~~ts
socket.send(
  JSON.stringify({
    type: "ping",
    nonce: crypto.randomUUID(),
    sentAt: Date.now()
  })
);
~~~

服务端：

~~~ts
case "ping":
  send({
    type: "pong",
    nonce: message.nonce,
    serverTime: Date.now()
  });
~~~

它检查的是：

~~~text
JavaScript
→ WebSocket send
→ 网络
→ 服务端消息路由
→ 业务回包
→ 浏览器 message event
~~~

比底层 Ping/Pong 多覆盖了一层应用协议。

---

### 【Data Watchdog 检查业务流有没有继续推进】

还有一种更加隐蔽的问题：

~~~text
协议 Ping/Pong 正常
应用 ping/pong 正常
    ↓
业务 telemetry 一直没有新数据
~~~

这时连接没有死，真正异常的可能是：

- 数据采集停止；
- 流处理停止；
- Publisher 卡住；
- 订阅状态异常。

所以实时数据系统还要单独检查：

> 业务数据进度是否持续推进？

当前客户端保存 lastBucketSeenAt，并检测自然秒数据：

~~~ts
if (
  Date.now() -
    this.lastBucketSeenAt >=
      BUCKET_TIMEOUT_MS
) {
  this.frameQueue.pause();

  this.socket.close(
    REALTIME_CLOSE_CODE
      .HEARTBEAT_TIMEOUT,
    "telemetry bucket timeout"
  );
}
~~~

源码：
[realtimeClient.ts L550-L585](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L550-L585)

因此可以得到三层模型：

~~~text
Protocol Ping/Pong
→ WebSocket endpoint alive?

Application ping/pong
→ application message loop alive?

Data Watchdog
→ business stream progressing?
~~~

这三层不能互相替代。

---

## 6. 重连之前必须先分类故障

演示代码常写：

~~~ts
socket.onclose = () => {
  setTimeout(connect, 1000);
};
~~~

它的问题是默认：

> 所有关闭都可以通过再连一次恢复。

实际上不同故障需要完全不同的动作。

### 【Close Code 应该驱动 Recovery Policy】

可以把关闭原因抽象成：

~~~text
Close
  ↓
Transport Failure
  → reconnect

Authentication Expired
  → refresh token
  → reconnect

Forbidden / Protocol Error
  → stop
~~~

为什么权限错误不能无限重连？

~~~text
无权限
→ reconnect
→ 仍然无权限
→ reconnect
→ 仍然无权限
~~~

这不是恢复，而是制造请求风暴。

最小策略代码：

~~~ts
function resolveRecoveryAction(
  closeCode: number
) {
  if (closeCode === 4001) {
    return "refresh-token";
  }

  if (
    closeCode === 4003 ||
    closeCode === 4100
  ) {
    return "stop";
  }

  return "reconnect";
}
~~~

当前实现把这一策略独立成纯函数：

~~~ts
export function
resolveRealtimeRecoveryAction(
  closeCode: number
): RealtimeRecoveryAction {
  if (
    closeCode ===
    REALTIME_CLOSE_CODE
      .AUTHENTICATION_EXPIRED
  ) {
    return "refresh-token";
  }

  if (
    closeCode ===
      REALTIME_CLOSE_CODE.FORBIDDEN ||
    closeCode ===
      REALTIME_CLOSE_CODE.PROTOCOL_ERROR
  ) {
    return "stop";
  }

  return "reconnect";
}
~~~

源码：
[realtimeConnectionPolicy.ts L13-L33](../QHZHC_Web/src/views/DataVisualization/services/realtimeConnectionPolicy.ts#L13-L33)

把 Policy 和 WebSocket API 分开，也使 Close Code → Action 可以独立单测。

---

### 【Access Token 过期时要先恢复会话，再恢复连接】

错误做法：

~~~text
4001
→ reconnect
→ 使用旧 Access Token
→ authenticate failed
→ 4001
→ reconnect
→ ...
~~~

正确链路：

~~~text
4001
    ↓
Refresh Token
    ↓
New Access Token
    ↓
Reconnect
    ↓
Authenticate
    ↓
Replay
    ↓
Live
~~~

当前 handleClose()：

~~~ts
case "refresh-token": {
  this.options
    .onStatus("auth-recovering");

  try {
    await this
      .refreshAccessToken();

    if (!this.stopped) {
      this.attempt = 0;
      this.connect();
    }
  } catch {
    this.stopped = true;

    await this
      .onAuthenticationFailure();
  }

  return;
}
~~~

源码：
[realtimeClient.ts L497-L545](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L497-L545)

这里的重要点不是 try/catch，而是恢复顺序：

~~~text
Session Recovery
必须发生在
Connection Recovery 之前
~~~

---

### 【Exponential Backoff 和 Jitter 解决两个不同问题】

如果服务重启导致大量客户端同时断开，而大家都固定 1 秒后 reconnect：

~~~text
10,000 clients close
    ↓
1 second
    ↓
10,000 reconnect
    ↓
TLS / Auth / Replay burst
    ↓
server overloaded again
~~~

Exponential Backoff（指数退避）：

~~~text
delay =
base × 2^attempt
~~~

控制单个客户端的重试速度。

但如果客户端 attempt 相同，它们仍可能同步醒来，所以还要加入 Jitter（随机抖动）：

~~~text
ceiling =
min(
  maxDelay,
  base × 2^attempt
)

delay =
random(
  0,
  ceiling
)
~~~

真实代码：

~~~ts
const ceiling =
  Math.min(
    15_000,
    500 * 2 **
      Math.min(
        this.attempt,
        6
      )
  );

const delay =
  Math.max(
    250,
    Math.round(
      ceiling *
      this.random()
    )
  );
~~~

源码：
[realtimeClient.ts L587-L616](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L587-L616)

同时还需要生命周期条件：

~~~text
navigator offline
→ 不重连

document hidden
→ 不重连

已有 reconnectTimer
→ 不重复创建
~~~

所以重连策略实际上由四部分构成：

~~~text
Failure Classification
+
Backoff
+
Jitter
+
Lifecycle Gating
~~~

---

## 7. 重新连接成功以后还要恢复数据进度

Connection Recovery（连接恢复）只恢复 Transport，不能自动恢复断线期间的业务数据。

### 【Recovery Cursor 把业务进度带到下一条连接】

Recovery Cursor（恢复游标）表示：

> 客户端已经可靠推进到什么位置。

常见 Cursor：

| 类型 | 优点 | 局限 |
| --- | --- | --- |
| sequence / offset | 单调、Gap 判断最清楚 | 服务端要维护稳定序列 |
| eventId | 事件级唯一 | 需要索引 |
| timestamp | 直观 | 同时刻多事件、时钟问题 |
| time bucket | 与时间聚合自然结合 | 粒度较粗 |

标准恢复链：

~~~text
旧连接最后进度 N
    ↓
disconnect
    ↓
new connection
    ↓
authenticate(cursor = N + 1)
    ↓
server replay
N + 1 ... latest
    ↓
replay_complete
    ↓
live
~~~

当前协议把 Cursor 放进 authenticate：

~~~ts
{
  type: "authenticate",
  accessToken,
  protocolVersion,
  robotId,
  resumeFromBucketStartMs,
  maxPointsPerSecond
}
~~~

协议：
[protocol.ts L8-L24](../QHZHC_Server/src/shared/protocol.ts#L8-L24)

客户端发送：

~~~ts
socket.send(
  JSON.stringify({
    type: "authenticate",
    accessToken,
    protocolVersion:
      PROTOCOL_VERSION,
    robotId: ROBOT_ID,
    resumeFromBucketStartMs:
      this.latestBatchStartMs +
      SECOND_MS,
    maxPointsPerSecond:
      this.maxPointsPerSecond
  })
);
~~~

源码：
[realtimeClient.ts L330-L366](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L330-L366)

这说明恢复进度存放在连接之外，因此能够跨 socket 延续。

---

### 【Replay 和 Live 最好形成两个明确阶段】

如果服务端同时发送补发和实时流：

~~~text
10:05 replay
10:08 live
10:06 replay
10:09 live
10:07 replay
~~~

客户端会额外承担：

- 排序；
- 缓冲；
- 去重；
- Cursor 重新计算。

更清晰的协议：

~~~text
AUTHENTICATED
    ↓
REPLAYING
    ↓
historical messages
    ↓
replay_complete
    ↓
LIVE
~~~

当前服务端在 Replay 时：

~~~ts
context.replaying = true;
~~~

而普通 publish 会跳过：

~~~ts
if (
  !context.initialized ||
  context.replaying
) {
  continue;
}
~~~

补发结束：

~~~ts
this.send(
  context,
  {
    type: "replay_complete",
    throughBucketStartMs
  }
);

context.replaying = false;
~~~

源码：
[robot-socket-hub.ts L98-L125](../QHZHC_Server/src/server/robot-socket-hub.ts#L98-L125)

以及：
[robot-socket-hub.ts L292-L343](../QHZHC_Server/src/server/robot-socket-hub.ts#L292-L343)

这个状态边界比“收到以后客户端自己排序”更容易证明正确。

---

### 【No-data 和 Retention Gap 必须具有不同语义】

某个时间窗口为空可能有两个原因。

第一种：

~~~text
这个自然秒本来没有采样
→ no-data
~~~

第二种：

~~~text
这个时间原本可能有数据
但已超过服务端 retention
→ gap
~~~

如果都表示成：

~~~json
{
  "points": []
}
~~~

客户端就无法知道历史是否完整。

所以 Gap 通常至少要携带：

~~~text
requested cursor
earliest available
latest
recommended action
~~~

当前协议定义：

~~~ts
{
  type: "gap",
  requestedFromBucketStartMs,
  earliestAvailableBucketStartMs,
  latestBucketStartMs,
  action: "skip-to-latest"
}
~~~

协议：
[protocol.ts L44-L65](../QHZHC_Server/src/shared/protocol.ts#L44-L65)

服务端当前会读取 earliest：

~~~ts
const earliest =
  this.stream
    .earliestTelemetryBucketStartMs(
      context.robotId
    );

if (
  bucketCount >
  MAX_REPLAY_BUCKETS
) {
  this.sendGap(
    context,
    fromBucketStartMs,
    earliest,
    throughBucketStartMs
  );

  return;
}
~~~

源码：
[robot-socket-hub.ts L303-L316](../QHZHC_Server/src/server/robot-socket-hub.ts#L303-L316)

这里也暴露出当前实现边界：

~~~text
requestedFrom
<
earliestAvailable
~~~

目前没有被单独作为 Gap 条件处理。

因此更完整的判断应该是：

~~~text
requestedFrom <
earliestAvailable
    ↓
unrecoverable gap
~~~

否则 retention 删除的数据可能被误解释成真正的 no-data。

---

## 8. WebSocket 基于 TCP 仍然不等于应用层 Exactly-once

常见误区：

> WebSocket 基于 TCP，TCP 有序可靠，所以业务消息不会丢。

这个结论只覆盖单条存活 TCP 连接中的字节流传输。

它无法回答：

~~~text
server.send()
客户端是否已经收到？

message event
业务是否已经处理？

业务处理成功
服务端是否已经知道？

断线发生时
客户端到底推进到了哪一步？
~~~

### 【ACK 的本质是定义“哪一步才算完成”】

Application ACK（应用层确认）可以放在不同阶段：

| ACK 时机 | 表达的语义 |
| --- | --- |
| 收到 message event | 浏览器已经接收 |
| 进入本地可靠队列 | 已进入消费范围 |
| 业务处理完成 | 应用逻辑已完成 |
| 持久化完成 | 状态已经落盘 |

最小例子：

~~~ts
// server
send({
  type: "event",
  sequence: 1042,
  payload
});

// client
await process(payload);

send({
  type: "ack",
  sequence: 1042
});
~~~

服务端收到 ACK 后才能把“客户端已确认进度”推进到 1042。

但是 ACK 本身仍然不等于 Exactly-once。

例如：

~~~text
客户端处理成功
    ↓
发送 ACK
    ↓
ACK 丢失
    ↓
服务端重发
~~~

客户端仍可能第二次处理 sequence 1042。

因此更强投递语义通常需要：

~~~text
ACK
+
Retry
+
Idempotency / Dedupe
+
Durable Progress
~~~

---

### 【源码证据：当前 Cursor 代表接收进度，不代表渲染完成】

当前客户端收到 telemetry_second 后先推进：

~~~ts
this.latestBatchStartMs =
  message.bucketStartMs;
~~~

之后才把数据加入帧队列：

~~~ts
this.frameQueue
  .enqueue(message.points);
~~~

源码：
[realtimeClient.ts L402-L470](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts#L402-L470)

因此 Cursor 更接近：

> 浏览器已经接收到这个自然秒。

而不是：

> 这个自然秒已经完成渲染，并由服务端确认。

当前协议也没有 Application ACK。

所以能力边界应该准确描述为：

> **基于接收进度的断线续传和 Replay。**

对于实时可视化这是合理取舍；对于交易、计费、审计等不可丢业务，则需要更严格的 ACK、幂等和持久化设计。

---

## 9. WebSocket 安全不是 Token 校验完成以后就结束

认证成功只是证明“谁在发送”，并不能证明“发送内容安全”。

完整入站安全链可以理解为：

~~~text
Upgrade
    ↓
Origin
    ↓
Connection Limit
    ↓
Authentication
    ↓
Payload Size
    ↓
Parse
    ↓
Schema
    ↓
Protocol State
    ↓
Authorization
    ↓
Rate Limit
    ↓
Business Handler
~~~

每层职责不同。

### 【HTTP CORS 不能替代 WebSocket Origin Validation】

普通 Express HTTP 请求通常是：

~~~text
Request
→ Express Middleware
→ CORS
→ Route
~~~

WebSocket 常见 Node 实现却是：

~~~text
HTTP Server
→ upgrade event
→ handleUpgrade()
~~~

如果 Upgrade 没有经过 Express Middleware，HTTP CORS 就不会自动成为 WebSocket Origin 校验。

OWASP WebSocket Security Cheat Sheet 建议对握手执行显式 Origin Allowlist。[[5]](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

当前 Upgrade 实现直接监听：

~~~ts
server.on(
  "upgrade",
  (request, socket, head) => {
    ...
  }
);
~~~

源码：
[robot-socket-hub.ts L70-L97](../QHZHC_Server/src/server/robot-socket-hub.ts#L70-L97)

生产环境可以在 handleUpgrade 前增加：

~~~ts
const allowedOrigins =
  new Set([
    "https://app.example.com"
  ]);

const origin =
  request.headers.origin;

if (
  !origin ||
  !allowedOrigins.has(origin)
) {
  socket.destroy();
  return;
}
~~~

尤其是使用 Cookie 自动认证 WebSocket 时，这一层对防 Cross-Site WebSocket Hijacking（跨站 WebSocket 劫持，CSWSH）非常重要。

---

### 【认证以后仍然需要 Schema、State、Authorization 和 Rate Limit】

一个已经认证的合法用户仍然可以发送恶意输入：

~~~json
{
  "type": "resend_time_range",
  "fromBucketStartMs": -999999999999
}
~~~

或者持续发送大量结构完全合法的消息。

所以：

~~~text
Authentication
回答谁发送

Schema
回答消息长什么样

State
回答当前阶段能不能发

Authorization
回答能不能做这个动作

Rate Limit
回答允许做多少次
~~~

当前协议已经通过 isClientMessage() 检查消息结构和版本：

~~~ts
case "authenticate":
  return (
    typeof candidate.accessToken
      === "string" &&
    candidate.accessToken.length
      > 0 &&
    candidate.protocolVersion
      === PROTOCOL_VERSION &&
    typeof candidate.robotId
      === "string" &&
    isNaturalSecond(
      candidate
        .resumeFromBucketStartMs
    )
  );
~~~

源码：
[protocol.ts L58-L90](../QHZHC_Server/src/shared/protocol.ts#L58-L90)

仍可以继续补齐：

- Upgrade Origin allowlist；
- maxPayload；
- 单 IP / 用户连接上限；
- 单连接消息 Rate Limit；
- 资源级 Authorization。

这些不能因为“已经有 Token 校验”就省略。

---

## 10. 可观测性和故障测试决定恢复能力能不能被证明

代码里存在 reconnect 函数并不能证明系统具备可恢复性。

真正需要回答：

~~~text
为什么断？
多久恢复？
恢复到哪个状态？
补发多少数据？
有没有无法恢复的 Gap？
~~~

### 【指标应该围绕状态机设计】

| 阶段 | 可以记录的指标 |
| --- | --- |
| Upgrade | connection attempt / failure |
| Authentication | auth latency / failure reason |
| Online | active connections / heartbeat RTT |
| Session | refresh success / family revoke / reuse |
| Reconnect | attempt / backoff / reconnect success |
| Replay | bucket count / replay duration |
| Integrity | gap count / unrecoverable gap |
| End-to-end | close → live duration |

如果已经有浏览器监控 SDK，可以直接把状态迁移变成自定义事件：

~~~ts
monitor.track(
  "websocket.close",
  {
    code,
    attempt
  }
);

monitor.track(
  "websocket.reconnect",
  {
    delay,
    reason
  }
);

monitor.track(
  "websocket.replay.complete",
  {
    from,
    through,
    duration
  }
);
~~~

这样才能把：

~~~text
“我们做了自动恢复”
~~~

转成：

~~~text
“P95 多久恢复到 Live”
“不可恢复 Gap 占比多少”
~~~

---

### 【测试应该覆盖状态迁移，而不是只覆盖函数调用】

完整测试树可以按状态组织：

~~~text
Authentication
├─ missing token
├─ invalid token
├─ expired token
├─ revoked family
└─ refresh reuse

Protocol
├─ message before auth
├─ auth timeout
├─ duplicate auth
├─ invalid schema
└─ version mismatch

Connection
├─ network failure
├─ service restart
├─ heartbeat timeout
├─ access token expires online
└─ refresh failure

Recovery
├─ cursor reconnect
├─ replay
├─ duplicate
├─ no-data
├─ gap
└─ retention exceeded
~~~

当前仓库已有测试作为实现证据：

- [auth-tokens.test.ts](../QHZHC_Server/tests/auth-tokens.test.ts)：Refresh Rotation、Reuse、Revoke；
- [websocket.test.ts](../QHZHC_Server/tests/websocket.test.ts)：首包认证、无效 Token、Replay；
- [realtimeClient.spec.js](../QHZHC_Web/tests/unit/realtimeClient.spec.js)：Refresh、相同 Cursor 重连、Gap、No-data、恢复失败；
- [realtimeConnectionPolicy.spec.js](../QHZHC_Web/tests/unit/realtimeConnectionPolicy.spec.js)：Close Code 到 Recovery Action。

还值得继续补：

~~~text
Origin Reject
Authentication Timeout
Cross-tab Refresh Race
Retention Gap
Rate Limit
Max Payload
Session Revoke → Active Socket Close
~~~

---

## 11. 整套机制最终可以收束成两个状态机和一条数据进度线

前面的 Token、心跳、Close Code、Replay 并不是平铺关系。

更容易长期记忆的是下面三部分。

### 【会话状态机】

~~~text
LOGIN
  ↓
ACCESS_VALID
  ↓
ACCESS_EXPIRED
  ↓
REFRESHING
  ├─ success → ACCESS_VALID
  └─ fail    → LOGGED_OUT
~~~

它负责回答：

> 当前身份是否还能继续使用？

### 【实时连接状态机】

~~~text
IDLE
  ↓
CONNECTING
  ↓
AUTH_PENDING
  ↓
REPLAYING
  ↓
LIVE
  ├─ auth expired
  │    → AUTH_RECOVERING
  │
  ├─ network failure
  │    → RECONNECT_WAIT
  │
  └─ fatal
       → STOPPED
~~~

它负责回答：

> 当前 socket 处于什么阶段，下一步允许发生什么？

### 【数据进度线】

~~~text
cursor N
  ↓ disconnect
resume N + 1
  ↓
replay
  ↓
latest
  ↓
live
~~~

它负责回答：

> 新连接建立以后，从哪里继续？

三者真正连接起来的过程是：

~~~text
WebSocket
发现 Access Token 失效
        ↓
会话状态机
Refresh
        ↓
New Access Token
        ↓
连接状态机
Reconnect + Authenticate
        ↓
数据进度线
Replay from Cursor
        ↓
LIVE
~~~

因此一个完整的面试回答可以是：

> WebSocket 本身只提供长连接。我会把生产级实时链路拆成会话状态、连接状态和数据进度三部分：会话负责 Access / Refresh Token 的续期和撤销；连接负责应用层认证、心跳、故障分类和受控重连；数据进度通过 Cursor、Replay 和 Gap 跨连接延续。这样 Token 过期、网络中断和数据缺口分别有独立的处理机制，同时又能串成一条完整恢复链。

---

## 12. 参考资料

1. [[1] RFC 6455 — The WebSocket Protocol, RFC Editor](https://www.rfc-editor.org/rfc/rfc6455)
2. [[2] MDN — WebSocket() constructor](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket)
3. [[3] RFC 7519 — JSON Web Token (JWT), RFC Editor](https://www.rfc-editor.org/rfc/rfc7519)
4. [[4] RFC 9700 — Best Current Practice for OAuth 2.0 Security, RFC Editor](https://www.rfc-editor.org/rfc/rfc9700)
5. [[5] OWASP — WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

### 【Full-Stack-AI-NOTES 相关知识入口】

- [WebSocket 完整知识体系](https://github.com/cxDlogver/cx-learn-notes/blob/main/Full-Stack-AI-NOTES/WebSocket完整知识体系.md)：WebSocket 协议、API、应用协议、状态机、鉴权接入、心跳、故障恢复、可靠性、背压、扩容、安全与测试的通用主入口。
- Web身份认证会话控制与访问控制体系.md：Authentication → Session Management → Authorization。
- Access Token与Refresh Token核心知识点笔记.md：双 Token、Rotation、Reuse Detection 和过期策略。
- 反向代理与Web入口体系.md：HTTP / WebSocket 生产入口、TLS、Proxy 和网络边界。

### 【源码验证入口】

- [WebSocket Hub](../QHZHC_Server/src/server/robot-socket-hub.ts)
- [认证服务](../QHZHC_Server/src/server/auth.ts)
- [Refresh Token 数据库事务](../QHZHC_Server/src/server/database.ts)
- [共享协议](../QHZHC_Server/src/shared/protocol.ts)
- [Access Token Manager](../QHZHC_Web/src/services/accessToken.ts)
- [HTTP 鉴权恢复](../QHZHC_Web/src/services/httpAuth.ts)
- [实时客户端](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts)
- [连接恢复策略](../QHZHC_Web/src/views/DataVisualization/services/realtimeConnectionPolicy.ts)
