# 02 WebSocket 鉴权与可恢复实时连接

> 本文围绕一个核心问题展开：**实时系统如何让一条 WebSocket 连接既可信、稳定，又能在网络异常和凭证失效后恢复到正确的数据进度。**
>
> 通用知识以 RFC、MDN、OWASP 和 Full-Stack-AI-NOTES 的认证体系为基础；QHZHC 作为工程实践贯穿各知识点，用来说明方案如何落地、有哪些取舍和边界。项目事实以当前活动源码和测试为准，docs/history 只作为历史线索。

## 1. 总目录与全栈地图

本章先把 WebSocket + 鉴权放回完整全栈链路中，再沿“建立连接 → 建立信任 → 保持会话 → 检测故障 → 恢复连接 → 恢复数据”逐层展开。

### 【WebSocket + 鉴权解决的是可信实时会话，而不只是长连接】

**P｜结论**

WebSocket 只提供持久双向通信能力；生产级实时系统还必须补上身份认证、资源授权、会话续期、存活探测、故障分类和数据恢复，才能形成真正可用的实时会话。

~~~text
浏览器
  │
  │ ① HTTP 登录
  ▼
HTTP API
  │
  │ ② 签发 Access Token + Refresh Token
  ▼
浏览器会话
  │
  │ ③ WebSocket Upgrade
  ▼
WebSocket Transport
  │
  │ ④ 应用层 Authenticate
  ▼
可信连接
  │
  │ ⑤ Heartbeat + Session Revalidation
  ▼
持续可用连接
  │
  │ ⑥ Close Code / Network Failure
  ▼
恢复决策
  │
  ├─ Refresh Token → 新 Access Token
  │
  └─ Backoff + Reconnect
        │
        │ ⑦ Recovery Cursor
        ▼
      Replay
        │
        │ ⑧ Replay Complete
        ▼
       Live
~~~

这张图中的八个环节分别解决不同问题：

1. **HTTP 登录**只负责第一次证明用户身份。
2. **Access / Refresh Token**把一次登录扩展成持续会话。
3. **WebSocket Upgrade**只把 HTTP 连接升级为 WebSocket 协议。
4. **应用层认证**把网络连接变成可信业务连接。
5. **心跳和会话重验**检查“连接是否活着”和“身份是否仍然有效”。
6. **关闭码和故障分类**决定下一步是重连、刷新凭证还是停止。
7. **恢复游标**告诉新连接应该从哪里继续。
8. **Replay → Live 切换**负责补齐可恢复数据，再回到实时流。

**R｜为什么要这样分层**

三个状态很容易被误认为一回事：

~~~text
WebSocket OPEN
≠ 已完成业务认证

重新连接成功
≠ 登录会话已经恢复

登录会话恢复
≠ 断线期间的数据已经补齐
~~~

如果不拆层，代码通常会演化成“onopen 就推数据、onclose 就重连”，遇到 Token 过期、权限撤销或数据缺口时就无法判断应该采取什么动作。

**E｜QHZHC 实践**

QHZHC 当前正好覆盖了这条链的大部分环节：

- HTTP 登录和刷新：QHZHC_Server/src/server/app.ts
- Access JWT 与 Token Family：QHZHC_Server/src/server/auth.ts
- Refresh Rotation：QHZHC_Server/src/server/database.ts
- WebSocket 握手、认证、心跳与补发：QHZHC_Server/src/server/robot-socket-hub.ts
- 消息协议：QHZHC_Server/src/shared/protocol.ts
- Access Token 内存管理：QHZHC_Web/src/services/accessToken.ts
- HTTP 401 恢复：QHZHC_Web/src/services/httpAuth.ts
- WebSocket 客户端恢复：QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts

**P｜面试 / 答辩**

30 秒回答可以概括为：

> WebSocket 只解决实时双向传输，我会再把它分成可信连接、会话持续、连接保活和数据恢复四层。连接建立后先认证并绑定资源；运行中通过心跳和 Token 重验维持有效性；断开时按关闭原因决定刷新凭证还是退避重连；重新认证后再从恢复游标补发缺失数据。这样才能把“连得上”升级成“安全、稳定、可恢复”。

常见追问：WebSocket OPEN 为什么不等于业务可用？连接恢复为什么不等于数据恢复？

---

## 2. 协议连接通过认证与授权升级为可信业务连接

本章逻辑主线是：**HTTP Upgrade 只建立传输通道，应用层还要完成 Authentication → Authorization → Connection Binding，才能进入业务状态。**

### 【HTTP Upgrade 与应用层认证是两个不同握手】

**P｜结论**

HTTP Upgrade 解决“能不能切换到 WebSocket 协议”，应用层认证解决“这条连接代表谁、能不能进入业务状态”；两者不能合并理解。RFC 6455 定义了 WebSocket Opening Handshake，但没有替业务应用定义用户登录机制。[[1]](https://www.rfc-editor.org/rfc/rfc6455)

**R｜原理、使用方式与取舍**

建立浏览器 WebSocket 时，底层首先发生：

~~~text
HTTP Request
  │
  ├─ Upgrade: websocket
  ├─ Connection: Upgrade
  └─ Sec-WebSocket-Key ...
        ↓
Server accepts
        ↓
101 Switching Protocols
        ↓
WebSocket Frame Protocol
~~~

逐步理解：

1. 浏览器先发普通 HTTP Upgrade 请求。
2. 服务端确认协议参数后返回 101。
3. 从此不再使用普通 HTTP 请求—响应模型，而使用 WebSocket Frame。
4. 此时只证明“协议通道建立成功”，并没有证明用户身份。
5. 应用还需要在 Upgrade 阶段或 Upgrade 之后完成认证。

主流认证时机有两类：

| 方案 | 认证位置 | 优点 | 代价 |
| --- | --- | --- | --- |
| Upgrade 阶段认证 | HTTP Upgrade 前 | 未授权连接不进入 WebSocket 层 | 浏览器凭证携带方式受限制 |
| 首条业务消息认证 | WebSocket OPEN 后 | 协议灵活，Token 不必进入 URL | 未认证连接已经占用 socket，需要超时和限额 |

**E｜QHZHC 实践**

QHZHC 采用第二种：

~~~text
HTTP Upgrade
    ↓
socket 已建立
    ↓
5 秒认证窗口
    ↓
第一条消息必须是 authenticate
    ↓
验证 Access Token
    ↓
welcome
    ↓
业务流
~~~

服务端对应文件：

- QHZHC_Server/src/server/robot-socket-hub.ts

当前实现中，认证前收到 ping 或补发请求会按协议错误关闭；认证过程中再次 authenticate 也会拒绝。

**项目现状**：首条消息认证。

**主流方案**：Upgrade Cookie / Query 临时票据 / 首条消息认证都存在，取决于客户端能力和安全边界。

**理想演进**：继续保留首条消息认证，同时在 Upgrade 前增加 Origin、连接速率和未认证连接数量保护。

**P｜面试 / 答辩**

> WebSocket 的 101 只表示协议升级完成，不代表用户已经登录。我在业务协议中再设计 AUTH_PENDING → AUTHENTICATED 状态，认证成功后才允许订阅和业务消息。

常见坑：把 onopen 当作“业务已连接”；认证超时缺失；认证前仍处理业务消息。

---

### 【Authentication、Authorization 与 Connection Binding 分别回答三个问题】

**P｜结论**

Authentication（身份认证）回答“你是谁”，Authorization（授权）回答“你能访问什么”，Connection Binding（连接上下文绑定）负责把已经验证的身份和订阅关系固定到这条连接上。

**R｜原理、使用方式与取舍**

三层关系是：

~~~text
Authentication
验证凭证
得到 Principal
    ↓
Authorization
Principal + Resource + Action
做权限决策
    ↓
Connection Binding
把已经通过验证的上下文绑定到 socket
~~~

逐步解释：

1. 认证阶段验证 Token 的签名、有效期和会话状态。
2. 得到服务端可信的 Principal（身份主体）。
3. 授权阶段根据 Principal 判断是否允许访问具体设备、房间、Topic 或 Tenant。
4. 通过后把 userId、role、subscription、tenantId 等写入连接上下文。
5. 后续消息不能重新相信客户端自报的 userId 或 role。

这也是为什么：

~~~text
JWT valid
≠
有权访问任意资源
~~~

**E｜QHZHC 实践**

QHZHC 认证成功后会在连接上下文中保存 Principal、Access Token、robotId 和订阅数据档位。

服务端还会检查：

~~~text
URL robotId
=
authenticate.robotId
~~~

防止同一连接在路径和认证报文中声明两个不同机器人。

但需要明确区分现状和理想方案：

- **项目现状**：已完成身份认证和订阅目标一致性校验。
- **当前边界**：没有看到“某用户是否被授权访问某 robotId”的细粒度资源权限模型。
- **理想方案**：多机器人 / 多租户后增加 Principal → Resource Authorization → Subscription Binding。

**P｜面试 / 答辩**

> Token 校验只完成身份认证，真正的权限还要根据资源再判断。认证成功后我会把服务端可信的用户与订阅信息绑定到连接上下文，后续消息只使用这个上下文，而不是继续相信客户端自己传的身份字段。

常见追问：JWT 里已经有 role 为什么还要查权限？一个用户多个连接怎么管理？

---

### 【浏览器 WebSocket 鉴权的关键是凭证如何安全进入连接】

**P｜结论**

浏览器原生 WebSocket 构造器只提供 URL 和 subprotocol 参数，没有普通 HTTP 客户端那样自由设置 Authorization Header 的接口，因此鉴权方案必须结合浏览器能力设计。[[2]](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket)

**R｜主流方案对比**

| 方式 | 浏览器可用 | 优点 | 主要风险 |
| --- | --- | --- | --- |
| Cookie | 是 | 与 Session 体系结合自然 | 自动携带 Cookie，需要重点防 CSWSH |
| Query Token | 是 | 简单 | Token 可能进入 URL、代理日志、监控 |
| 首条 authenticate 消息 | 是 | Token 不进入 URL | socket 先建立，需认证超时与 DoS 防护 |
| Subprotocol | 是 | 可参与协议协商 | 不宜滥用为通用秘密承载通道 |
| Authorization Header | 原生浏览器不可自由设置 | 语义最清楚 | 更适合 Node / 原生客户端 |

对于首条消息认证，工程上还必须补：

- 认证超时；
- 未认证状态消息白名单；
- 重复认证保护；
- 未认证连接总数 / IP 速率限制；
- WSS 加密传输。

**E｜QHZHC 实践**

QHZHC 的 Access Token 不拼在 WebSocket URL 中，而是在 OPEN 后作为 authenticate 消息发送。

~~~text
Access Token 在 JS 内存
      ↓
new WebSocket(...)
      ↓
OPEN
      ↓
authenticate { accessToken, ... }
      ↓
verifyAccessToken
~~~

这避免了 Query Token 常见的 URL 暴露面。

但 Access Token 仍存在 JavaScript 内存，因此 **不能把这种设计描述成“防 XSS”**。XSS 能执行同源脚本时仍可能读取内存凭证。

**P｜面试 / 答辩**

> 浏览器 WebSocket 不能像 Axios 一样自由加 Authorization Header，所以常见做法是 Cookie、Query Token 或首包认证。我选择首包认证主要是避免 Token 进入 URL，同时通过认证超时和状态机限制未认证连接。

常见坑：把长 Token 放 Query；使用 ws 而不是生产环境 wss；认为 HttpOnly Refresh Token 能保护内存中的 Access Token。

---

### 【业务协议需要版本、Schema 与状态三重校验】

**P｜结论**

WebSocket 是持续消息通道，单纯 JSON.parse 成功不代表消息合法；生产协议必须同时验证结构、协议版本和当前状态是否允许这类消息。

**R｜原理**

推荐入站路径：

~~~text
Raw Frame
   ↓
Parse
   ↓
Schema Validation
   ↓
Protocol Version
   ↓
State Validation
   ↓
Authorization
   ↓
Business Handler
~~~

逐步解释：

1. Parse 只解决字符串是否能解析。
2. Schema Validation 检查 type、字段类型、范围。
3. Protocol Version 防止新旧客户端对同一字段产生不同解释。
4. State Validation 检查当前状态是否允许该消息。
5. Authorization 检查当前身份是否允许执行动作。
6. 最后才进入业务逻辑。

**E｜QHZHC 实践**

QHZHC 的共享协议文件：

- QHZHC_Server/src/shared/protocol.ts

当前只接受 authenticate、ping 和 resend_time_range 等已知客户端消息；authenticate 还要求 protocolVersion 与服务端一致。

客户端收到 welcome 后再次验证 protocolVersion，不兼容则停止自动恢复。

**P｜面试 / 答辩**

> WebSocket 消息校验不应该只有 JSON Schema，还要叠加协议版本和状态机校验。同一条 ping 在已认证状态可以合法，在认证前就应该被拒绝。

常见坑：未知 type 静默忽略；协议不兼容仍不停重连；客户端自报角色直接参与授权。

---

## 3. 双 Token 会话把短期访问安全与长期登录体验连接起来

本章逻辑主线是：**Access Token 承担高频访问，Refresh Token 承担低频续期，再通过 Token Family、Rotation 和持续校验让长连接能够安全跨越 Access Token 生命周期。**

### 【Access Token 与 Refresh Token 通过职责拆分降低长期凭证暴露】

**P｜结论**

Access Token（访问令牌）适合短期、高频访问；Refresh Token（刷新令牌）适合长期、低频续签。双 Token 的核心不是“两个字段”，而是把暴露面和职责拆开。

**R｜原理与主流用法**

~~~text
Login
  ↓
Access Token
短期、频繁使用
  │
  ├─ HTTP API
  └─ WebSocket Authentication

Refresh Token
长期、低频使用
  │
  └─ Refresh Endpoint only
~~~

浏览器常见安全折中：

~~~text
Access Token
→ JS Memory

Refresh Token
→ HttpOnly + Secure + SameSite Cookie
~~~

原因：

- Access Token 经常跟随业务请求，生命周期应尽量短。
- Refresh Token 能持续换发 Access Token，一旦泄漏影响更大。
- HttpOnly 可阻止普通 JavaScript 直接读取 Refresh Cookie。
- Secure 限制 HTTPS 传输。
- SameSite 缩小跨站自动携带范围。

**E｜QHZHC 实践**

当前实现：

- 登录响应体返回 Access Token；
- 前端 QHZHC_Web/src/services/accessToken.ts 只在模块内存保存；
- Refresh Token 由服务端写入 HttpOnly Cookie；
- Cookie Path 限制为 /api/auth；
- HTTP 和 WebSocket 共用同一 Access Token 身份。

**项目现状**：15 分钟 Access Token、7 天 Refresh Token Family 默认配置。

**主流方案**：具体 TTL 没有统一行业标准，需要按风险、业务体验和设备类型确定。

**理想方案**：生产环境明确 TLS / Reverse Proxy 信任配置，确保 Secure Cookie 在 TLS 终止架构下仍正确设置。

**P｜面试 / 答辩**

> 双 Token 把高频访问凭证和长期续签能力拆开。Access Token 短期使用，Refresh Token 只访问刷新接口并尽量放 HttpOnly Cookie，这样 Access 泄漏的影响窗口更小，长期凭证也不需要频繁暴露给业务代码。

常见坑：Refresh Token 也放 localStorage；Refresh Token 可以直接访问业务 API；为了“无感登录”无限延长会话。

---

### 【JWT 自包含不等于整个会话系统必须无状态】

**P｜结论**

JWT（JSON Web Token）可以自包含身份声明并进行无状态签名验证，但如果系统要求立即撤销、退出登录和重放检测，仍然需要服务端会话状态。

**R｜为什么需要服务端状态**

纯 JWT 模式：

~~~text
JWT signature valid
+ exp not expired
→ accept
~~~

问题是：

~~~text
用户已经 logout
但 JWT 还有 10 分钟有效
→ 纯无状态验证仍会接受
~~~

因此主流工程里常使用 Hybrid Session（混合会话）：

~~~text
JWT
→ 表达短期身份

Server-side Session / Family
→ 表达会话是否仍然有效
~~~

RFC 7519 定义 JWT 的 claims 和签名表示方式，但并没有规定“使用 JWT 就必须完全无状态”。[[3]](https://www.rfc-editor.org/rfc/rfc7519)

**E｜QHZHC 实践**

QHZHC Access JWT 中包含：

- sub：用户主体；
- iss：签发者；
- aud：目标 API；
- jti：Token 唯一 ID；
- sid：Token Family；
- exp：过期时间；
- role：角色。

verifyAccessToken 除了验证 JWT，还会检查 sid 对应 Token Family 是否仍然 Active。

因此项目准确描述应是：

> **自包含短期 Access JWT + 服务端可撤销 Token Family。**

**P｜面试 / 答辩**

> JWT 支持无状态验证，但“JWT = 整个登录系统无状态”是不准确的。如果我要支持 logout 立即失效、Refresh Rotation 和会话撤销，就会保留服务端 Session / Token Family 状态。

常见追问：为什么不直接把 access token 加黑名单？sid 和 jti 分别解决什么问题？

---

### 【Refresh Token Rotation 通过一次性使用和 Token Family 检测重放】

**P｜结论**

Refresh Token Rotation（刷新令牌轮换）把长期 Refresh Token 变成“一次性续签凭证”：每次刷新都签发新的 Refresh Token，旧 Token 立即失效；旧 Token 再出现时可以触发重放检测。RFC 9700 将 Rotation 列为公共客户端检测 Refresh Token 重放的标准方法之一。[[4]](https://www.rfc-editor.org/rfc/rfc9700)

**R｜原理与取舍**

~~~text
Refresh A
   │ use once
   ▼
Access 2 + Refresh B
   │
   └─ Refresh A consumed

如果 A 再出现
   ↓
Reuse Detected
   ↓
Revoke Token Family
~~~

逐步解释：

1. 登录时创建 family。
2. family 中只有最新 Refresh Token 可用。
3. 刷新时旧 Token 原子标记为 consumed。
4. 同一事务创建新 Token。
5. 如果旧 Token 再出现，服务端无法知道攻击者和合法客户端谁持有哪一个。
6. 最安全的做法是撤销整个 family，要求重新认证。

Rotation 的代价是引入并发问题，所以“服务端轮换”必须和“客户端刷新并发治理”一起设计。

**E｜QHZHC 实践**

QHZHC_Server/src/server/database.ts 在事务中执行 Rotation：

- Refresh Token 原文不入库，只存 SHA-256 摘要；
- old token 标记 consumed；
- 保存 parent / replaced_by 关系；
- 新 Token 继承同一个 familyId；
- consumed Token 再次出现会 revoke 整个 family。

当前新 Refresh Token 继承原 family 的 expires_at，因此刷新不会无限延长登录寿命，属于 **Absolute Expiration（绝对过期）**。

**P｜面试 / 答辩**

> Rotation 的重点不是“每次换个字符串”，而是一次性使用 + 保留 Token Chain + Reuse Detection。旧 Refresh Token 再次出现时说明可能泄漏，所以撤销整个 family。

常见坑：Rotation 不用事务；刷新后把过期时间重新加 7 天导致无限滑动；日志打印 Refresh Token。

---

### 【Single Flight 防止合法并发刷新误触发重放检测】

**P｜结论**

Single Flight（并发合并）让同一客户端同时发生的多个 401 共享一次 Refresh 请求，避免多个请求同时消费同一 Refresh Token。

**R｜为什么 Rotation 必须配合并发控制**

没有并发控制时：

~~~text
HTTP A 401 ─┐
HTTP B 401 ─┼→ 同一个 Refresh Cookie
WebSocket ──┘
        ↓
三次 refresh 同时发出
        ↓
第一次成功消费 old token
        ↓
第二次被认为 reuse
        ↓
整个 family 被 revoke
~~~

服务端并没有错，因为它真的看到了已经消费过的 Token。

所以正确结构是：

~~~text
第一个失败请求
→ 创建 refreshPromise

其他失败请求
→ await 同一个 Promise

成功
→ 一起使用新 Access Token
~~~

**E｜QHZHC 实践**

QHZHC_Web/src/services/accessToken.ts 维护共享 refreshPromise，因此同一 Tab 内：

- 多个 HTTP 401；
- WebSocket Access Token 过期；

都会合并到同一次刷新。

但这里必须说明当前边界：

**项目现状**：单 Tab 内 Single Flight。

**当前不足**：不同浏览器 Tab 有独立 JavaScript 内存，却共享 Cookie，仍可能同时刷新。

**理想方案**：多 Tab 场景可结合 Web Locks API 串行刷新，再用 BroadcastChannel 只广播“会话已更新”信号，而不是广播长期敏感凭证。

**P｜面试 / 答辩**

> Refresh Rotation 解决旧凭证重放，Single Flight 解决合法客户端自己的并发刷新。没有 Single Flight，合法并发也可能被 Rotation 当成重放。

常见追问：多个 Tab 怎么办？刷新失败后等待中的请求怎么处理？

---

### 【长连接需要持续验证会话，而不能只在建连时校验一次】

**P｜结论**

WebSocket 生命周期可能长于 Access Token 生命周期，因此服务端必须定义 Session Revalidation（会话持续校验），否则一个已经过期或撤销的身份可能继续占用长连接。

**R｜主流方案对比**

| 方案 | 优点 | 代价 |
| --- | --- | --- |
| 建连时只校验一次 | 实现简单 | Token 过期 / 撤销不能及时影响已有连接 |
| 每条消息重新校验 | 最及时 | 成本高 |
| 按 exp 设置断开定时器 | 处理自然过期准确 | 无法单独处理提前 revoke |
| 周期性重新验证 | 实现和成本平衡 | 撤销存在一个检测窗口 |
| revoke 事件主动踢线 | 最及时 | 需要 Session → Connection 索引 |

**E｜QHZHC 实践**

QHZHC 当前在服务端心跳巡检中重新执行 verifyAccessToken，因此：

~~~text
Access Token 过期
或 Token Family revoke
        ↓
下一轮巡检验证失败
        ↓
关闭 WebSocket
        ↓
客户端进入身份恢复
~~~

logout 会 revoke 当前 family，所以已经建立的 WebSocket 最终也会失效。

**项目现状**：周期重验。

**理想方案**：如果要求“踢下线立即生效”，维护 familyId → active connections，在 revoke 时主动 close。

**P｜面试 / 答辩**

> HTTP 可以每个请求都验证 Token，但 WebSocket 是长连接，所以建连时验证一次不够。我会定义持续重验或主动 revoke 机制，让 Access Token 过期和 logout 能影响已经建立的连接。

常见坑：Token 过期但 socket 永远在线；logout 只清前端内存。

---

## 4. 连接稳定性由状态机、心跳、故障分类和受控重连共同保证

本章逻辑主线是：**先准确判断“连接是否真的可用”，再根据故障类型决定恢复动作，最后用退避与生命周期约束避免恢复机制本身制造故障。**

### 【协议心跳、应用心跳与业务 Watchdog 检测的是三种不同存活】

**P｜结论**

Liveness（存活性）至少分为协议连接存活、应用消息处理存活和业务数据流存活；只靠一个 heartbeat 无法区分三类问题。

**R｜原理**

第一层：WebSocket Ping / Pong。

RFC 6455 定义 Ping 和 Pong 控制帧，Ping 可用于 keepalive 或检查远端是否响应；收到 Ping 的端点应尽快回复 Pong。[[1]](https://www.rfc-editor.org/rfc/rfc6455)

~~~text
Server Ping
   ↓
WebSocket Stack
   ↓
Client Pong
~~~

它主要证明底层连接和 WebSocket 端点仍然响应。

第二层：Application Heartbeat（应用层心跳）。

浏览器 JavaScript API 没有暴露主动发送协议 Ping 帧的方法，因此常使用普通业务消息：

~~~text
{ type: ping, nonce, sentAt }
        ↓
{ type: pong, nonce, serverTime }
~~~

它可以附带业务时间和游标。

第三层：Data Watchdog（业务数据看门狗）。

~~~text
心跳一直正常
但是连续几秒没有 telemetry
~~~

此时 WebSocket 没死，但上游采集 / 流处理 / 发布链可能已经停止。

**E｜QHZHC 实践**

项目当前同时存在：

1. 服务端 ws 协议 Ping / Pong；
2. 客户端 JSON ping / pong；
3. 自然秒数据 watchdog。

服务端约 8 秒一次协议巡检，并结合 protocolAlive 与 lastSeenAt 清理 stale connection。

客户端还检查连续多个心跳周期没有任何消息，以及连续约 3 秒没有新的自然秒数据。

**P｜面试 / 答辩**

> 协议 Ping/Pong 只能说明连接端点仍响应；应用层心跳可以验证消息循环；业务 Watchdog 再检查实时数据是否真正推进。我会把三层状态分开，否则很容易把“数据源停了”误判成“WebSocket 断了”。

常见追问：为什么浏览器还要自定义 ping？TCP Keepalive 能不能替代？

---

### 【Close Code 把故障分类转成明确的恢复策略】

**P｜结论**

WebSocket Close Code（关闭码）不只是日志字段，而应该是客户端恢复状态机的输入：同一个关闭事件必须区分“直接重连”“先刷新身份”和“停止恢复”。RFC 6455 定义关闭帧和状态码范围，但具体业务恢复动作由应用决定。[[1]](https://www.rfc-editor.org/rfc/rfc6455)

**R｜故障分类**

~~~text
close
  ↓
分类原因
  ├─ Transient
  │    → reconnect
  │
  ├─ Authentication expired
  │    → refresh token
  │    → reconnect
  │
  └─ Fatal
       → stop
~~~

典型对应：

| 类型 | 示例 | 动作 |
| --- | --- | --- |
| 临时故障 | 1006、1012、1013、网络切换 | 退避重连 |
| 身份可恢复 | Access Token 过期 | Refresh → 重连 |
| 不可自动恢复 | Forbidden、协议不兼容 | 停止并提示 |

如果所有 close 都直接重连，Token 过期会演化成：

~~~text
旧 Token
→ connect
→ 认证失败
→ reconnect
→ 旧 Token
→ 无限循环
~~~

**E｜QHZHC 实践**

QHZHC_Web/src/views/DataVisualization/services/realtimeConnectionPolicy.ts 把关闭码归为：

- refresh-token；
- reconnect；
- stop。

4001 表示认证需要恢复；4003 和 4100 停止自动恢复；其余多数进入重连。

**P｜面试 / 答辩**

> 重连不能只看“是不是 close”，必须先判断失败是否可恢复。网络故障适合重连，Access Token 过期要先刷新凭证，权限拒绝和协议错误则继续重连也不会好，所以要停止。

常见坑：依赖 onerror 判断业务原因；每个后端异常都创造新关闭码；关闭 reason 暴露敏感内部信息。

---

### 【指数退避与 Jitter 防止重连机制产生惊群】

**P｜结论**

Exponential Backoff（指数退避）控制单客户端重试频率，Jitter（随机抖动）打散多客户端的重连时间，两者共同避免服务恢复瞬间出现 Thundering Herd（惊群）。

**R｜原理**

如果 10,000 个客户端在服务重启后一秒内同时 reconnect：

~~~text
Service Restart
      ↓
10,000 clients disconnect
      ↓
10,000 immediate reconnects
      ↓
TLS / Auth / DB / Replay burst
      ↓
Service overloaded again
~~~

退避策略：

~~~text
base × 2^attempt
      ↓
cap at maximum
      ↓
randomize with jitter
~~~

主流实现还会：

- welcome / ready 后才重置 attempt；
- offline 时不重试；
- 页面明确暂停时不重试；
- 设置最大延迟；
- 长期实时应用可以持续低频恢复，而不是无限高频恢复。

**E｜QHZHC 实践**

QHZHC 使用带随机抖动的指数退避，延迟上限约 15 秒；服务端成功返回 welcome 后才清零 attempt。

客户端还监听：

- navigator online / offline；
- document visibility；

避免没有恢复条件时持续创建 socket。

**P｜面试 / 答辩**

> 指数退避解决单客户端打太快，Jitter 解决所有客户端同时打回来。两者缺一不可，尤其是服务重启后，否则恢复机制本身会成为下一次过载来源。

常见追问：是否一定需要最大重试次数？什么时候恢复 attempt？

---

### 【显式状态机比大量布尔变量更能保证生命周期正确】

**P｜结论**

长连接代码应该用状态迁移理解，而不是只靠 isConnected、isRefreshing、isReplaying 等布尔值；状态机能明确“当前允许什么事件、失败后去哪里”。

**R｜状态模型**

推荐抽象：

~~~text
IDLE
  ↓
CONNECTING
  ↓
AUTH_PENDING
  ↓
RECOVERING_DATA
  ↓
LIVE
  │
  ├─ auth expired → AUTH_RECOVERING
  │                    ↓
  │                 CONNECTING
  │
  ├─ transient failure → RECONNECT_WAIT
  │                         ↓
  │                      CONNECTING
  │
  └─ fatal → STOPPED
~~~

逐步解释：

1. CONNECTING 只等待底层连接结果。
2. AUTH_PENDING 只允许身份初始化。
3. RECOVERING_DATA 先恢复缺失数据，不能直接与 live 混合。
4. LIVE 才是真正稳定业务态。
5. AUTH_RECOVERING 先修复会话。
6. RECONNECT_WAIT 负责退避。
7. STOPPED 禁止任何异步回调重新创建连接。

**E｜QHZHC 实践**

QHZHC 没有引入状态机库，但代码已经体现这些约束：

- 认证前只允许 authenticate；
- 认证中拒绝第二次 authenticate；
- 已认证后拒绝重复 authenticate；
- replay 期间暂停该连接普通 live 投递；
- 客户端用 socket 引用比对过滤旧连接残余事件；
- stop 后清理重连、心跳、watchdog 和事件监听。

**P｜面试 / 答辩**

> 我不会把 WebSocket 只理解成 open / close，而是业务状态机：连接中、待认证、恢复数据、实时、身份恢复、等待重连和停止。每个状态限制可接受事件，这能避免旧异步任务污染新连接。

常见坑：旧 socket close 回调把新连接状态清掉；页面销毁后 reconnect timer 仍工作。

---

## 5. 可恢复实时传输需要在重新连接后继续恢复数据进度

本章逻辑主线是：**Reconnect 只恢复 Transport；真正的数据连续性还需要 Recovery Cursor → Gap Detection → Replay → Dedupe / ACK → Live。**

### 【Recovery Cursor 决定新连接从哪里继续】

**P｜结论**

Recovery Cursor（恢复游标）是可恢复实时协议的核心状态：客户端必须保存一个稳定进度，并在重连时告诉服务端“从这里之后继续”。

**R｜主流游标对比**

| 游标 | 优点 | 主要问题 | 适用 |
| --- | --- | --- | --- |
| 单调 sequence / offset | 精确、容易判断缺口 | 服务端要维护稳定序列 | 日志、事件流 |
| eventId | 语义清晰 | 需要唯一性与索引 | 事件系统 |
| timestamp | 直观 | 同时刻多记录、时钟问题 | 时间数据 |
| time bucket | 与聚合窗口一致 | 粒度更粗 | 遥测 / 聚合流 |

理想流程：

~~~text
Client last confirmed cursor
        ↓
Reconnect + Authenticate(cursor)
        ↓
Server validates retention
        ↓
Replay cursor + 1 ...
        ↓
Replay Complete
        ↓
Live
~~~

图中每一步的意义：

1. cursor 是连接之外的业务状态。
2. 新 socket 不应该默认从“现在”开始。
3. 服务端先判断 cursor 是否还在留存范围。
4. 可恢复则补发。
5. 补发结束后明确发出边界事件。
6. 客户端才进入 live。

**E｜QHZHC 实践**

QHZHC 使用“自然秒 bucketStartMs”作为恢复游标。

客户端 authenticate 时发送 resumeFromBucketStartMs；服务端从该自然秒补到最新已完成自然秒。

**项目现状**：时间窗口游标，适合当前按自然秒发布的遥测模型。

**理想方案**：如果未来要求严格逐点无缺口，可进一步使用单调 sequence / offset 作为主游标。

**P｜面试 / 答辩**

> 重连成功只是新 socket 建好了，数据恢复还需要一个独立 cursor。我会把最后可靠进度保留在连接外，重连时提交给服务端，再补发 cursor 之后的数据。

常见追问：为什么不用最后一个时间戳？cursor 应该在收到消息时还是处理完成后推进？

---

### 【Replay 与 Live 必须有明确切换边界】

**P｜结论**

补发流和实时流不能无序交叉，否则客户端很难判断顺序、去重和游标，因此恢复协议需要显式 Replay 阶段和 Replay Complete 边界。

**R｜为什么需要恢复阶段**

错误设计：

~~~text
Reconnect
   ↓
Server 同时发历史 + 最新 live
   ↓
Client 收到：
10:05 replay
10:08 live
10:06 replay
10:07 replay
~~~

即使每条消息都有时间，客户端也需要额外排序、缓存和去重。

更简单的协议是：

~~~text
Authenticate
   ↓
Welcome
   ↓
Replay historical range
   ↓
Replay Complete
   ↓
Live
~~~

这让“恢复期”和“实时期”成为两个稳定阶段。

**E｜QHZHC 实践**

QHZHC_Server/src/server/robot-socket-hub.ts 在 replay 时把连接标记为 replaying，publish 会跳过该连接，因此 live 不会与 replay 同时投递。

补发完成后发送 replay_complete，再恢复正常实时广播。

客户端在发现较大 Gap 后也会进入 recoveringGap，暂时丢弃未来 live，等待 replay 流重新建立连续进度。

**P｜面试 / 答辩**

> 我把 replay 和 live 做成两个协议阶段，而不是同时发送。这样恢复过程本身就是有序的，客户端不需要在每次重连后额外合并两条乱序流。

常见坑：补发和 live 双写；replay 完成没有边界事件；重连后从 latest 直接开始导致缺口。

---

### 【Gap、Retention 与 No-Data 必须有不同语义】

**P｜结论**

“这个时间没有业务数据”和“这个时间的数据已经超出服务端留存范围”是两种完全不同的状态，恢复协议必须能够区分。

**R｜为什么会产生语义冲突**

假设：

~~~text
requested cursor = 10:00
earliest retained = 10:30
latest = 11:00
~~~

如果服务端直接读取 10:00～10:29：

~~~text
DB 查不到
→ 返回 no-data
~~~

客户端会误以为：

> 当时真的没有数据。

正确语义应该是：

~~~text
requested < earliest retained
→ unrecoverable gap
→ 告诉客户端最早可恢复位置
~~~

因此 Gap 消息至少应该表达：

- requested cursor；
- earliest available；
- latest；
- recommended action。

**E｜QHZHC 实践**

QHZHC 协议已经有 gap 消息，并携带 requestedFromBucketStartMs、earliestAvailableBucketStartMs、latestBucketStartMs 和 skip-to-latest。

但当前实现有一个需要继续完善的边界：

**项目现状**：补发跨度超过上限时会返回 gap。

**已发现问题**：如果 requested 已早于实际 retention，但总 bucket 数没有超过补发上限，当前逻辑仍可能把被清理的数据读取为 no-data。

**理想方案**：

~~~text
Replay 前先判断
requested < earliest retained
        ↓ yes
return gap immediately
~~~

**P｜面试 / 答辩**

> No-data 表示业务在该窗口本来就没有数据；Gap 表示数据理论上应该存在，但服务端已经无法恢复。两者不能混成同一个空数组，否则客户端无法判断数据完整性。

常见追问：Gap 后是跳到 latest 还是请求 HTTP 历史接口？谁决定恢复策略？

---

### 【ACK 决定游标代表“收到”还是“真正处理完成”】

**P｜结论**

WebSocket 基于 TCP 能提供单连接内有序传输，但不能自动告诉服务端应用层是否已经完成处理；如果要更强的数据可靠性，需要 Application ACK（应用层确认）。

**R｜投递语义**

需要区分：

~~~text
server.send()
≠ 客户端已经收到

message event
≠ 业务已经消费

业务消费
≠ 已持久化 / 已展示
~~~

ACK 可以放在不同阶段：

| ACK 时机 | cursor 代表 | 可靠性 | 成本 |
| --- | --- | --- | --- |
| message 收到后 | 网络接收 | 较弱 | 低 |
| 入本地可靠队列后 | 已进入消费范围 | 中 | 中 |
| 业务处理完成后 | 应用消费 | 更强 | 较高 |
| 持久化完成后 | 数据落盘 | 最强 | 高 |

而 ACK 通常只能帮助构建 At-least-once（至少一次）或可重试语义。Exactly-once（精确一次）往往还需要幂等键、事务或去重状态，不能仅靠一句 ACK 宣称实现。

**E｜QHZHC 实践**

当前 QHZHC **没有应用层 ACK**。

客户端收到 telemetry_second 后推进自然秒游标，并把 points 放入帧队列。

因此项目能力应准确描述为：

> **基于客户端接收进度的断线续传，而不是服务端确认的逐点 Exactly-once 协议。**

对于实时可视化，这是降低协议复杂度的一种合理取舍；如果未来进入计费、交易或不可丢事件，就需要重新设计 ACK 与持久化语义。

**P｜面试 / 答辩**

> WebSocket 有序不等于业务可靠投递。要回答“会不会丢”，必须先说 cursor 在什么时候推进、有没有 ACK、服务端保留多久。当前项目是接收进度续传，不应该包装成 Exactly-once。

常见坑：把 TCP 有序等同于断线不丢；ACK 后没有幂等仍声称 exactly once。

---

### 【去重与幂等保证重放不会放大业务结果】

**P｜结论**

Replay 为了避免丢失通常允许重复，因此客户端处理必须具备 Dedupe（去重）或 Idempotency（幂等）能力。

**R｜原理**

恢复协议通常宁可：

~~~text
不确定是否收到
→ 再发一次
~~~

也不要：

~~~text
不确定
→ 直接跳过
~~~

于是重复成为正常现象。

常用手段：

- 单调 sequence 去重；
- eventId 去重；
- stable batchId；
- 幂等业务键；
- server / client 保存最近确认窗口。

**E｜QHZHC 实践**

QHZHC 每个自然秒消息包含稳定 batchId；同一 robotId、bucketStartMs 和采样档位使用稳定采样算法，使首次发送和 replay 选出的点保持一致。

客户端还会忽略早于 expected cursor 的旧自然秒。

**当前边界**：QHZHC 不是严格逐点 ACK 协议，去重主要围绕时间窗口和重复窗口处理。

**P｜面试 / 答辩**

> 可恢复协议一定要假设重复可能发生。补发本质上更接近 at-least-once 思路，所以必须有稳定 ID、sequence 或幂等处理，不能只关注“怎么补”。

---

## 6. 安全治理和工程验证决定这套方案能否进入生产环境

本章逻辑主线是：**身份认证只是安全的一层；生产 WebSocket 还要治理 Origin、消息输入、资源消耗、监控和故障测试。**

### 【CORS 不能代替 WebSocket Upgrade 的 Origin 校验】

**P｜结论**

HTTP API 配置了 CORS，不代表 WebSocket Upgrade 自动受到相同保护；WebSocket 握手应单独验证 Origin，尤其是 Cookie 自动认证场景。OWASP 明确建议在每次握手中使用显式 Origin allowlist。[[5]](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

**R｜为什么 CORS 不够**

普通 HTTP：

~~~text
Express middleware
→ CORS headers
→ route
~~~

而很多 Node WebSocket：

~~~text
httpServer.on("upgrade")
→ handleUpgrade()
~~~

Upgrade 可能直接绕过 Express 普通中间件。

如果 WebSocket 自动携带认证 Cookie，却不检查 Origin，恶意站点可能诱导用户浏览器建立 authenticated WebSocket，形成 Cross-Site WebSocket Hijacking（跨站 WebSocket 劫持，CSWSH）。

**E｜QHZHC 实践**

QHZHC：

- HTTP CORS 在 QHZHC_Server/src/server/cors.ts；
- WebSocket Upgrade 在 robot-socket-hub.ts 直接监听 server upgrade。

因此当前 HTTP CORS 不是 WebSocket Origin 校验。

项目主要依赖首包 Access Token，而不是 WebSocket Cookie 自动身份认证，所以直接 CSWSH 风险比纯 Cookie 认证低；但 **理想方案仍应在 Upgrade 阶段显式 Origin allowlist**。

**P｜面试 / 答辩**

> CORS 是普通浏览器 HTTP 跨源访问控制，WebSocket Upgrade 可能走独立 server upgrade 路径，所以我会在 WebSocket 握手单独检查 Origin，而不是假设 Express CORS 已经覆盖。

常见坑：Origin 用 substring 匹配；生产允许 *；把 Origin 当作身份认证本身。

---

### 【所有 WebSocket 消息仍然是不可信输入】

**P｜结论**

连接认证成功只证明发送者身份，不证明消息内容安全；每条消息仍需做 Schema、状态、授权、大小和速率限制。OWASP 也建议对 WebSocket 消息做输入验证、消息大小限制、速率限制和逐动作授权。[[5]](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

**R｜完整入站安全链**

~~~text
Authenticated Socket
      ↓
Message Size
      ↓
Parse
      ↓
Schema
      ↓
State
      ↓
Authorization
      ↓
Rate Limit
      ↓
Handler
~~~

为什么每层都需要：

1. Size Limit 防止超大 Payload 占用内存。
2. Schema 防止非法结构进入业务。
3. State 防止错误阶段的合法消息。
4. Authorization 防止合法用户越权。
5. Rate Limit 防止消息洪泛。

**E｜QHZHC 实践**

**项目现状已有：**

- JSON parse；
- message shape 校验；
- protocolVersion；
- 认证状态约束；
- 服务端发送侧 bufferedAmount 背压保护。

**当前未完整覆盖 / 需继续建设：**

- Upgrade Origin allowlist；
- 单用户 / IP 连接限额；
- 应用明确的消息速率限制；
- 业务层 maxPayload 策略；
- 细粒度 robotId 资源授权。

这里不能把“协议 Schema 已校验”描述成“WebSocket 安全已经完整”。

**P｜面试 / 答辩**

> 鉴权解决是谁，输入验证解决发了什么，授权解决能不能做，限流解决能做多少次。这几层是正交的，不能互相替代。

---

### 【可观测性要围绕“断在哪里、多久恢复、恢复是否完整”设计】

**P｜结论**

实时链路的稳定性指标不能只看连接数；可恢复系统最重要的是记录失败原因、恢复耗时和数据缺口。

**R｜指标分层**

| 层次 | 建议指标 |
| --- | --- |
| 建连 | connect latency、upgrade failure、auth success / failure |
| 在线 | active connection、heartbeat RTT、stale count、close code |
| 会话恢复 | refresh success、refresh latency、family revoke、reuse detection |
| 重连 | attempt、backoff duration、reconnect success |
| 数据恢复 | replay count、replay duration、gap count、unrecoverable gap |
| 端到端 | close → live duration |

日志还要遵守安全边界：

~~~text
可以记录：
connectionId
userId（按隐私规范）
close code
protocol version
cursor
recovery result

禁止记录：
完整 Access Token
Refresh Token
Cookie
authenticate 原始报文
~~~

**E｜QHZHC 实践**

QHZHC welcome 已经包含 connectionId，可用于前后端日志关联；前端又接入 browser-monitor，因此可以进一步把以下事件作为自定义监控信号：

- websocket.connect；
- websocket.close；
- auth.refresh；
- websocket.reconnect；
- replay.start / complete；
- gap。

**项目现状**：已经具备基础性能监控 SDK 和连接状态信息。

**理想方案**：增加端到端 Recovery SLI，例如 close-to-live P95、unrecoverable gap rate。

**P｜面试 / 答辩**

> 稳定性不是“不掉线”，而是掉线以后能不能识别原因、多久恢复、数据是否补齐。所以监控既要看 close code，也要看 reconnect-to-live 时间和 gap。

---

### 【测试应该覆盖状态迁移和故障恢复，而不是只测正常连接】

**P｜结论**

WebSocket + 鉴权最容易出 Bug 的是异常状态迁移，因此测试矩阵应该按“认证 → 会话 → 连接 → 数据恢复”覆盖，而不是只写一条能连接的 happy path。

**R｜完整测试矩阵**

~~~text
Authentication
├─ missing token
├─ invalid token
├─ expired token
├─ revoked family
└─ refresh replay

Protocol State
├─ message before auth
├─ auth timeout
├─ double auth
├─ invalid JSON
└─ protocol mismatch

Connection Recovery
├─ network failure
├─ service restart
├─ overload close
├─ offline / online
├─ token expires online
└─ refresh failure

Data Recovery
├─ reconnect cursor
├─ replay
├─ duplicate
├─ no-data
├─ gap
└─ retention exceeded
~~~

这张测试树逐层对应前文知识：

1. Authentication 验证身份边界。
2. Protocol State 验证状态机。
3. Connection Recovery 验证重连决策。
4. Data Recovery 验证“重新连上之后”的连续性。

**E｜QHZHC 实践**

当前测试已经覆盖多个关键场景：

- QHZHC_Server/tests/auth-tokens.test.ts：Rotation / reuse / revoke；
- QHZHC_Server/tests/websocket.test.ts：首条非认证消息、无效 Access Token、补发；
- QHZHC_Web/tests/unit/realtimeClient.spec.js：
  - Access Token 过期后 refresh；
  - 使用同一 cursor 重连；
  - refresh 失败停止恢复；
  - no-data 仍推进 cursor；
  - Gap 后请求 resend。

**理想方案**还应增加：

- Origin 拒绝；
- auth timeout；
- retention gap 精确语义；
- 多 Tab 并发刷新；
- 限流 / maxPayload；
- 服务端 revoke 主动踢线（如果后续实现）。

**P｜面试 / 答辩**

> 我会按状态机设计测试，而不是按函数设计测试。重点验证异常迁移：Token 过期能否进入 refresh、refresh 失败是否停止、重连是否保持 cursor、replay 是否和 live 正确切换。

---

## 7. 答辩时用“可信连接 → 稳定连接 → 可恢复数据”建立完整回答

本章把前面知识收束成一套可复述框架，避免答辩时把 JWT、心跳、重连和补发讲成互不相干的功能。

### 【完整知识树】

**P｜结论**

WebSocket + 鉴权可以收束成三层：先建立可信连接，再保证连接稳定，最后保证断线后的数据连续性。

~~~text
WebSocket 实时系统
│
├─ A. 可信连接
│   │
│   ├─ HTTP Upgrade
│   ├─ Application Authentication
│   ├─ Authentication
│   ├─ Authorization
│   ├─ Connection Binding
│   ├─ Protocol Version
│   └─ Origin / Input Security
│
├─ B. 稳定连接
│   │
│   ├─ Access Token + Refresh Token
│   ├─ Token Family
│   ├─ Refresh Rotation
│   ├─ Single Flight
│   ├─ Session Revalidation
│   ├─ Ping / Pong
│   ├─ Application Heartbeat
│   ├─ Data Watchdog
│   ├─ Close Classification
│   └─ Backoff + Jitter
│
└─ C. 可恢复数据
    │
    ├─ Recovery Cursor
    ├─ Gap Detection
    ├─ Replay
    ├─ Replay / Live Boundary
    ├─ Dedupe / Idempotency
    ├─ Retention Boundary
    └─ ACK / Delivery Semantics
~~~

逐层解释：

1. **可信连接**先解决“谁可以建立什么业务连接”。
2. **稳定连接**解决“连接活着时如何持续可信，断了以后如何安全回来”。
3. **可恢复数据**解决“回来以后如何继续，而不是重新从现在开始”。

**R｜为什么这样组织**

这三个层次正好对应三类故障：

~~~text
安全故障
→ 身份 / 权限不可信

连接故障
→ Transport 不可用

数据故障
→ Transport 恢复了，但业务进度不连续
~~~

面试官继续追问时，可以沿知识树向下展开，而不是重新组织答案。

**E｜QHZHC 实践与当前边界**

| 能力 | 项目现状 | 主流 / 理想演进 |
| --- | --- | --- |
| WebSocket 认证 | 首条 Access Token | Upgrade Origin + 未认证连接限额 |
| HTTP / WS 身份统一 | 共用 Access JWT | 保持统一 |
| Refresh | Token Family + Rotation | 增加跨 Tab 协调 |
| 撤销 | family revoke + 周期重验 | 需要时主动踢线 |
| 心跳 | 协议 + 应用 + 数据 watchdog | 增加 RTT / timeout 监控 |
| 重连 | Backoff + Jitter | 保持，补充 SLI |
| 恢复游标 | 自然秒 bucket | 严格场景可改 sequence |
| Replay | replay 与 live 分阶段 | 修正 retention gap 判定 |
| ACK | 当前无 | 强可靠场景再增加 |
| 授权 | 身份 + robotId 一致性 | 增加资源级 Authorization |
| Origin | HTTP CORS 有，WS 无独立 allowlist | Upgrade 显式校验 |

**P｜面试 / 答辩标准回答**

> 我的实时链路不是只做 WebSocket 重连，而是分成三层。第一层是可信连接：WebSocket Upgrade 后再用短期 Access Token 做应用层鉴权，并绑定资源和协议版本。第二层是稳定连接：Access Token 过期后通过 HttpOnly Refresh Token 做 Rotation 续期，在线连接通过心跳和会话重验检查存活，断线按 close code 区分刷新、退避重连和停止。第三层是数据恢复：新连接携带恢复游标，服务端先 replay 再切回 live，并显式处理 gap 和 retention。当前项目没有应用 ACK，所以我把能力准确描述为基于接收游标的断线续传，而不是 Exactly-once。后续还可以继续补 Origin 校验、资源级授权和跨 Tab Refresh 协调。

高频追问可以沿这几条继续准备：

1. 为什么 WebSocket OPEN 不等于业务连接可用？
2. 浏览器不能自由加 Authorization Header，为什么选择首包认证？
3. JWT 为什么还需要 Token Family？
4. Refresh Token Rotation 为什么要配 Single Flight？
5. Token 在连接期间过期怎么办？
6. 协议 Ping/Pong、业务 ping 和数据 watchdog 有什么区别？
7. 为什么网络异常可以重连，403 / 协议错误不应该无限重连？
8. 指数退避为什么还需要 Jitter？
9. 重连成功以后如何知道从哪里继续？
10. WebSocket 基于 TCP，为什么仍然可能需要 ACK？
11. no-data 和 retention gap 为什么必须区分？
12. HTTP 有 CORS，为什么 WebSocket 还需要 Origin 校验？

---

## 8. 参考文献

1. [[1] RFC 6455 — The WebSocket Protocol, IETF / RFC Editor](https://www.rfc-editor.org/rfc/rfc6455)
2. [[2] MDN — WebSocket() constructor](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket)
3. [[3] RFC 7519 — JSON Web Token (JWT), IETF / RFC Editor](https://www.rfc-editor.org/rfc/rfc7519)
4. [[4] RFC 9700 — Best Current Practice for OAuth 2.0 Security, IETF / RFC Editor](https://www.rfc-editor.org/rfc/rfc9700)
5. [[5] OWASP — WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

### 【Full-Stack-AI-NOTES 前置与延伸知识】

- WebSocket 从 0 到 1：基础协议、生命周期、心跳与重连。
- Web 身份认证、会话控制与访问控制体系：Authentication → Session Management → Authorization。
- Access Token 与 Refresh Token 核心知识点：双 Token、Rotation、Reuse Detection、Expiration。
- 反向代理与 Web 入口体系：生产部署中的 TLS、Proxy 与入口边界。

### 【QHZHC 实践证据】

- 服务端认证：../QHZHC_Server/src/server/auth.ts
- Refresh Token Family：../QHZHC_Server/src/server/database.ts
- HTTP 登录 / 刷新 / 登出：../QHZHC_Server/src/server/app.ts
- WebSocket Hub：../QHZHC_Server/src/server/robot-socket-hub.ts
- WebSocket 协议：../QHZHC_Server/src/shared/protocol.ts
- Access Token Manager：../QHZHC_Web/src/services/accessToken.ts
- HTTP 401 恢复：../QHZHC_Web/src/services/httpAuth.ts
- WebSocket 客户端：../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts
- Close 恢复策略：../QHZHC_Web/src/views/DataVisualization/services/realtimeConnectionPolicy.ts
- Token 测试：../QHZHC_Server/tests/auth-tokens.test.ts
- WebSocket 测试：../QHZHC_Server/tests/websocket.test.ts
- 客户端恢复测试：../QHZHC_Web/tests/unit/realtimeClient.spec.js
