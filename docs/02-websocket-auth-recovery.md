# 02 WebSocket 鉴权与可恢复实时连接

> 本文梳理实时系统中 WebSocket、身份认证、会话续期、连接保活、故障重连与数据恢复的完整知识框架。
>
> 知识主体以通用协议、认证模型和工程设计原则展开；QHZHC 作为贯穿示例，用真实实现帮助理解设计取舍。`docs/history` 只作为历史线索，不作为当前实现事实来源。

## 一、稳定实时连接不是“WebSocket 连上了”，而是多个状态同时成立

WebSocket（全双工长连接协议）只解决“建立一条可以持续双向传输的连接”。一个真正可用的实时系统，还需要同时满足身份、会话、存活和恢复条件。

可以把实时链路的可用性拆成六个问题：

~~~text
Transport
连接是否建立
        ↓
Authentication
对端身份是否可信
        ↓
Authorization
这个身份是否有权订阅当前资源
        ↓
Liveness
连接是否仍然真正可用
        ↓
Recovery
连接断开以后能否重新建立
        ↓
Data Continuity
重新建立以后数据能否从正确位置继续
~~~

因此要区分三个容易混淆的结论：

~~~text
WebSocket OPEN
≠ 已完成身份认证

重新连接成功
≠ 会话恢复成功

会话恢复成功
≠ 断线期间的数据已经恢复完整
~~~

这也是本章的主线：

~~~text
协议连接
→ 身份可信
→ 会话持续
→ 存活探测
→ 故障分类
→ 受控重连
→ 数据续传
~~~

### 项目示例：QHZHC

QHZHC 的实时页面并没有把 `open` 事件当成“业务连接已经可用”。协议升级完成后，客户端还要发送认证消息；服务端认证成功并返回 welcome 以后，连接才进入实时业务状态。

这说明一个通用原则：

> 长连接必须设计业务状态机，不能只依赖 WebSocket 原生的 CONNECTING / OPEN / CLOSING / CLOSED 四种网络状态。

### 答辩关注点

如果被问“WebSocket 连接成功是不是就可以开始推数据”，应先回答：不能。连接成功只代表协议层建立完成，还需要完成身份认证、资源授权和业务协议初始化。

---

## 二、HTTP Upgrade 握手与业务鉴权握手是两个不同阶段

WebSocket 建立时首先经历 HTTP Upgrade（协议升级）。客户端发送 HTTP 请求，请求升级到 WebSocket；服务端接受后返回 `101 Switching Protocols`，之后双方才使用 WebSocket 帧通信。

RFC 6455 定义的核心关系可以理解为：

~~~text
HTTP 请求
        ↓
Upgrade: websocket
        ↓
101 Switching Protocols
        ↓
WebSocket 帧协议
~~~

这里必须区分两种经常都被叫作“握手”的过程。

| 阶段 | 解决的问题 | 是否证明用户身份 |
| --- | --- | --- |
| HTTP Upgrade 握手 | 能否把 HTTP 连接升级成 WebSocket | 否 |
| 应用层认证握手 | 当前 WebSocket 对端是谁、是否允许进入业务状态 | 是 |

协议升级成功只说明：

~~~text
网络路径可用
协议协商成功
WebSocket 可以收发帧
~~~

它不会自动完成 Authentication（身份认证）和 Authorization（授权）。

官方资料：

- RFC 6455 WebSocket Protocol：https://www.rfc-editor.org/rfc/rfc6455
- MDN WebSocket：https://developer.mozilla.org/zh-CN/docs/Web/API/WebSocket

### 项目示例：QHZHC

QHZHC 当前使用 `WebSocketServer({ noServer: true })` 接管 HTTP Server 的 `upgrade` 事件。路径匹配后先完成协议升级，但连接此时仍未被业务信任。

随后服务端等待客户端发送第一条 `authenticate` 消息，并设置约 5 秒认证超时。未认证状态下发送其他业务消息，会被按协议错误关闭。

所以当前项目实际状态是：

~~~text
HTTP Upgrade 成功
        ↓
WebSocket 已 OPEN
        ↓
AUTH_PENDING
        ↓
authenticate
        ↓
AUTHENTICATED
        ↓
业务数据
~~~

### 工程规范

代码和文档里最好明确区分：

- `upgrade handshake`：协议握手；
- `authentication handshake`：应用认证。

这样可以避免把“协议成功”误认为“身份成功”。

---

## 三、Authentication、Authorization 和 Connection Binding 必须分开设计

实时系统的安全边界至少有三层。

### 【Authentication：你是谁】

身份认证回答：

~~~text
这条连接代表哪个用户或客户端
~~~

典型依据包括 Session、Access Token、JWT、客户端证书等。

### 【Authorization：你能做什么】

授权回答：

~~~text
这个身份是否有权订阅某个设备
是否可以发送某类命令
是否可以访问某个房间 / Topic / Tenant
~~~

认证成功不意味着拥有全部资源权限。

### 【Connection Binding：这条连接当前代表什么上下文】

认证后通常还需要把业务上下文绑定到连接，例如：

~~~text
principal
roles / permissions
tenantId
subscription
deviceId
protocolVersion
connectionId
~~~

后续消息处理不能再次信任客户端自报身份，而应该使用已经绑定并验证过的连接上下文。

### 项目示例：QHZHC

QHZHC 在认证成功后把用户主体、Access Token、机器人订阅和每秒数据档位绑定到服务端连接上下文。

同时还会校验 URL 中的机器人标识与认证报文中的机器人标识一致，避免同一连接在初始化阶段声明两个不同目标。

但从当前活动代码看，项目的 WebSocket 授权仍主要停留在“身份有效 + 订阅标识一致”，没有形成更细粒度的“用户是否有权访问某机器人”的资源授权策略。

因此如果以后进入多机器人、多租户或不同角色权限场景，还应该增加：

~~~text
Authenticated Principal
        ↓
Resource Authorization
        ↓
Subscription Binding
~~~

而不是把“JWT 校验通过”当成完整授权。

### 答辩关注点

如果被问“JWT 验证通过以后是不是就安全了”，应回答：JWT 只能证明当前凭证代表谁以及凭证是否有效，具体资源是否允许访问仍然需要授权判断。

---

## 四、浏览器 WebSocket 鉴权的难点来自凭证如何安全进入连接

浏览器原生 `WebSocket()` 构造器主要接收 URL 和可选子协议，不能像普通 `fetch` / Axios 请求一样自由设置 `Authorization` Header。

因此浏览器 WebSocket 常见鉴权方式有几类。

| 方式 | 优点 | 主要风险 / 限制 |
| --- | --- | --- |
| Cookie 自动携带 | 与现有 Session 体系集成简单 | 浏览器自动发送，必须防 CSWSH / Origin 问题 |
| URL Query Token | 实现简单 | Token 可能进入日志、代理、监控和 URL 记录 |
| WebSocket Subprotocol 携带 | 可用于特定协议协商 | 容易滥用协议字段，不适合随意塞长期凭证 |
| 首条消息认证 | Token 不进入 URL，协议可自定义 | 未认证连接已经占用 socket，需要超时和连接限额 |
| 自定义 Authorization Header | 语义最清晰 | 浏览器原生 API 不支持，主要适合 Node / 原生客户端 |

官方浏览器构造器接口：

- MDN WebSocket constructor：https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket

### 首条消息认证的工程含义

首条消息认证并不是“没有握手认证”，而是把认证放到了协议升级之后的应用层。

因此必须额外设计：

~~~text
认证超时
未认证状态消息白名单
重复认证保护
未认证连接数量限制
消息大小限制
认证失败关闭语义
~~~

否则攻击者可以建立大量 WebSocket 后什么也不做，持续占用服务端连接资源。

### 项目示例：QHZHC

QHZHC 选择的是：

~~~text
Access Token
保存在页面内存
        ↓
WebSocket OPEN
        ↓
作为第一条 authenticate 消息发送
        ↓
服务端校验
~~~

相比把 Token 放在 URL 中，这样可以避免凭证直接出现在 WebSocket URL、反向代理访问日志和常见 URL 采集链路里。

同时服务端用认证超时和“认证前只允许 authenticate”限制未授权连接。

生产环境还必须使用 WSS（WebSocket over TLS），否则首包中的 Access Token 仍可能在传输链路上被窃听。

### 安全边界

首包认证降低了 URL 泄漏风险，但不等于 Token 对 XSS 安全。只要 Access Token 存在 JavaScript 内存中，页面发生可执行脚本注入时仍可能被读取。

所以凭证位置只能减少攻击面，不能替代 CSP、输入输出编码和 XSS 防护。

---

## 五、Access Token 与 Refresh Token 的职责必须拆开

实时长连接会遇到一个典型矛盾：

~~~text
Access Token 生命周期短
→ 泄漏窗口更小

但 WebSocket 生命周期可能很长
→ 连接可能活得比 Access Token 更久
~~~

因此更合理的会话模型通常把高频访问凭证和低频续签凭证拆开。

### 【Access Token】

主要职责：

- 访问业务 API；
- 建立 WebSocket 身份；
- 生命周期短；
- 高频使用。

### 【Refresh Token】

主要职责：

- 不直接访问业务资源；
- 只用于换取新的 Access Token；
- 生命周期更长；
- 应减少暴露给 JavaScript 和业务接口。

浏览器应用常见的安全折中是：

~~~text
Access Token
→ 仅保存在页面内存

Refresh Token
→ HttpOnly + Secure + SameSite Cookie
~~~

这样即使长期刷新凭证存在浏览器中，JavaScript 也不能直接读取它。

### 项目示例：QHZHC

QHZHC 当前采用的就是这种职责拆分：

~~~text
登录成功
        ↓
响应体返回短期 Access Token
→ 前端内存保存

Set-Cookie 返回 Refresh Token
→ HttpOnly Cookie
→ Path 限制在 /api/auth
~~~

HTTP API 使用 Bearer Access Token；WebSocket 首包同样使用这张 Access Token，因此 HTTP 与实时连接共享同一身份来源。

这比“HTTP 用一套 Session，WebSocket 再单独发另一种 Token”更容易保持身份语义一致。

### Cookie 工程注意点

QHZHC 当前根据 `request.secure` 决定 Refresh Cookie 是否带 `Secure`。

如果生产环境在 Caddy / Nginx / Load Balancer 终止 TLS，而 Node.js 只接收到内部 HTTP，则必须确认 Express 的代理信任配置能够正确识别原始 HTTPS；否则需要显式配置安全 Cookie 策略。

这说明 Cookie 安全不只是代码参数，还与反向代理拓扑有关。

---

## 六、JWT 可以自包含，但真正可撤销的会话通常仍然需要服务端状态

JWT（JSON Web Token）经常被简单描述成“无状态 Token”，但工程上需要进一步区分：

~~~text
JWT 本身是否自包含
和
整个会话系统是否无状态
~~~

一个 JWT 可以携带：

- subject：主体；
- issuer：签发方；
- audience：目标服务；
- expiration：过期时间；
- jti：Token 唯一 ID；
- role / scope：权限声明。

服务端仅验证签名和 `exp` 时，确实可以做到完全不查询会话数据库。

但这样会带来一个问题：

~~~text
JWT 尚未过期
用户却已经退出 / 被封禁 / 会话被撤销
~~~

如果没有服务端状态，旧 Token 仍可能继续使用到自然过期。

因此很多系统采用 Hybrid Session（混合会话）思想：

~~~text
JWT
负责快速表达身份
        +
服务端 Session / Token Family 状态
负责撤销与风险控制
~~~

### 项目示例：QHZHC

QHZHC 的 Access Token 是 JWT，并校验：

~~~text
签名算法
issuer
audience
subject
jti
sid
expiration
~~~

其中 `sid` 指向当前 Refresh Token Family。服务端验证 Access Token 时还会查询这个 family 是否仍然活跃。

因此 QHZHC 的认证不是纯无状态 JWT，而是：

> 自包含 Access JWT + 服务端可撤销 Token Family。

这样用户退出时撤销 family 后，尚未自然过期的 Access Token 也会在后续校验中失效。

### 答辩关注点

如果被问“JWT 最大优势是不是服务端完全无状态”，不应该绝对回答“是”。更准确的说法是：JWT 支持无状态验证，但如果系统需要立即撤销、设备会话管理、重放检测等能力，通常仍会引入服务端会话状态。