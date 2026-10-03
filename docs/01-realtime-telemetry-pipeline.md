# 01 实时遥测数据链路：从数据库提交到浏览器分帧渲染

> 本文只以当前活动源码、测试代码和官方规范为事实依据。<code>docs/history</code> 仅用于发现需要核对的问题，不作为实现事实引用。旧 Django、旧 Python 与 <code>legacy-reference</code> 也不属于当前运行时。

## 一、先建立总模型：这不是一个 WebSocket 功能，而是一条受吞吐量约束的数据流水线

QHZHC 的实时数据功能不能只理解成“服务端通过 WebSocket 推数据给前端”。真正的问题是：**一批遥测数据从产生、提交、按时间分桶、通过长连接传输，到浏览器最终完成地图与图表更新，中间每一层都可能出现速度不匹配、断线、过期、积压和恢复。**

当前活动链路可以还原为：

~~~mermaid
flowchart LR
    A[TelemetrySimulator / 真实采集源] --> B[AppDatabase<br/>SQLite WAL]
    B --> C[TelemetryStreamService<br/>按自然秒读取已提交数据]
    C --> D[RobotSocketHub<br/>鉴权 / 抽样 / live / replay]
    D --> E[WebSocket]
    E --> F[RealtimeClient<br/>连接状态机 / 缺口检测]
    F --> G[FrameTelemetryQueue<br/>rAF 分帧消费]
    G --> H[dataVisualization.vue<br/>Vue 状态编排]
    H --> I[ECharts]
    H --> J[OpenLayers 2D]
    H --> K[Cesium 3D]

    L[RafPerformanceMonitor<br/>FPS / frame interval] --> M[AdaptiveRenderController]
    H --> M
    G --> M
    M -->|调整 maxPerFrame| G
    M -->|调整 maxPointsPerSecond<br/>触发重连| D

    F -->|resend_time_range| D
    D -->|replay| F
~~~

对应源码：

| 层 | 当前活动模块 | 解决的问题 |
| --- | --- | --- |
| 数据产生 | [simulator.ts](../QHZHC_Server/src/server/simulator.ts) | 以 1 / 5 / 10 / 20 点每秒模拟真实数据压力 |
| 持久化 | [database.ts](../QHZHC_Server/src/server/database.ts) | 事务写入、全局 sequence、时间查询、留存淘汰 |
| 实时分桶 | [telemetry-stream.ts](../QHZHC_Server/src/server/telemetry-stream.ts) | 把数据库记录组织成自然秒数据桶 |
| WebSocket 服务 | [robot-socket-hub.ts](../QHZHC_Server/src/server/robot-socket-hub.ts) | 鉴权、心跳、抽样、实时广播、补发、发送侧背压 |
| 协议 | [protocol.ts](../QHZHC_Server/src/shared/protocol.ts) | 定义客户端与服务端消息及协议版本 |
| 浏览器连接 | [realtimeClient.ts](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts) | 建连、恢复、缺口检测、重连、客户端心跳 |
| 浏览器调度 | [FrameTelemetryQueue.ts](../QHZHC_Web/src/views/DataVisualization/services/FrameTelemetryQueue.ts) | 把“网络收到数据”和“页面渲染数据”解耦 |
| 自适应控制 | [AdaptiveRenderController.ts](../QHZHC_Web/src/views/DataVisualization/services/AdaptiveRenderController.ts) | 根据队列和渲染压力动态调节消费量与输入量 |
| 页面落地 | [dataVisualization.vue](../QHZHC_Web/src/views/DataVisualization/dataVisualization.vue) | 折线图、二维地图、三维地图、详情和天气的状态编排 |

理解这条链路时，最重要的不是记类名，而是先记住三个速率：

~~~text
生产 / 入库速率 λ_store
        ↓
网络实际下发速率 λ_net
        ↓
浏览器实际渲染消费速率 μ_render
~~~

只要在持续时间足够长的窗口内满足：

~~~text
μ_render >= λ_net
~~~

客户端队列才可能稳定。如果长期满足：

~~~text
μ_render < λ_net
~~~

那么无论 WebSocket 本身多快，积压最终都会增长。QHZHC 的自适应机制本质上就是在解决这个速率平衡问题。

MDN 明确指出，经典 <code>WebSocket</code> API 本身没有自动 Backpressure（背压）机制；消息到达速度超过应用处理速度时，应用可能积压内存或占满 CPU。因此，QHZHC 必须在应用层自己控制“服务端能发多少”和“浏览器每帧能吃多少”。

官方依据：[MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

---

## 二、数据先提交到数据库，再进入实时链路，数据库是恢复事实源

### 【当前实现】

服务启动时，各模块不是“模拟器直接调用 WebSocket”，而是通过数据库隔离：

~~~text
TelemetrySimulator
    ↓ insertTelemetry()
SQLite
    ↓ 每个自然秒结束后查询
TelemetryStreamService
    ↓ publish(bucket)
RobotSocketHub
~~~

入口组装见 [index.ts](../QHZHC_Server/src/server/index.ts)。

<code>insertTelemetry()</code> 会先开启写事务，再逐点插入：

~~~text
BEGIN IMMEDIATE
  INSERT telemetry(...)
  INSERT telemetry(...)
  ...
COMMIT
~~~

每个记录由 SQLite 的自增主键得到全局 <code>sequence</code>。批次写入成功后才返回；失败则整批回滚。

SQLite 当前启用了：

~~~text
journal_mode = WAL
synchronous = NORMAL
foreign_keys = ON
~~~

WAL（Write-Ahead Logging，预写日志）允许读事务与写事务并行进行，但 SQLite 仍然只有一个写事务能够同时推进；<code>BEGIN IMMEDIATE</code> 会立即申请写事务。这与当前“单机、轻量实时平台”的规模是匹配的，而不是通用的高并发数据库方案。

官方依据：

- [SQLite WAL](https://www.sqlite.org/wal.html)
- [SQLite Transaction](https://www.sqlite.org/lang_transaction.html)

### 【为什么不让模拟器写完就直接 publish】

如果生产者直接把刚生成的数据推给 WebSocket，链路会变成：

~~~text
生产者
 ├─ 写数据库
 └─ 推 WebSocket
~~~

这会制造两个事实源：数据库成功与否是一套状态，WebSocket 是否已经发出又是一套状态。

当前实现改成：

~~~text
生产者 → 数据库提交
          ↓
     实时服务再查询数据库
          ↓
       WebSocket
~~~

因此，实时发送和断线补发都从同一张 <code>telemetry</code> 表读取。模拟器以后换成真实设备采集时，只要仍然写入同一数据边界，后续实时链路不需要理解“数据究竟是谁产生的”。

这是一条重要的架构边界：

> **生产者负责产生并提交事实；实时服务负责读取已提交事实并传播。**

### 【自然秒为什么成为协议单位】

<code>TelemetryStreamService</code> 不是每插入一个点就发一次，而是按自然秒处理：

~~~text
12:00:01.000 ───────────── 12:00:02.000
          这一秒内产生 N 个点

到 12:00:02 后：
查询 [12:00:01.000, 12:00:02.000)
          ↓
形成 telemetry_second
~~~

一个桶包含：

| 字段 | 含义 |
| --- | --- |
| <code>bucketStartMs</code> | 自然秒起点 |
| <code>bucketEndMs</code> | 起点 + 1000 ms |
| <code>status</code> | 该秒是 <code>live</code> 还是 <code>no-data</code> |
| <code>points</code> | 该秒内按 sampledAt、sequence 排序的数据 |

因此实时恢复的最小协议单位不是“第 N 个 WebSocket 包”，而是“第 N 个自然秒”。

### 【面试官为什么问这一层】

面试官真正想确认的是：你是否知道实时系统的数据一致性边界在哪里。

合格回答不能只说“我们用了 SQLite + WebSocket”，而应该说明：

> 当前项目采用 storage-first（先存储后传播）模型。模拟器先在事务中把一批遥测点提交到 SQLite，实时服务再按自然秒读取已提交数据形成数据桶，WebSocket 只传播数据库中已经存在的事实。这样 live 与 replay 共用同一事实源，生产者也能与传输层解耦。

答辩证明可以直接指向：

- [database.ts](../QHZHC_Server/src/server/database.ts) 的 <code>insertTelemetry()</code>
- [telemetry-stream.ts](../QHZHC_Server/src/server/telemetry-stream.ts) 的 <code>readBucket()</code>
- [index.ts](../QHZHC_Server/src/server/index.ts) 的 publisher 连接关系

---

## 三、当前恢复语义已经从“sequence + ACK”收敛成“自然秒游标”

这是阅读项目时最容易答错的一点。

### 【当前协议没有应用层 ACK】

当前 <code>protocol.ts</code> 中客户端只会发送三类消息：

~~~text
authenticate
ping
resend_time_range
~~~

不存在 <code>ack</code>。

前端 <code>realtimeClient.ts</code> 采用：

~~~text
latestBatchStartMs
    ↓
下次连接时
resumeFromBucketStartMs = latestBatchStartMs + 1000
~~~

因此当前恢复语义是：

> **客户端记住自己最近已经接收并接受的自然秒，下次从下一个自然秒继续请求。**

<code>sequence</code> 仍然有价值：它是数据库中的稳定主键，也可以作为同一时间点排序的兜底；但它已经不是当前 WebSocket 恢复游标。

### 【为什么这比逐点 ACK 简单】

| 方案 | 恢复游标 | 服务端需要保存 ACK 状态 | 协议消息量 | 能否知道“客户端已渲染到哪个点” |
| --- | --- | --- | --- | --- |
| 逐点 / 批次 ACK | sequence 或 batch id | 通常需要 | 更高 | 可以设计成能知道 |
| 当前 QHZHC | 自然秒时间 | 不需要 | 更低 | 不能 |

当前项目选择的是第二种。

它的收益是状态机明显更轻：服务端不需要维护每个连接最后确认到哪个 sequence，也不需要处理 ACK 丢失、ACK 重复与确认窗口。

代价同样必须说清楚：

> 当前系统只能表达“客户端已经接收到哪个自然秒”，不能证明这一秒里的点已经真正完成地图绘制。

所以不能把当前实现描述为 Exactly-once Delivery（恰好一次投递），也不能声称存在“服务端基于 ACK 保证客户端一定已经消费”。

### 【当前缺口恢复不是严格逐秒无丢失】

收到普通实时桶时，客户端先计算：

~~~text
expected = latestBatchStartMs + 1000

missingBucketCount
  = (incomingBucketStartMs - expected) / 1000
~~~

当前触发补发的条件是：

~~~text
非 replay
并且 missingBucketCount >= 3
~~~

因此：

~~~text
期望 10 秒，实际来了 11 秒
→ missing = 1
→ 当前代码接受 11 秒，不请求补发 10 秒

期望 10 秒，实际来了 13 秒
→ missing = 3
→ 请求从 10 秒开始补发
~~~

这是当前源码事实。

所以答辩时准确表述应该是：

> 当前实现具有断线重放和较大时间缺口恢复能力，但缺口阈值设置为 3 个自然秒，并不是严格逐秒无丢失协议。如果业务要求所有秒桶必须连续，应把“是否补发”从阈值策略改为严格连续性校验，或明确业务上允许的小范围时间缺口。

这比说“我们保证不漏点”更可信。

---

## 四、WebSocket 连接不是一个布尔值，而是一套状态机

### 【服务端握手边界】

浏览器建立 WebSocket 后并没有立即获得实时数据权限。

~~~mermaid
stateDiagram-v2
    [*] --> TCP_Upgraded
    TCP_Upgraded --> WaitingAuth: accept + 5s timeout
    WaitingAuth --> AuthChecking: authenticate
    AuthChecking --> Replaying: token valid and history exists
    AuthChecking --> Live: token valid and no replay
    Replaying --> Live: replay_complete
    WaitingAuth --> Closed: timeout / invalid first message
    AuthChecking --> Closed: token invalid / robot mismatch
    Live --> Closed: timeout / token expiry / backpressure / network
~~~

关键约束：

1. URL 中的机器人 ID 是服务端连接上下文的主标识；
2. <code>authenticate.robotId</code> 必须与 URL 中的 robotId 一致；
3. 连接建立后 5 秒内必须完成认证；
4. 握手前只能发 <code>authenticate</code>；
5. 握手完成后不能再次发 <code>authenticate</code>；
6. Access Token 不只在第一次握手时校验，服务端心跳巡检仍会周期性重验。

这说明 WebSocket Upgrade（协议升级）只代表“连接建立”，不代表“业务身份已建立”。

### 【客户端关闭码决定恢复动作】

~~~text
4001 认证过期
  → 刷新 Access Token
  → 成功后立即用原时间游标重连
  → 刷新失败则结束会话

4003 无权限
4100 协议错误
  → stop
  → 不做无意义重试

其他断开
  → reconnect
  → 指数退避 + jitter
~~~

4000–4999 属于 RFC 6455 留给应用私有协议使用的关闭码区间，因此项目使用 4000、4001、4002、4003、4100、4500 表达业务状态符合协议用途。

官方依据：[RFC 6455 §7.4.2](https://www.rfc-editor.org/rfc/rfc6455#section-7.4.2)

### 【为什么需要指数退避和抖动】

客户端普通重连延迟为：

~~~text
ceiling = min(15s, 500ms × 2^attempt)
delay = max(250ms, random(0, ceiling))
~~~

指数退避避免服务故障期间客户端高频打重连；随机抖动避免多个客户端同时断线后在服务恢复瞬间同时重连形成惊群。

---

## 五、心跳解决“连接还在不在”，数据桶看门狗解决“业务流还在不在”

项目里有两个不同层面的存活问题，不能混成一个“心跳”。

### 【服务端：WebSocket 控制帧 Ping/Pong】

服务端每 8 秒巡检：

~~~text
上一轮 ping 是否收到 pong？
        +
30 秒内是否收到过任何应用消息 / pong？
        ↓
任一失败
        ↓
terminate()
~~~

RFC 6455 定义了 Ping 与 Pong 控制帧，Ping 可以用于 keepalive 或确认远端仍然可响应。

官方依据：[RFC 6455 §5.5.2–5.5.3](https://www.rfc-editor.org/rfc/rfc6455#section-5.5.2)

### 【客户端：应用层 JSON ping/pong】

浏览器端发送普通 JSON <code>ping</code>，服务端返回 JSON <code>pong</code>。客户端判断的不是“有没有收到 pong”，而是：

~~~text
距离任意入站消息的时间
> heartbeatInterval × 3
~~~

只要 telemetry 数据持续到达，连接就可以被认为仍然活跃。

### 【为什么还需要 bucket watchdog】

TCP / WebSocket 活着，不代表实时遥测业务一定正常：

~~~text
WebSocket 还连着
心跳也正常
但遥测生产 / 分桶 / publish 链路停了
~~~

因此客户端另外维护 <code>lastBucketSeenAt</code>，连续 3 秒收不到 <code>telemetry_second</code> 时主动把连接视作异常并重建。

服务端即使这一秒没有数据，也发送：

~~~text
status = no-data
points = []
~~~

所以：

~~~text
no-data
≠ 链路故障
≠ WebSocket 断线

no-data
= 这一自然秒已经被服务端处理，但没有遥测点
~~~

这让“数据为空”和“数据链路消失”成为两个可区分状态。

---

## 六、live 与 replay 使用同一种秒桶，并通过确定性抽样保持结果一致

服务端每条连接可以配置：

~~~text
maxPointsPerSecond = 0 / 1 / 2 / 5 / 10 / 20
~~~

0 表示这一秒全部发送。

### 【抽样不是简单取前 N 个点】

如果一秒有 20 个点、客户端只请求 5 个，服务端会：

1. 先按 <code>sampledAt</code> 和 <code>sequence</code> 排序；
2. 使用 <code>robotId + bucketStartMs + limit + sampledAt</code> 构造稳定哈希；
3. 按哈希选择固定数量；
4. 再按采样时间排序后发送。

因此，同一个机器人、同一秒、同一个 limit，无论首次 live 发送还是之后 replay，都会选到同一组点。

如果实时阶段随机选 A、D、H、K、P，重放时却随机变成 B、F、J、M、T，恢复后的轨迹语义会漂移。确定性抽样让重放具有可重复性。

### 【replay 时暂停普通 live 投递】

补发期间连接上下文设置 <code>replaying = true</code>，<code>publish()</code> 会跳过正在 replay 的连接，防止旧数据 replay 与新数据 live 交叉到达。补发完成后服务端发送 <code>replay_complete</code>，客户端退出 recovering 状态。

---

## 七、当前补发存在一个必须明确的留存边界

服务端默认只保留最近 100000 个遥测点，并在新数据提交后按 sequence 淘汰更早记录。

补发另有限制：

~~~text
MAX_REPLAY_BUCKETS = 5000
~~~

5000 个自然秒约等于 83 分 20 秒。

### 【已实现的超限处理】

如果请求补发的秒桶数量超过 5000，服务端返回：

~~~text
gap
action = skip-to-latest
~~~

客户端更新最新秒游标并继续实时链路。

这是“完整恢复”和“避免一次补发拖垮连接”之间的取舍。

### 【当前代码的真实缺口】

服务端会计算 <code>earliestTelemetryBucketStartMs</code>，但当前 <code>replayBuckets()</code> 是否进入 gap 的条件只有：

~~~text
bucketCount > MAX_REPLAY_BUCKETS
~~~

没有同时判断：

~~~text
fromBucketStartMs < earliestAvailableBucketStartMs
~~~

因此可能出现：

~~~text
客户端请求 10:00:00 开始补发
数据库最早只剩 10:10:00
请求总长度又没有超过 5000 秒
        ↓
10:00:00 ~ 10:09:59 查询不到记录
        ↓
readBucket() 返回 no-data
~~~

客户端无法知道这些桶是：

~~~text
A. 当时真的没有采集数据
还是
B. 曾经有数据，但已经被 retention 淘汰
~~~

这是当前实现的语义空洞。

后续收紧恢复语义时，优先改法是：

~~~text
if earliestAvailableBucketStartMs != null
   and fromBucketStartMs < earliestAvailableBucketStartMs
then
   sendGap(...)
   return
~~~

进一步可以扩展协议明确表达“不可恢复”，但这属于后续设计，不能描述成当前已实现能力。

### 【答辩怎么说】

> 当前补发用自然秒游标恢复，并限制单次最多 5000 个秒桶，避免长期断线把数据库扫描和 WebSocket 缓冲一次拉满。但目前 gap 判断主要覆盖“补发范围太长”，对“请求起点已经早于数据库最早留存时间”的区分还不完整，会把已淘汰秒误表示成 no-data。这是我会继续收紧的恢复语义边界。

---

## 八、背压不是一个队列，而是服务端发送侧和浏览器渲染侧两道保护

Backpressure（背压）的本质是：下游处理不过来时，上游不能继续无限制灌入。

### 【第一层：网络发送缓冲区积压】

服务端发送前检查 WebSocket 的 <code>bufferedAmount</code>：

~~~text
bufferedAmount > 2 MB
        ↓
close(1013, "client backpressure")
~~~

<code>bufferedAmount</code> 表示已经调用 send、但还没有真正传输到网络的字节数。它增长说明发送侧正在积压。

官方依据：[MDN WebSocket.bufferedAmount](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount)

这层保护的是：

~~~text
Node.js / WebSocket 发送队列
~~~

而不是浏览器地图绘制。

### 【第二层：浏览器已经收到，但页面来不及画】

浏览器收到 <code>telemetry_second</code> 后不直接在 <code>onmessage</code> 中完成地图和图表绘制：

~~~text
WebSocket message
    ↓
RealtimeClient
    ↓ enqueue(points)
FrameTelemetryQueue
    ↓ requestAnimationFrame
publishFrame(batch)
    ↓
dataVisualization.handleRealtimePacket
~~~

这样“网络接收速度”和“页面提交速度”被分离。

MDN 说明 <code>requestAnimationFrame()</code> 会在浏览器下一次重绘前执行回调，因此它适合作为逐帧 UI 工作的调度边界，而不是网络限流器。

官方依据：[MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

---

## 九、FrameTelemetryQueue 用“双上限”避免一帧吃太多工作

队列每一帧同时受两个条件约束：

~~~text
数量上限：batch.length < maxPerFrame
时间上限：本轮取点耗时 < budgetMs
~~~

默认：

~~~text
maxPerFrame = 1
budgetMs = 5
~~~

核心逻辑：

~~~text
while (
  还有点
  && batch.length < maxPerFrame
  && (batch 为空 || now - startedAt < 5ms)
) {
  取一个点
}
~~~

其中 <code>batch.length === 0</code> 很关键：即使时间预算在第一次测量时已经超出，也至少消费一个点，避免永久饥饿。

### 【pause 与 stop 是两种不同语义】

<code>pause()</code> 取消当前 rAF，但保留 queue 与 cursor，用于临时断线、页面隐藏和恢复过程。

<code>stop()</code> 则取消 rAF、清空队列和计数，用于真正离开页面或销毁实时客户端。

如果断线时直接 stop，尚未画完的已接收数据会被本地丢掉。当前实现选择 pause，说明“网络连接状态”和“本地待渲染状态”是两个生命周期。

### 【为什么不能把 rAF 理解成自动 60 FPS】

<code>requestAnimationFrame</code> 的回调频率通常跟随屏幕刷新率，但后台标签页通常会暂停或降低 rAF 调度。因此项目在页面隐藏时主动暂停队列并关闭实时连接，重新可见后再从时间游标恢复，是对浏览器调度现实的适配。

官方依据：

- [MDN requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

---

## 十、maxPointsPerSecond 与 maxPerFrame 是两条完全不同的控制线

~~~text
服务端输入控制
maxPointsPerSecond
        ↓
WebSocket 每秒最多发多少点
        ↓
客户端队列
        ↓
maxPerFrame
浏览器每帧最多提交多少点
~~~

| 对比 | maxPointsPerSecond | maxPerFrame |
| --- | --- | --- |
| 控制对象 | 服务端每秒实际下发量 | 浏览器每一帧消费量 |
| 所属层 | 网络 / 订阅 | 本地调度 / 渲染 |
| 当前档位 | 0、1、2、5、10、20 | 运行时整数，自动模式最大 50 |
| 修改方式 | 修改后关闭旧连接并重新 authenticate | 直接热更新队列 |
| 是否需要重连 | 是 | 否 |
| 主要目标 | 减小进入浏览器的数据压力 | 提高队列排空能力 |
| 代价 | 降低实时点密度 | 单帧工作量可能增加 |

例如：

~~~text
arrivalRate = 20 点/s
actualFps = 10 FPS
maxPerFrame = 1

理论最大消费 ≈ 10 点/s
=> 每秒约新增 10 个待处理点
~~~

把 <code>maxPerFrame</code> 改成 3 后理论上限约 30 点/s，队列有机会追上。

但如果一次提交 3 个点让地图操作变得更昂贵，使 FPS 继续下降，那么“批量加大”会进入另一种过载。因此 batch 必须与真实渲染成本一起判断。

---

## 十一、自适应控制器本质上是反馈控制环，而不是魔法 batchSize

当前自适应输入来自四组信号：

| 信号 | 说明 | 回答的问题 |
| --- | --- | --- |
| <code>actualFps / baselineFps</code> | 当前与基线画面帧率 | 页面是否明显掉帧 |
| <code>renderP95Ms</code> | 最近页面提交耗时 P95 | 单次提交是否已经过重 |
| <code>arrivalRate / consumeRate</code> | 入队与出队速率 | 生产和消费是否失衡 |
| <code>pending / oldestPendingMs / queueSlope</code> | 队列数量、最老等待时间、变化趋势 | 积压是否持续恶化 |

### 【requiredBatchSize】

为了在约 2 秒内消化积压，控制器估算：

~~~text
requiredBatchSize
  = ceil(
      (
        arrivalRate
        + pending / 2s
      )
      / actualFps
    )
~~~

它只是需求估计，不是必须立即设置成该值。

### 【帧预算】

当前使用：

~~~text
frameBudgetMs = frameIntervalMs / 2
~~~

也就是只计划把约一半帧间隔交给这条提交路径，为其他 JavaScript、样式、布局、绘制与浏览器内部工作留空间。

### 【过载判断】

~~~text
overloaded =
  oldestPendingMs > 1000
  OR
  queueSlope > 0
~~~

所以“队列有几个点”本身不一定过载；更关键的是这些点是否越来越老、队列是否持续增长。

### 【决策树】

~~~mermaid
flowchart TD
    A[每个性能采样窗口] --> B{队列过载?}
    B -- 是 --> C{renderP95 在预算内?}
    C -- 是 --> D[逐步增大 batch<br/>向 requiredBatch 靠近]
    C -- 否 --> E[不再盲目增 batch<br/>回到 safeBatch]
    D --> F{连续过载且无法安全增 batch?}
    E --> F
    F -- 是 --> G[降低 maxPointsPerSecond<br/>减少服务端输入]
    F -- 否 --> H[保持观察]
    B -- 否 --> I{队列清空 + FPS 健康 + 渲染成本健康?}
    I -- 是 --> J[连续健康 5 个窗口<br/>batch 缓慢减 1]
    J --> K{持续健康约 60 秒?}
    K -- 是 --> L[尝试提高输入档位<br/>向用户期望值恢复]
~~~

默认还有 30 秒输入档位调整冷却时间，避免上游速率反复升降。

核心逻辑是：

> **先尽量提高本地消费能力；只有本地已经不能安全扩容，才减少上游输入；恢复时再慢慢放量。**

---

## 十二、页面渲染层必须区分“收到了”“提交了”和“真正流畅”

<code>FrameTelemetryQueue</code> 最终调用 <code>handleRealtimePacket()</code>。

页面会分别更新：

~~~text
折线图：
新点 + 历史曲线
→ 按实时图表时间窗口裁剪

地图：
新点
→ 追加进 realtimeMapStore
→ 更新 realtimeBatch
→ 子地图增量处理 / 按可视历史窗口淘汰对象

详情与天气：
只取本批最后一个点
~~~

### 【submitRate 不是 FPS】

<code>handleRealtimePacket()</code> 每秒调用多少次只表示“页面每秒收到了多少次提交”。

~~~text
每帧 1 点：
20 个点可能触发 20 次提交

每帧 5 点：
20 个点可能只有 4 次提交
~~~

提交次数下降不意味着 FPS 下降。当前页面已经独立通过 <code>RafPerformanceMonitor</code> 采样 rAF 节奏。

### 【renderP95Ms 也不是完整 Frame Time】

当前 <code>recordRenderCompletion()</code> 的观察边界是：

~~~text
handleRealtimePacket 开始
        ↓
更新 Vue 响应式状态
        ↓
$nextTick
        ↓
记录 commitDuration
~~~

随后再等一次 rAF：

~~~text
next requestAnimationFrame
        ↓
frameTime = now - startedAt
~~~

因此：

~~~text
submitRate
≠ FPS

renderP95Ms
≠ 完整 Frame Time

frameTime
≠ LoAF duration
~~~

把指标定义清楚，比展示一个漂亮数字更重要。

---

## 十三、故障恢复矩阵把“异常”拆成不同语义

| 场景 | 当前检测方式 | 当前动作 | 数据语义 |
| --- | --- | --- | --- |
| 某一秒没有数据 | 收到 <code>no-data</code> 秒桶 | 保持连接，推进时间游标 | 正常空数据 |
| 连续 3 秒无秒桶 | bucket watchdog | 关闭并重连 | 认为业务流异常 |
| 浏览器离线 | <code>offline</code> | 暂停帧队列并关闭连接 | 上线后恢复 |
| 页面隐藏 | Page Visibility | 暂停队列，4002 关闭 | 可见后按秒游标恢复 |
| 服务重启 | 1012 | 指数退避重连 | 重连后 replay |
| 发送缓冲 > 2 MB | 服务端 <code>bufferedAmount</code> | 1013 断开慢客户端 | 重连后 replay |
| Access Token 过期 | 4001 | HTTP 刷新 Token，再重连 | 游标不重置 |
| 无权限 | 4003 | stop | 不自动重试 |
| 协议错误 | 4100 | stop | 不自动重试 |
| 非 replay 跳过 ≥3 个秒桶 | 客户端时间差 | <code>resend_time_range</code> | replay 期间丢弃未来 live |
| 请求补发 >5000 秒桶 | 服务端补发预算 | <code>gap → skip-to-latest</code> | 明确放弃完整恢复 |
| 请求时间早于数据库留存，但范围 ≤5000 | 当前未显式识别 | 逐秒查询得到 no-data | **存在“淘汰 vs 真空数据”歧义** |

---

## 十四、测试不是附属品，而是证明这些语义真的存在

### 【服务端 WebSocket 集成测试】

[websocket.test.ts](../QHZHC_Server/tests/websocket.test.ts) 覆盖：

- 从指定自然秒游标 replay 已存储数据；
- 初始化后的客户端收到完整秒桶；
- 每连接的点数上限生效；
- 握手前发送非 authenticate 消息被拒绝；
- 无效 Access Token 以 4001 关闭。

### 【客户端状态机测试】

[realtimeClient.spec.js](../QHZHC_Web/tests/unit/realtimeClient.spec.js) 直接证明：

- <code>start()</code> 幂等；
- authenticate 携带显式的 <code>resumeFromBucketStartMs</code>；
- 当前实现逐帧渲染并且**不发送 ACK**；
- 跳过 3 个自然秒时请求 replay；
- recovering 期间未来 live 不直接进入渲染；
- <code>no-data</code> 也推进重连游标；
- 4001 先刷新 Access Token 再用原游标重连；
- <code>setMaxPerFrame()</code> 本地热更新，不建立新 WebSocket。

### 【帧队列与自适应控制测试】

相关测试：

- [frameTelemetryQueue.spec.js](../QHZHC_Web/tests/unit/frameTelemetryQueue.spec.js)
- [frameTelemetryQueueMetrics.spec.js](../QHZHC_Web/tests/unit/frameTelemetryQueueMetrics.spec.js)
- [adaptiveRenderController.spec.js](../QHZHC_Web/tests/unit/adaptiveRenderController.spec.js)
- [frontend-realtime.test.ts](../QHZHC_Server/tests/frontend-realtime.test.ts)

它们覆盖大批次分帧且不改变顺序、队列等待时间与守恒计数、时间预算耗尽时仍至少消费一个点、队列增长时提高批量、渲染成本到达预算时不再盲目增大 batch 等行为。

最有说服力的答辩证据链应是：

~~~text
设计结论
  ↓
对应源码
  ↓
对应测试
  ↓
可运行演示 / 指标
~~~

而不是“文档里写了这个功能”。

---

## 十五、面试追问应该沿着同一条数据链继续，而不是拆成孤立名词

### 【追问一：为什么用了 WebSocket，还要做应用层背压】

先给结论：

> WebSocket 只解决双向长连接，不自动解决业务消费速度小于消息到达速度的问题。QHZHC 分别在服务端用 bufferedAmount 限制发送积压，在客户端用 FrameTelemetryQueue 隔离网络接收和 UI 渲染，再由自适应控制器调节每帧消费量和每秒输入量。

继续展开：

~~~text
网络慢
→ 服务端发送缓冲增长
→ 2 MB 阈值断开

页面慢
→ 客户端 frame queue 增长
→ 先提高 batch
→ 仍不安全则降低 maxPointsPerSecond
~~~

### 【追问二：为什么不直接在 WebSocket onmessage 里画地图】

> 因为网络到包时机不等于浏览器适合绘制的时机。直接绘制会把一次网络批次的 UI 工作塞进当前消息任务；当前实现先入队，再通过 rAF 和单帧预算分摊工作。

这里体现的是 Producer–Consumer（生产者—消费者）解耦，而不只是“用了 rAF”。

### 【追问三：断线以后怎么恢复】

> 客户端保存最近接收的自然秒，重连 authenticate 时提交下一个期望秒；服务端从 SQLite 按秒桶 replay 到已经处理的最新秒。补发期间暂停该连接的 live 广播，避免新旧数据交叉；同一秒的抽样是确定性的，所以 live 与 replay 在相同订阅档位下得到相同子集。

随后主动说明边界：

> 当前协议没有 ACK，而且只有缺口达到 3 个秒桶才主动 resend，因此不能描述成严格的 exactly-once 或逐秒零丢失。

### 【追问四：为什么 maxPerFrame 调整不用重连】

> 因为它只改变浏览器本地队列每帧取多少点，没有改变服务端订阅协议；而 maxPointsPerSecond 属于 authenticate 时绑定的连接配置，所以改变它要重建连接。

### 【追问五：为什么后台页面要断 WebSocket】

> 真正需要暂停的是“实时接收却不能稳定按帧消费”这一组合。后台标签页的 rAF 通常会暂停或降频，如果仍持续接收高频点，本地队列可能积压。因此 hidden 时暂停帧队列并主动关闭连接，返回页面后再利用 replay 恢复。

### 【追问六：SQLite 能一直扛住这个架构吗】

> 不能把当前选择外推成通用答案。SQLite WAL 很适合当前单机部署和有限写入并发；如果未来变成多设备高频写入、多实例横向扩容和长期时序分析，单写者模型、单机 WAL 和本地文件部署都会成为扩展边界。

这时才讨论 PostgreSQL / TimescaleDB、ClickHouse、消息队列或流平台，而不是因为“实时系统就必须 Kafka”提前堆技术。

---

## 十六、答辩时用一条因果链讲清楚，而不是按技术名词背诵

~~~text
走航点先事务写 SQLite
    ↓
数据库成为 live 与 replay 的共同事实源
    ↓
TelemetryStream 按自然秒形成稳定协议单位
    ↓
RobotSocketHub 对连接鉴权、按连接抽样并广播
    ↓
客户端用自然秒游标恢复断线数据
    ↓
网络接收与 UI 渲染速度并不相同
    ↓
FrameTelemetryQueue 用 rAF + 时间预算分帧
    ↓
如果消费赶不上输入，队列开始变老、变长
    ↓
AdaptiveRenderController 先提高本地 batch
    ↓
本地已经无法安全扩容时，再降低服务端输入档位
    ↓
页面通过独立 FPS、提交 P95、队列长度和等待时间验证效果
~~~

每一个技术选择都有明确的上游原因和下游结果，因此比“Vue + Node + WebSocket + SQLite + rAF”这样的技术栈罗列更能体现项目理解。

---

## 十七、当前设计的能力边界与下一步改进顺序

当前实时链路已经具备：

1. 数据先持久化，再由统一流服务传播；
2. 秒桶级 live / no-data 协议；
3. WebSocket 握手后的业务鉴权和周期性令牌复验；
4. 时间游标重连与 replay；
5. live / replay 的确定性抽样；
6. 服务端发送缓冲保护；
7. 客户端 rAF 分帧队列；
8. 页面隐藏、离线、服务重启、Token 过期等恢复路径；
9. 基于 FPS、队列、等待时间和提交耗时的自适应控制。

但同样存在不应掩盖的边界：

| 边界 | 当前表现 | 后续优先方向 |
| --- | --- | --- |
| 1–2 秒桶缺口 | 不触发 resend | 明确业务容忍度；需要严格连续时改成任意缺口补发 |
| retention 与 no-data | 可能混淆 | 将 earliest retention 边界纳入 gap 判断 |
| 没有 ACK | 只能确认“已接收秒桶”，不能确认“已渲染” | 只有业务真的需要消费确认时才引入 ACK |
| SQLite 单机边界 | 适合当前运行规模 | 多设备、多实例、长期分析时再评估时序库 / 流系统 |

这里的原则不是“功能越多越好”，而是：

> **先定义系统到底需要提供什么一致性和恢复保证，再决定是否需要 ACK、消息队列、持久化消费位点或更重的流式基础设施。**

---

## 十八、知识树位置：这一章是后续全栈体系的主干

这一知识点之所以适合作为 <code>docs</code> 下第一篇正式梳理，是因为它天然连接后续章节：

~~~text
实时遥测主链路
├─ 上游：数据模型、SQLite 事务与时序存储
├─ 连接：HTTP Upgrade、WebSocket 协议、心跳与关闭码
├─ 安全：Access JWT、Refresh Token Rotation、权限
├─ 一致性：时间游标、补发、幂等、消息语义
├─ 性能：背压、rAF、LoAF、FPS、主线程预算
├─ 可视化：Vue 状态、ECharts、OpenLayers、Cesium
├─ 可观测性：browser-monitor SDK、线上性能与异常
└─ 运维：部署、容量、留存、故障恢复
~~~

后续知识点不应重新平铺这些名词，而应该从这条主干向外展开。例如认证章节回答“为什么长连接仍需要 Refresh Token 恢复”，性能监控章节回答“怎样证明自适应控制真的改善了用户体验”，数据库章节回答“当前 SQLite 边界在什么压力下需要升级”。

---

## 参考资料

### 项目活动源码

- [QHZHC_Server/src/server/index.ts](../QHZHC_Server/src/server/index.ts)
- [QHZHC_Server/src/server/database.ts](../QHZHC_Server/src/server/database.ts)
- [QHZHC_Server/src/server/telemetry-stream.ts](../QHZHC_Server/src/server/telemetry-stream.ts)
- [QHZHC_Server/src/server/robot-socket-hub.ts](../QHZHC_Server/src/server/robot-socket-hub.ts)
- [QHZHC_Server/src/shared/protocol.ts](../QHZHC_Server/src/shared/protocol.ts)
- [QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts)
- [QHZHC_Web/src/views/DataVisualization/services/FrameTelemetryQueue.ts](../QHZHC_Web/src/views/DataVisualization/services/FrameTelemetryQueue.ts)
- [QHZHC_Web/src/views/DataVisualization/services/AdaptiveRenderController.ts](../QHZHC_Web/src/views/DataVisualization/services/AdaptiveRenderController.ts)
- [QHZHC_Web/src/views/DataVisualization/dataVisualization.vue](../QHZHC_Web/src/views/DataVisualization/dataVisualization.vue)

### 项目测试

- [QHZHC_Server/tests/websocket.test.ts](../QHZHC_Server/tests/websocket.test.ts)
- [QHZHC_Web/tests/unit/realtimeClient.spec.js](../QHZHC_Web/tests/unit/realtimeClient.spec.js)
- [QHZHC_Web/tests/unit/frameTelemetryQueue.spec.js](../QHZHC_Web/tests/unit/frameTelemetryQueue.spec.js)
- [QHZHC_Web/tests/unit/frameTelemetryQueueMetrics.spec.js](../QHZHC_Web/tests/unit/frameTelemetryQueueMetrics.spec.js)
- [QHZHC_Web/tests/unit/adaptiveRenderController.spec.js](../QHZHC_Web/tests/unit/adaptiveRenderController.spec.js)

### 官方规范与文档

- MDN, WebSocket: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- MDN, WebSocket.bufferedAmount: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount
- MDN, requestAnimationFrame: https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- MDN, Page Visibility API: https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- RFC 6455, The WebSocket Protocol: https://www.rfc-editor.org/rfc/rfc6455
- SQLite, Write-Ahead Logging: https://www.sqlite.org/wal.html
- SQLite, Transaction: https://www.sqlite.org/lang_transaction.html
