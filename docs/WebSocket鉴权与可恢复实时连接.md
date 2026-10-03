# WebSocket 鉴权与可恢复实时连接

> 本文讨论的不是“WebSocket 怎么连上”，而是一个更完整的问题：**实时连接如何建立可信身份、在长时间运行中保持有效，并在网络中断、Token 过期或服务重启后恢复到正确的数据进度。**
>
> 通用知识参考 RFC、MDN、OWASP 和 Full-Stack-AI-NOTES 中已有的 WebSocket、身份认证与 Token 体系；项目实现以当前活动源码和测试为准。历史文档只作为线索，不作为当前实现依据。

---

## 1. 从一条完整链路理解 WebSocket、鉴权与恢复

WebSocket 只解决“浏览器和服务端之间建立持久双向通道”。真正的生产级实时系统还要继续解决三个问题：

1. **可信连接**：这条连接是谁建立的，允许访问什么资源。
2. **稳定连接**：Token 过期、网络波动、服务重启以后如何恢复。
3. **连续数据**：连接重新建立以后，断线期间的数据从哪里继续。

把三层放到同一条链路里，整体关系如下：

~~~text
用户登录
  ↓
HTTP 返回短期 Access Token
并写入长期 Refresh Token
  ↓
建立 WebSocket
  ↓
应用层认证
  ↓
绑定用户、资源、协议版本
  ↓
进入实时传输
  ↓
心跳 + 会话持续校验
  ↓
发生网络异常 / Token 失效 / 服务重启
  ↓
根据失败原因选择恢复策略
  ├─ Refresh Token → 新 Access Token
  └─ Backoff + Reconnect
        ↓
提交 Recovery Cursor
        ↓
补发缺失数据 Replay
        ↓
Replay Complete
        ↓
重新进入 Live
~~~

这里最重要的是不要把几个状态混为一谈：

~~~text
WebSocket OPEN
≠ 已完成业务认证

重新连接成功
≠ 登录会话已经恢复

登录会话恢复
≠ 断线期间的数据已经补齐
~~~

因此后面的知识不按“JWT、心跳、重连、ACK”平铺，而是沿这条链路展开。

### 【QHZHC 中对应的实现位置】

| 链路 | 当前实现 |
| --- | --- |
| HTTP 登录、刷新、登出 | `QHZHC_Server/src/server/app.ts` |
| Access JWT 与 Token Family | `QHZHC_Server/src/server/auth.ts` |
| Refresh Token Rotation | `QHZHC_Server/src/server/database.ts` |
| WebSocket 握手、认证、心跳、Replay | `QHZHC_Server/src/server/robot-socket-hub.ts` |
| WebSocket 消息协议 | `QHZHC_Server/src/shared/protocol.ts` |
| 前端 Access Token 管理 | `QHZHC_Web/src/services/accessToken.ts` |
| HTTP 401 恢复 | `QHZHC_Web/src/services/httpAuth.ts` |
| WebSocket 客户端恢复 | `QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts` |

---

## 2. WebSocket 建连以后还要建立可信业务连接

这一层解决的是“谁在使用这条连接，以及这条连接能做什么”。

### 【HTTP Upgrade 只完成协议升级】

RFC 6455 定义了 WebSocket Opening Handshake（开启握手）：浏览器先发送 HTTP Upgrade 请求，服务端接受后返回 `101 Switching Protocols`，随后双方开始交换 WebSocket Frame。[[1]](https://www.rfc-editor.org/rfc/rfc6455)

~~~text
HTTP Request
  ├─ Upgrade: websocket
  ├─ Connection: Upgrade
  └─ Sec-WebSocket-Key
        ↓
101 Switching Protocols
        ↓
WebSocket Frame
~~~

到这里建立的只是**传输通道**。协议本身并不知道“这个用户是谁”，也不知道“这个用户能否访问某台设备”。

因此生产系统通常还要增加应用层认证。

常见有两种时机：

| 认证时机 | 做法 | 优点 | 代价 |
| --- | --- | --- | --- |
| Upgrade 前 | 在 HTTP 握手阶段验证 Cookie、票据等 | 未认证连接不会真正进入 WebSocket | 浏览器可携带凭证的方式有限 |
| Upgrade 后 | 建连后第一条消息发送认证信息 | 协议灵活，Token 不需要进入 URL | 未认证连接已经占用 socket，需要超时和限额 |

QHZHC 采用第二种方式：

~~~text
HTTP Upgrade
    ↓
WebSocket OPEN
    ↓
等待 authenticate
    ↓
校验 Access Token
    ↓
发送 welcome
    ↓
允许业务消息
~~~

服务端设置认证时间窗口；认证前只允许 `authenticate`，不会因为底层 socket 已经 OPEN 就直接进入业务状态。

这也是面试中“WebSocket OPEN 是否等于连接可用”的核心答案：**OPEN 只表示协议连接建立，业务可用还依赖应用层状态。**

---

### 【身份认证、资源授权和连接绑定是连续的三步】

Authentication（身份认证）回答“你是谁”；Authorization（授权）回答“你能访问什么”；Connection Binding（连接绑定）则把已经验证过的身份和资源关系固定到当前 socket。

~~~text
Access Token
    ↓
Authentication
    ↓
Principal
    ↓
Authorization
Principal + Resource + Action
    ↓
Connection Binding
user / role / robot / subscription
    ↓
后续消息直接使用可信连接上下文
~~~

为什么还需要连接绑定？

因为认证成功以后，后续每条消息都不应该继续相信客户端重新上传的 `userId`、`role` 或资源身份。服务端应优先使用已经验证并绑定到连接上下文中的信息。

QHZHC 当前会验证：

~~~text
URL 中的 robotId
=
authenticate 消息中的 robotId
~~~

认证成功后再把用户和订阅信息写入连接上下文。

这里需要准确区分当前能力：

- **项目已经实现**：用户身份认证、robotId 一致性校验、连接上下文绑定。
- **当前尚未形成完整模型**：没有看到“某个用户是否被授权访问某个 robotId”的细粒度资源级权限体系。
- **后续主流演进**：如果进入多设备、多租户场景，应补充 `Principal → Resource → Action` 的资源级 Authorization。

因此“JWT 验证通过”不能直接等价成“可以访问所有实时资源”。

---

### 【浏览器 WebSocket 的鉴权方案受 API 能力限制】

浏览器原生 `WebSocket()` 构造器只接受 URL 和可选 subprotocol，并不像 `fetch` 或 Axios 那样允许业务代码自由添加 `Authorization` Header。[[2]](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket)

常见方案因此主要是：

| 方式 | 适合场景 | 主要问题 |
| --- | --- | --- |
| Cookie | Session / Cookie 体系 | 自动携带凭证，要重点处理 Origin 与 CSWSH |
| Query Token | 简单系统或临时票据 | URL 容易进入代理、日志和监控 |
| 首条认证消息 | 浏览器长连接、Token 鉴权 | 需要认证超时和未认证连接保护 |
| Authorization Header | Node / 原生客户端 | 浏览器原生 WebSocket 无法自由设置 |

QHZHC 没有把 Access Token 拼进 URL，而是在 WebSocket OPEN 后通过 `authenticate` 消息发送。

这降低了 Query Token 泄露到 URL 日志的风险，但不能被描述成“解决了 XSS”。Access Token 仍存在 JavaScript 内存，只要同源恶意脚本能够执行，就仍然可能访问它。

---

### 【消息协议还需要结构、版本和状态校验】

WebSocket 是一个长期开放的输入通道。认证成功只说明“谁在发消息”，并不代表消息内容天然可信。

一条入站消息至少要经过：

~~~text
Raw Frame
   ↓
JSON Parse
   ↓
Schema Validation
   ↓
Protocol Version
   ↓
Connection State
   ↓
Authorization
   ↓
Business Handler
~~~

每一步解决不同问题：

- JSON Parse：消息格式能不能解析。
- Schema：字段是否存在、类型和范围是否正确。
- Protocol Version：客户端和服务端是否使用同一套语义。
- Connection State：当前阶段是否允许这种消息。
- Authorization：当前身份是否允许执行这个动作。

QHZHC 的共享协议定义在：

`QHZHC_Server/src/shared/protocol.ts`

当前客户端消息包括 `authenticate`、`ping`、`resend_time_range` 等；认证时还会校验协议版本，客户端收到 `welcome` 后也再次确认版本是否兼容。

---

## 3. 双 Token 会话让长连接能够安全跨越 Access Token 生命周期

WebSocket 可以持续运行数小时，但 Access Token 通常不会设计成数小时甚至数天有效。于是实时连接必须和完整的会话生命周期结合起来理解。

### 【Access Token 和 Refresh Token 承担不同职责】

Access Token（访问令牌）用于高频业务访问，生命周期较短；Refresh Token（刷新令牌）只负责低频换取新的 Access Token，生命周期更长。

~~~text
Login
  ↓
Access Token
  ├─ HTTP API
  └─ WebSocket Authentication

Refresh Token
  └─ /auth/refresh
~~~

浏览器中常见的安全折中是：

~~~text
Access Token
→ JavaScript Memory

Refresh Token
→ HttpOnly Cookie
~~~

这样做的原因不是“内存绝对安全”，而是把长期凭证和高频业务代码隔离：

- Access Token 即使泄漏，影响窗口受较短 TTL 限制；
- Refresh Token 不需要暴露给普通 JavaScript；
- HttpOnly 降低脚本直接读取长期凭证的风险；
- Secure、SameSite 和 Cookie Path 继续缩小暴露面。

QHZHC 当前就是这种模式：

- Access Token 由登录 / refresh 响应返回；
- 前端只保存在模块内存；
- Refresh Token 写入 HttpOnly Cookie；
- Refresh Cookie 的 Path 限制在 `/api/auth`；
- HTTP 与 WebSocket 使用同一个 Access Token 身份。

当前默认配置是 Access Token 15 分钟、Refresh Token Family 7 天。这个数字是项目配置，不是行业统一标准。

---

### 【JWT 自包含不代表会话系统必须完全无状态】

JWT（JSON Web Token）可以让服务端通过签名和 Claim 独立验证 Token，但这并不意味着完整登录系统一定要“无状态”。RFC 7519 只规定 JWT 的表示和 Claim 语义，并没有要求应用不能保留服务端会话状态。[[3]](https://www.rfc-editor.org/rfc/rfc7519)

纯无状态模型：

~~~text
signature valid
+ exp not expired
→ accept
~~~

遇到立即退出登录时会出现问题：

~~~text
用户已经 logout
但 Access Token 还有几分钟有效
→ 纯 JWT 校验仍可能接受
~~~

如果系统需要：

- 立即登出；
- Refresh Rotation；
- Reuse Detection；
- 会话整体撤销；

就需要一部分 Server-side Session（服务端会话状态）。

QHZHC 的 Access JWT 中带有 `sid`，服务端验证 Token 时除了验证签名、issuer、audience、exp 等 Claim，还会检查对应 Token Family 是否仍然有效。

因此项目当前更准确的描述是：

> **短期自包含 Access JWT + 服务端可撤销 Token Family。**

这比简单说“我们用了无状态 JWT”更符合真实实现。

---

### 【Refresh Token Rotation 用一次性刷新凭证检测重放】

Refresh Token Rotation（刷新令牌轮换）的核心是：**Refresh Token 使用一次后立即作废，每次刷新都返回一个新的 Refresh Token。**

RFC 9700 将 Rotation 作为检测 Refresh Token 重放的一种推荐安全方案。[[4]](https://www.rfc-editor.org/rfc/rfc9700)

~~~text
Refresh A
   ↓ 使用
Access 2 + Refresh B

Refresh A
   ↓ 再次出现
Reuse Detected
   ↓
Revoke Token Family
~~~

为什么旧 Token 再出现时要撤销整个 Family？

因为服务端无法判断：

~~~text
旧 Token 在攻击者手里
还是
新 Token 在攻击者手里
~~~

一旦同一条 Token Chain 出现重放，继续允许其中一支使用就无法保证会话可信。

QHZHC 在 `database.ts` 中通过事务完成这一过程：

- Refresh Token 原文不入库，只存 SHA-256 摘要；
- 旧 Token 标记为 consumed；
- 新 Token 记录 parent / replaced_by 关系；
- 新旧 Token 属于同一 family；
- consumed Token 再出现时 revoke 整个 family。

新 Refresh Token 继承原来的 `expires_at`，所以刷新不会不断把 7 天重新往后延。这属于 Absolute Expiration（绝对过期），而不是无限滑动续期。

---

### 【Rotation 引出的并发问题需要 Single Flight】

Rotation 越严格，越需要处理合法客户端自己的并发刷新。

假设同时发生：

~~~text
HTTP A → 401
HTTP B → 401
WebSocket → Token expired
~~~

如果三条路径都读取同一个 Refresh Cookie 并同时请求 refresh：

~~~text
第一次请求
→ old token consumed
→ refresh 成功

第二次请求
→ old token 已 consumed
→ 被识别为 reuse

结果：
合法客户端自己触发 family revoke
~~~

Single Flight（并发合并）的作用就是让同一客户端中的多个刷新需求共享一次真正的 Refresh 请求：

~~~text
第一个请求
→ 创建 refreshPromise

其他请求
→ await 同一个 Promise

刷新成功
→ 一起继续
~~~

QHZHC_Web/src/services/accessToken.ts 已经用共享 `refreshPromise` 实现了**单 Tab 内**的并发合并。

这里仍有一个真实边界：不同浏览器 Tab 有独立 JavaScript 内存，但共享 Cookie，因此多个 Tab 仍可能并发刷新。

如果未来需要解决这一层，可以考虑：

~~~text
Web Locks
→ 跨 Tab 串行 refresh

BroadcastChannel
→ 广播“会话已经更新”的信号
~~~

不应该通过 BroadcastChannel 传播 Refresh Token 本身。

---

### 【WebSocket 在线期间还要持续检查会话是否有效】

HTTP 每次请求都会重新进入认证链路；WebSocket 则可能持续数小时。

如果只在建连时验证 Access Token，一条连接可能出现：

~~~text
Token 建连时有效
    ↓
10 分钟后 Token 过期
    ↓
socket 仍然继续传数据
~~~

常见处理方式有几种：

| 方案 | 特点 |
| --- | --- |
| 建连时只校验 | 最简单，但撤销和过期不能及时影响在线连接 |
| 每条消息重新校验 | 最及时，但开销高 |
| 按 exp 设置断开时间 | 适合自然过期，难覆盖提前 revoke |
| 周期性重新验证 | 成本与及时性折中 |
| revoke 时主动踢线 | 最及时，需要维护 Session → Connection 索引 |

QHZHC 当前采用周期重验：服务端在心跳巡检时重新执行 Access Token / Token Family 校验。

因此：

~~~text
Access Token 过期
或
Token Family revoke
        ↓
服务端下一轮会话检查失败
        ↓
关闭连接
        ↓
客户端进入认证恢复流程
~~~

如果以后需要“后台封禁后立即断线”，可以进一步维护 `familyId → active connections`，在 revoke 时主动关闭关联 socket。

---

## 4. 连接稳定性依赖心跳、故障分类和受控重连

“自动重连”不是一个完整方案。真正稳定的连接需要先判断故障发生在哪一层，再决定应该继续重试、刷新凭证还是停止。

### 【三种存活状态需要三层检测】

实时系统里至少有三种“活着”：

~~~text
TCP / WebSocket 还活着
        ↓
应用消息循环还活着
        ↓
业务数据还在继续产生
~~~

它们并不是同一件事。

#### <u>协议 Ping / Pong 检查 WebSocket 端点</u>

RFC 6455 定义了 Ping / Pong 控制帧。服务端可以定期 Ping，客户端 WebSocket Stack 返回 Pong，用来确认连接端点仍然响应。[[1]](https://www.rfc-editor.org/rfc/rfc6455)

#### <u>应用层 ping / pong 检查消息循环</u>

浏览器 JavaScript API 并不暴露主动发送协议 Ping 控制帧的能力，因此前端通常还会设计普通业务消息：

~~~text
{ type: "ping", ... }
        ↓
{ type: "pong", ... }
~~~

它可以携带时间戳、nonce、业务状态等额外信息。

#### <u>Data Watchdog 检查业务数据是否推进</u>

还有一种更隐蔽的问题：

~~~text
WebSocket ping/pong 正常
应用消息也正常
但是 telemetry 一直不再更新
~~~

这说明网络连接没有死，真正停止的是数据源或业务发布链。

QHZHC 同时存在这三层：

- 服务端协议 Ping / Pong；
- 浏览器应用层 ping / pong；
- 自然秒 telemetry watchdog。

这也是为什么“我已经做了心跳”还不够，必须继续问：**你在监测哪一种存活？**

---

### 【关闭原因决定下一步恢复动作】

WebSocket Close Code（关闭码）应该成为恢复状态机的输入，而不是只拿来打印日志。

一个可理解的恢复决策是：

~~~text
连接关闭
   ↓
判断原因
   ├─ 临时网络 / 服务故障
   │      ↓
   │   Backoff Reconnect
   │
   ├─ Access Token 失效
   │      ↓
   │   Refresh
   │      ↓
   │   Reconnect
   │
   └─ Forbidden / Protocol Error
          ↓
        Stop
~~~

如果所有 Close 都无脑重连，Access Token 过期会变成：

~~~text
旧 Access Token
→ reconnect
→ authenticate failed
→ reconnect
→ authenticate failed
→ ...
~~~

QHZHC 当前把关闭情况分成三类：

- `refresh-token`：先恢复会话；
- `reconnect`：直接进入受控重连；
- `stop`：权限或协议问题停止自动恢复。

这比“onclose 就 setTimeout(connect)”更接近生产状态机。

---

### 【指数退避和随机抖动控制重连压力】

Exponential Backoff（指数退避）解决单个客户端重试过快；Jitter（随机抖动）解决大量客户端同时重试。

如果服务重启导致大量连接一起断开，而所有客户端都固定 1 秒重连：

~~~text
Server Restart
     ↓
10,000 connections close
     ↓
1 秒后同时 reconnect
     ↓
TLS / Auth / Replay 瞬间放大
     ↓
服务再次过载
~~~

更合理的方式是：

~~~text
base × 2^attempt
        ↓
限制最大等待时间
        ↓
加入随机 jitter
~~~

QHZHC 使用指数退避并加入随机抖动，延迟有上限；只有收到 `welcome`、确认新连接真正恢复后才重置 attempt。

客户端还结合：

- `navigator.onLine`；
- 页面 visibility；

避免在浏览器明确离线或页面生命周期不适合时持续创建连接。

---

### 【显式状态比大量布尔变量更容易维护】

长连接逻辑一旦同时出现：

- connecting；
- authenticating；
- refreshing；
- reconnecting；
- replaying；
- stopped；

如果只靠多个布尔值，很容易组合出“不应该存在”的状态。

更适合的思维模型是：

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

即使代码没有引入状态机库，也应该保证状态迁移规则明确。

QHZHC 当前已经体现了这种约束：

- 认证前只允许 authenticate；
- authentication 过程中拒绝重复 authenticate；
- replay 期间暂停普通 live 投递；
- 客户端通过 socket 引用比较忽略旧连接残余事件；
- stop 时清理 timer、watchdog、事件监听和 reconnect 任务。

面试中如果问“为什么 WebSocket 容易出现偶发竞态”，通常就可以从这里回答：**难点往往不是 API，而是异步生命周期和状态迁移。**

---

## 5. 重新连上以后还需要恢复正确的数据进度

连接恢复解决 Transport（传输通道）；数据恢复解决业务连续性。

这一层是很多“自动重连方案”真正缺失的部分。

### 【Recovery Cursor 把业务进度带到下一条连接】

Recovery Cursor（恢复游标）表示客户端已经推进到什么位置。

常见游标包括：

| 类型 | 优点 | 局限 |
| --- | --- | --- |
| sequence / offset | 单调、容易判断缺口 | 服务端要维护稳定序列 |
| eventId | 语义明确 | 需要全局或分区唯一 |
| timestamp | 直观 | 同时间多事件和时钟问题 |
| time bucket | 与时间窗口聚合自然结合 | 粒度较粗 |

恢复流程应该是：

~~~text
保存最后进度
    ↓
连接中断
    ↓
新连接 authenticate(cursor)
    ↓
服务端判断 cursor 是否仍可恢复
    ↓
Replay
    ↓
Replay Complete
    ↓
Live
~~~

QHZHC 使用自然秒 `bucketStartMs` 作为恢复游标。

客户端重新认证时提交 `resumeFromBucketStartMs`，服务端从这个时间位置恢复到最新已完成自然秒。

对当前“按自然秒发布遥测数据”的业务来说，这个游标与数据模型一致；如果以后要求逐点严格连续，则 sequence / offset 会比时间窗口更适合作为主游标。

---

### 【Replay 和 Live 最好形成明确阶段】

如果服务端重连后同时发送历史补发和最新实时数据：

~~~text
10:05 replay
10:08 live
10:06 replay
10:09 live
10:07 replay
~~~

客户端就不得不额外做排序、缓存和去重。

更简单的协议设计是：

~~~text
Authenticate
    ↓
Welcome
    ↓
Replay historical data
    ↓
Replay Complete
    ↓
Live
~~~

QHZHC 在 replay 期间会把连接标记为 replaying，普通实时广播跳过该连接；补发完成后发送 `replay_complete`，再恢复 live。

这里的设计价值并不是“多一个消息类型”，而是建立了一个清楚的阶段边界。

---

### 【No-data 和 Retention Gap 不是同一种空数据】

这两个状态很容易在恢复协议里被混淆。

No-data 表示：

~~~text
这个时间窗口存在
但业务本来没有数据
~~~

Retention Gap 表示：

~~~text
这个时间窗口原来可能有数据
但已经超过服务端留存范围
无法恢复
~~~

例如：

~~~text
requested = 10:00
earliest retained = 10:30
latest = 11:00
~~~

如果服务端直接查询 10:00～10:29，查不到就返回 no-data，客户端会误以为“这些时间本来没有数据”。

正确逻辑应该先判断：

~~~text
requested < earliest retained
        ↓
返回 unrecoverable gap
        ↓
告诉客户端 earliest / latest / recommended action
~~~

QHZHC 的协议已经存在 `gap` 消息，并携带 requested、earliest available、latest 和 skip-to-latest 等信息。

但当前实现仍有一个值得继续修正的边界：

> 如果 requested 早于实际 retention，而总 replay bucket 数没有超过 replay 上限，当前逻辑仍可能把已经被清理的数据解释成 no-data。

因此这一点应标记为**已发现的协议语义问题**，而不是写成“当前已经完全解决”。

---

### 【WebSocket 有序传输不等于应用层 Exactly-once】

WebSocket 基于 TCP，单条连接内能够保持字节流顺序；但这并不能回答几个更高层的问题：

~~~text
server.send()
是否代表浏览器已经收到？

message event
是否代表业务已经处理？

业务处理
是否已经持久化？

断线前最后一条
客户端究竟处理到了哪一步？
~~~

如果系统需要更强的可靠语义，就需要 Application ACK（应用层确认）。

ACK 可以定义在不同阶段：

| ACK 时机 | 能表达的进度 |
| --- | --- |
| 收到消息 | 网络接收完成 |
| 放入本地可靠队列 | 已进入消费范围 |
| 业务处理完成 | 应用消费完成 |
| 持久化完成 | 数据状态已落盘 |

但 ACK 本身仍不能自动实现 Exactly-once（精确一次）。重试会带来重复，还需要幂等键、去重状态或事务语义共同保证。

QHZHC 当前**没有应用层 ACK**。

客户端收到 `telemetry_second` 后就推进自然秒 cursor，并把数据加入帧队列。因此当前能力更准确的描述是：

> **基于客户端接收进度的断线续传。**

它适合当前实时可视化场景，但不能把它包装成逐点 Exactly-once。

如果未来进入交易、计费或不可丢事件场景，ACK 的阶段、幂等键和持久化语义都要重新定义。

---

### 【Replay 必须配合去重或幂等】

恢复系统通常宁愿：

~~~text
不确定是否收到
→ 再发一次
~~~

也不愿：

~~~text
不确定
→ 直接跳过
~~~

所以可恢复传输天然要考虑重复。

常见手段有：

- sequence 去重；
- eventId 去重；
- stable batchId；
- 幂等业务键；
- 保存最近确认窗口。

QHZHC 每个自然秒消息包含稳定 `batchId`，同一 robotId、bucketStartMs 和采样档位使用稳定采样；客户端也会忽略早于 expected cursor 的旧自然秒。

当前去重语义主要围绕**自然秒窗口**，并不是严格逐点 ACK / dedupe 协议。

---

## 6. 安全、监控和测试决定方案能否进入生产环境

最后一层不是再增加一种恢复算法，而是确保前面的机制能够被约束、观察和验证。

### 【HTTP CORS 不能替代 WebSocket Origin 校验】

很多 Node.js 项目会把普通 HTTP 请求交给 Express，但 WebSocket Upgrade 直接监听原始 HTTP Server：

~~~text
HTTP API
→ Express Middleware
→ CORS

WebSocket
→ server.on("upgrade")
→ handleUpgrade
~~~

因此 HTTP CORS 不会自动变成 WebSocket Origin 校验。

OWASP 建议 WebSocket 握手显式校验 Origin allowlist，特别是使用 Cookie 自动认证时，以降低 Cross-Site WebSocket Hijacking（跨站 WebSocket 劫持，CSWSH）风险。[[5]](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

QHZHC 当前：

- HTTP CORS 在 `QHZHC_Server/src/server/cors.ts`；
- WebSocket Upgrade 在 `robot-socket-hub.ts`；
- WebSocket 身份主要依赖首包 Access Token，而不是 Cookie 自动认证。

所以当前的直接 CSWSH 风险比纯 Cookie WebSocket 更低，但 WebSocket Upgrade 仍建议增加独立 Origin allowlist，不能把 HTTP CORS 当作已经覆盖。

---

### 【认证成功以后，消息仍然是不可信输入】

生产 WebSocket 的入站安全至少要覆盖：

~~~text
Authenticated Socket
      ↓
Payload Size
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

这些层次解决的问题不同：

- Payload Size：避免超大消息拖垮内存。
- Schema：阻止非法结构进入业务。
- State：限制某类消息在哪个阶段可以出现。
- Authorization：限制合法用户的资源边界。
- Rate Limit：限制合法连接的滥用和洪泛。

QHZHC 当前已经具备：

- JSON parse；
- 消息类型 / 字段校验；
- protocolVersion；
- 认证前后的状态约束；
- 服务端发送侧 `bufferedAmount` 背压保护。

仍可继续补齐：

- WebSocket Origin allowlist；
- 单用户 / IP 连接限额；
- 明确消息速率限制；
- `maxPayload` 策略；
- robotId 资源级 Authorization。

这些属于“项目下一层工程化边界”，不能写成当前已经实现。

---

### 【可观测性要回答恢复是否成功，而不只是有多少连接】

实时系统稳定性最值得观察的不是“从来不掉线”，而是：

~~~text
为什么掉？
多久恢复？
恢复以后数据完整吗？
~~~

指标可以按链路组织：

| 链路 | 建议指标 |
| --- | --- |
| 建连 | connect latency、upgrade failure、auth failure |
| 在线 | active connections、heartbeat RTT、stale count |
| 会话恢复 | refresh success、refresh latency、family revoke |
| 重连 | reconnect attempts、backoff duration |
| 数据恢复 | replay count、replay duration、gap count |
| 端到端 | close → live duration |

QHZHC 已经接入 browser-monitor SDK，因此 WebSocket 生命周期可以进一步沉淀为自定义事件，例如：

~~~text
websocket.connect
websocket.close
auth.refresh
websocket.reconnect
replay.start
replay.complete
replay.gap
~~~

这样才能把“恢复机制已经写了”升级成“恢复能力可以被量化验证”。

同时日志必须避免记录：

- Access Token；
- Refresh Token；
- Cookie；
- authenticate 原始载荷。

---

### 【测试重点应该落在异常状态迁移】

WebSocket + 鉴权最容易出现问题的不是 Happy Path，而是多个异步状态叠加。

测试最好围绕四类故障组织：

~~~text
身份
├─ missing / invalid / expired token
├─ revoked family
└─ refresh reuse

协议状态
├─ auth timeout
├─ message before auth
├─ duplicate auth
└─ protocol mismatch

连接恢复
├─ network failure
├─ service restart
├─ token expires online
├─ refresh failure
└─ offline / online

数据恢复
├─ cursor
├─ replay
├─ duplicate
├─ no-data
├─ gap
└─ retention exceeded
~~~

QHZHC 当前已有的测试包括：

- `QHZHC_Server/tests/auth-tokens.test.ts`：Rotation、reuse、revoke；
- `QHZHC_Server/tests/websocket.test.ts`：认证顺序、无效 Token、Replay；
- `QHZHC_Web/tests/unit/realtimeClient.spec.js`：
  - Token 过期后 refresh；
  - 使用同一 cursor 重连；
  - refresh 失败停止恢复；
  - no-data 推进 cursor；
  - Gap 后请求补发。

后续比较值得补的是：

- Origin 拒绝；
- auth timeout；
- retention gap 精确语义；
- 多 Tab 并发刷新；
- 消息限流和 maxPayload；
- 如果实现主动 revoke，则增加在线踢线测试。

---

## 7. 面试和答辩可以沿三层体系展开

这套知识最终可以收束成一张树：

~~~text
WebSocket 实时系统
│
├─ 可信连接
│   ├─ HTTP Upgrade
│   ├─ Application Authentication
│   ├─ Authentication
│   ├─ Authorization
│   ├─ Connection Binding
│   ├─ Protocol Version
│   └─ Origin / Input Security
│
├─ 稳定连接
│   ├─ Access Token + Refresh Token
│   ├─ Token Family
│   ├─ Refresh Rotation
│   ├─ Single Flight
│   ├─ Session Revalidation
│   ├─ Ping / Pong
│   ├─ Data Watchdog
│   ├─ Close Classification
│   └─ Backoff + Jitter
│
└─ 可恢复数据
    ├─ Recovery Cursor
    ├─ Gap Detection
    ├─ Replay
    ├─ Replay / Live Boundary
    ├─ Dedupe / Idempotency
    ├─ Retention Boundary
    └─ ACK / Delivery Semantics
~~~

这三层分别回答：

- **可信连接**：谁可以建立什么连接。
- **稳定连接**：连接和登录会话失效以后如何安全回来。
- **可恢复数据**：重新连上以后如何继续，而不是从“现在”重新开始。

如果答辩中需要用一段话概括，可以这样组织：

> 项目的 WebSocket 链路不是简单的断线重连。建连以后先用短期 Access Token 完成应用层认证并绑定资源；Access Token 和长期 Refresh Token 分工，Refresh Token 通过 Rotation 和 Token Family 支持续期与撤销。连接在线期间同时做协议心跳、应用心跳和业务数据 Watchdog，断开后按照关闭原因决定刷新凭证、退避重连还是停止。重新连接时再携带自然秒恢复游标，先 Replay 缺失数据，再切回 Live。当前项目没有应用层 ACK，所以能力边界是基于接收游标的断线续传，而不是 Exactly-once。

继续追问通常会落到这些问题：

1. WebSocket OPEN 为什么不等于业务连接可用？
2. 浏览器为什么不能像 Axios 一样直接加 Authorization Header？
3. JWT 已经有 exp，为什么还需要 Token Family？
4. Refresh Rotation 为什么会引出 Single Flight？
5. WebSocket 在线期间 Token 过期怎么办？
6. 协议 Ping/Pong、应用心跳和数据 Watchdog 有什么区别？
7. 为什么不同 Close Code 不能统一无限重连？
8. Backoff 为什么还需要 Jitter？
9. 重连以后如何知道从哪里继续？
10. WebSocket 基于 TCP，为什么还可能需要 ACK？
11. no-data 和 retention gap 为什么必须分开？
12. HTTP 已经有 CORS，为什么 WebSocket 还要单独检查 Origin？

---

## 8. 当前项目能力与后续边界

为了避免把“主流方案”说成“已经实现”，当前状态统一如下：

| 能力 | 项目现状 | 可继续演进 |
| --- | --- | --- |
| WebSocket 认证 | 首条 Access Token 消息 | Upgrade Origin + 未认证连接限额 |
| HTTP / WS 身份 | 共用 Access JWT | 保持统一 |
| Session 撤销 | Token Family + 周期重验 | revoke 时主动踢线 |
| Refresh | Rotation + 单 Tab Single Flight | 跨 Tab 协调 |
| 心跳 | 协议 + 应用 + 数据 Watchdog | RTT 与 timeout 指标 |
| 重连 | Backoff + Jitter | 增加恢复 SLI |
| 数据游标 | 自然秒 bucket | 严格场景改 sequence / offset |
| Replay | Replay 与 Live 分阶段 | 修正 retention gap 边界 |
| ACK | 未实现 | 强可靠场景再引入 |
| 资源授权 | 身份 + robotId 一致性 | 细粒度 Resource Authorization |
| WebSocket Origin | 未独立校验 | Upgrade 阶段显式 allowlist |

这个表不是“待办清单”，而是用来建立答辩边界：**哪些是当前代码已经证明的能力，哪些是根据主流工程方案推导出的下一步。**

---

## 9. 参考资料

1. [[1] RFC 6455 — The WebSocket Protocol, RFC Editor](https://www.rfc-editor.org/rfc/rfc6455)
2. [[2] MDN — WebSocket() constructor](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket)
3. [[3] RFC 7519 — JSON Web Token (JWT), RFC Editor](https://www.rfc-editor.org/rfc/rfc7519)
4. [[4] RFC 9700 — Best Current Practice for OAuth 2.0 Security, RFC Editor](https://www.rfc-editor.org/rfc/rfc9700)
5. [[5] OWASP — WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)

### 【Full-Stack-AI-NOTES 相关知识】

- `11-Websocket从0到1.md`：WebSocket 协议、生命周期、心跳和重连基础。
- `Web身份认证会话控制与访问控制体系.md`：Authentication → Session Management → Authorization。
- `Access Token与Refresh Token核心知识点笔记.md`：双 Token、Rotation、Reuse Detection 与过期策略。
- `反向代理与Web入口体系.md`：生产环境入口、TLS、Proxy 与网络边界。

### 【项目源码证据】

- `../QHZHC_Server/src/server/auth.ts`
- `../QHZHC_Server/src/server/database.ts`
- `../QHZHC_Server/src/server/app.ts`
- `../QHZHC_Server/src/server/robot-socket-hub.ts`
- `../QHZHC_Server/src/shared/protocol.ts`
- `../QHZHC_Web/src/services/accessToken.ts`
- `../QHZHC_Web/src/services/httpAuth.ts`
- `../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts`
- `../QHZHC_Web/src/views/DataVisualization/services/realtimeConnectionPolicy.ts`
- `../QHZHC_Server/tests/auth-tokens.test.ts`
- `../QHZHC_Server/tests/websocket.test.ts`
- `../QHZHC_Web/tests/unit/realtimeClient.spec.js`
