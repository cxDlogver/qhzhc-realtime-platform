# 01 实时渲染背压与自适应调度

> 本文只梳理一个方面：实时数据进入浏览器以后，如何在持续输入压力下稳定地提交到地图与图表。
>
> 数据库持久化、WebSocket 鉴权、断线补发、JWT 会话恢复等内容只作为上下游边界出现，不在本章展开。实现事实以当前活动源码和测试为准，docs/history 只作为排查线索，不作为结论来源。

## 一、问题本质是生产速度与消费速度失衡

QHZHC 的数据可视化页面会持续接收走航数据，同时更新折线图、二维地图、三维地图、详情信息和天气位置。真正的性能问题不是“WebSocket 能不能收到数据”，而是浏览器是否来得及把收到的数据提交给渲染层。

~~~text
服务端持续产生数据
        ↓
浏览器持续收到数据
        ↓
Vue / ECharts / OpenLayers / Cesium 持续更新
        ↓
如果页面处理速度低于数据到达速度
        ↓
待渲染数据不断积压
        ↓
显示延迟增加，随后出现掉帧、卡顿和内存压力
~~~

先用一个最基本的生产者—消费者模型理解：

~~~text
arrivalRate = λ    每秒进入客户端队列多少点
consumeRate = μ    每秒真正从队列消费多少点
pending = Q        当前还有多少点没有提交给页面
~~~

长期满足：

~~~text
μ > λ    队列可以排空
μ ≈ λ    系统处于临界状态，短时抖动就会积压
μ < λ    队列会持续增长
~~~

因此，实时渲染优化首先不是调一个 FPS 数字，而是回答三个问题：

| 问题 | 对应指标 | 项目模块 |
| --- | --- | --- |
| 数据进入有多快 | arrivalRate | realtimeClient.ts |
| 页面消费有多快 | consumeRate | realtimeClient.ts + FrameTelemetryQueue.ts |
| 消费是否已经落后 | pending、oldestPendingMs、queueSlope | FrameTelemetryQueue.ts + AdaptiveRenderController.ts |

本章关注的活动源码：

- [robot-socket-hub.ts](../QHZHC_Server/src/server/robot-socket-hub.ts)：服务端发送缓冲保护。
- [realtimeClient.ts](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts)：实时数据进入客户端后的状态与速率统计。
- [FrameTelemetryQueue.ts](../QHZHC_Web/src/views/DataVisualization/services/FrameTelemetryQueue.ts)：浏览器分帧消费。
- [AdaptiveRenderController.ts](../QHZHC_Web/src/views/DataVisualization/services/AdaptiveRenderController.ts)：根据运行状态调整 batch 和输入档位。
- [RenderPerformanceMonitor.ts](../QHZHC_Web/src/views/DataVisualization/services/RenderPerformanceMonitor.ts)：真实 rAF 节奏采样。
- [dataVisualization.vue](../QHZHC_Web/src/views/DataVisualization/dataVisualization.vue)：Vue、图表与地图状态提交。

局部控制环是：

~~~text
服务端每秒下发量 maxPointsPerSecond
        ↓
WebSocket 到包
        ↓
FrameTelemetryQueue
        ↓
每帧消费量 maxPerFrame
        ↓
页面状态与地图图表更新
        ↓
FPS / renderP95 / queue metrics
        ↓
AdaptiveRenderController
        ├─ 调 maxPerFrame
        └─ 必要时降低 maxPointsPerSecond
~~~

这只是实时渲染方面，不展开连接鉴权和断线恢复。

## 二、背压必须分成网络发送背压和浏览器渲染背压

Backpressure（背压）的核心含义是：下游处理能力不足时，上游不能继续无限制灌入。

QHZHC 有两种不同的慢消费者。

### 【网络发送背压】

服务端发送前检查 WebSocket 的 bufferedAmount。当前代码在缓冲超过 2 MB 时关闭连接：

~~~text
bufferedAmount > 2 MB
        ↓
close(1013, "client backpressure")
~~~

bufferedAmount 表示调用 send 后仍未真正发送到网络的字节数。因此它回答的是：

> Node.js 已经准备发送的数据，是否开始积压在 WebSocket 发送缓冲中。

这层保护的是网络发送侧，不是地图绘制。

官方资料：

- MDN WebSocket API：https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
- MDN WebSocket.bufferedAmount：https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount

经典 WebSocket 接口本身没有自动应用级背压。如果消息到达速度超过应用处理速度，应用可能不断缓冲并占用 CPU 或内存。

### 【浏览器渲染背压】

另一种情况是：

~~~text
WebSocket 已经成功收到数据
        ↓
网络层没有明显积压
        ↓
但地图和图表更新太慢
        ↓
页面来不及消费
~~~

此时服务端 bufferedAmount 可以完全正常，但浏览器仍然很卡。

项目因此维护 FrameTelemetryQueue，专门表示：

> 已经到达浏览器，但还没有交给页面渲染层的数据。

两层背压不能混淆：

| 层 | 观察什么 | 当前处理 |
| --- | --- | --- |
| 网络发送侧 | bufferedAmount | 超过 2 MB 断开慢连接 |
| 浏览器渲染侧 | pending、oldestPendingMs、consumeRate | 分帧消费、自适应扩 batch、必要时降低输入 |

### 【答辩注意点】

如果被问“用了 WebSocket 为什么还会积压”，不能回答“因为 WebSocket 不够快”。

更准确的回答是：

> WebSocket 只负责长连接传输，并不代表消费端处理能力无限。项目把网络发送缓冲和浏览器待渲染队列分开处理：bufferedAmount 保护 socket 发送缓冲，FrameTelemetryQueue 处理已经收到但还没渲染的数据，两层解决的是不同的慢消费者问题。

## 三、网络到包时机与浏览器渲染时机必须解耦

最直接的实现方式是：

~~~text
WebSocket onmessage
        ↓
解析数据
        ↓
直接更新 Vue 状态
        ↓
图表与地图更新
~~~

问题在于一次网络批次可能把大量 UI 工作塞进同一个主线程任务。

假设一秒内 20 个点集中到达：

~~~text
onmessage
  ├─ 点 1 的页面更新
  ├─ 点 2 的页面更新
  ├─ ...
  └─ 点 20 的页面更新
~~~

如果每次更新又触发 Vue 响应式通知、ECharts 计算、OpenLayers / Cesium 对象更新，当前任务就可能变成长任务。

当前实现改成：

~~~text
WebSocket onmessage
        ↓
只负责接收
        ↓
frameQueue.enqueue(points)
        ↓
requestAnimationFrame
        ↓
每一帧取一部分
        ↓
publishFrame(batch)
        ↓
handleRealtimePacket
~~~

这里真正的设计思想不是“rAF 比 setTimeout 更快”，而是：

> 接收调度和渲染调度解耦。

WebSocket 决定什么时候数据到达；requestAnimationFrame 让页面把下一批 UI 工作对齐到浏览器的渲染节奏。

MDN 对 requestAnimationFrame 的定义是：浏览器会在下一次重绘前调用回调；回调频率通常跟随显示刷新率，而且后台标签页或隐藏 iframe 中通常会暂停。

官方资料：

- https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API

需要特别注意：

~~~text
用了 requestAnimationFrame
≠
页面自动稳定 60 FPS
~~~

如果 rAF 回调及后续页面工作本身耗时 80 ms，仍然会产生明显长帧。rAF 提供的是调度边界，不是性能保证。

## 四、FrameTelemetryQueue 是受数量和时间双重约束的消费者

当前 FrameTelemetryQueue 维护：

~~~text
queue        待消费点
cursor       当前消费位置
enqueuedAt   每个点进入队列的时间
maxPerFrame  一帧最多取多少点
budgetMs     当前 flush 的取点时间预算
~~~

默认参数：

~~~text
maxPerFrame = 1
budgetMs = 5 ms
~~~

核心逻辑可以抽象为：

~~~text
while (
  还有待处理点
  AND 本帧数量 < maxPerFrame
  AND 本轮取点时间没有超过 budgetMs
) {
  取一个点
}
~~~

这里同时存在两个上限：

~~~text
数量上限
+
时间上限
~~~

只有数量上限时，某些重数据仍可能让一次 batch 过大；只有时间上限时，轻场景又可能一次拿出过多点。因此当前实现同时限制两者。

需要注意，5 ms 只约束 FrameTelemetryQueue.flush 中“从队列取出数据”的过程，不等于 Vue、地图和浏览器完整渲染只花 5 ms。

### 【为什么预算耗尽时仍至少处理一个点】

代码保留“batch 为空时允许至少取一个点”的条件。

否则可能出现：

~~~text
进入 flush
        ↓
第一次检查就认为预算耗尽
        ↓
一个点也不消费
        ↓
下一帧重复
        ↓
队列永久无法前进
~~~

这属于 starvation（饥饿）。

### 【为什么使用 cursor 而不是持续 shift】

队列通过：

~~~text
queue[cursor]
cursor++
~~~

推进，而不是每处理一个点都删除数组头。

这样可以避免频繁头部删除带来的数组元素搬移。只有当 cursor 已经很大且超过数组一半时，再统一 slice 掉已消费区域。

这是典型的：

> 用少量暂时未回收的数组空间，换取更低的频繁结构修改成本。

### 【pause、resume、stop 是不同生命周期】

pause：

~~~text
取消当前 rAF
保留 queue
保留 cursor
~~~

resume：

~~~text
继续从原位置消费
~~~

stop：

~~~text
取消 rAF
清空队列
清空时间记录和计数
cursor 归零
~~~

所以“暂时不能渲染”和“这个实时客户端彻底销毁”不是同一件事。


## 五、判断是否真的过载，不能只看 pending

假设：

~~~text
pending = 10
~~~

这个数字本身不足以说明问题。

可能只是一次瞬时突发：

~~~text
刚到 10 个点
下一秒全部排空
~~~

也可能是持续失衡：

~~~text
第 1 秒 pending = 10
第 2 秒 pending = 18
第 3 秒 pending = 27
~~~

因此项目同时观察：

| 指标 | 含义 | 解决的问题 |
| --- | --- | --- |
| pending | 当前还有多少点未提交给渲染层 | 积压规模 |
| oldestPendingMs | 队首最老数据已经等待多久 | 实时显示已经落后多久 |
| queueSlope | 当前 pending 与上一窗口之差 | 积压是在扩大还是收敛 |
| arrivalRate | 每秒进入多少点 | 输入速度 |
| consumeRate | 每秒消费多少点 | 输出速度 |

### 【oldestPendingMs 比单纯 pending 更接近实时性】

如果：

~~~text
pending = 20
oldestPendingMs = 50
~~~

可能只是刚到一批数据。

但如果：

~~~text
pending = 20
oldestPendingMs = 4000
~~~

意味着当前排在最前面的待渲染数据已经滞后约 4 秒。

所以：

> pending 描述容量压力，oldestPendingMs 描述实时性损失。

### 【当前过载判断】

AdaptiveRenderController 当前把下面任一条件视为过载信号：

~~~text
oldestPendingMs > 1000
OR
queueSlope > 0
~~~

这说明项目没有简单使用“pending 大于某个固定数量”判断卡顿，而是看：

~~~text
数据是否越来越旧
或者
队列是否还在持续增长
~~~

这是更接近实时系统本质的判断。

## 六、maxPerFrame 与 maxPointsPerSecond 是两个不同的调节杆

这两个参数都能影响积压，但所在层次不同。

### 【maxPerFrame 控制本地消费能力】

~~~text
maxPerFrame
=
浏览器每一帧最多从 FrameTelemetryQueue 取多少点
~~~

它只属于客户端本地调度。

调整时调用：

~~~text
frameQueue.setMaxPerFrame(...)
~~~

不需要服务端参与，也不需要重连。

### 【maxPointsPerSecond 控制进入浏览器的输入量】

~~~text
maxPointsPerSecond
=
服务端每个自然秒最多给当前连接多少点
~~~

它属于实时订阅参数。

当前可选档位：

~~~text
全部 / 20 / 10 / 5 / 2 / 1
~~~

修改后需要让连接按新的订阅参数重新建立。

### 【两者关系】

为了理解可以粗略写成：

~~~text
输入能力
maxPointsPerSecond
        ↓
[ FrameTelemetryQueue ]
        ↓
消费能力
actualFps × maxPerFrame
~~~

注意：

~~~text
actualFps × maxPerFrame
~~~

只是一种理解上限的近似，不是精确性能公式。

真实消费速度还受到：

- 每个点的数据处理成本；
- Vue 响应式更新；
- ECharts 更新；
- OpenLayers / Cesium 对象更新；
- 当前历史对象数量；
- 浏览器布局与绘制；

影响。

### 【为什么应该先扩消费，再降低输入】

如果：

~~~text
pending 正在增长
但是 renderP95 仍然在预算内
~~~

说明页面还有一定单帧余量。

此时直接降低 maxPointsPerSecond 会牺牲展示的数据密度。

更合理的是：

~~~text
先提高 maxPerFrame
        ↓
提高 consumeRate
        ↓
尝试追平 arrivalRate
~~~

只有当：

~~~text
队列持续增长
+
当前渲染成本已经达到预算
~~~

才说明本地已经不能安全继续加工作量，此时才需要减少输入。

所以当前控制策略的主线是：

> 先扩消费能力，再做输入降载。

## 七、为什么每帧从 1 点改成 5 点，有时反而更流畅

这是实时渲染答辩里非常值得重点准备的一题。

假设：

~~~text
arrivalRate = 20 点/s
actualFps = 10 FPS
maxPerFrame = 1
~~~

理想情况下每秒最多消费：

~~~text
10 × 1 = 10 点/s
~~~

但输入是：

~~~text
20 点/s
~~~

所以每秒约增加：

~~~text
10 个 pending
~~~

如果改成：

~~~text
maxPerFrame = 5
~~~

理论消费上限变成：

~~~text
10 × 5 = 50 点/s
~~~

于是队列有机会排空。

### 【总数据量没变，为什么性能可能更好】

因为页面更新通常存在固定提交成本。

一次 handleRealtimePacket 可能包含：

~~~text
创建新的状态对象
Vue 响应式通知
组件更新调度
ECharts 数据更新
地图 prop 更新
nextTick 调度
~~~

假设总共 20 个点。

逐点提交：

~~~text
1 点 × 20 次页面提交
~~~

批量提交：

~~~text
5 点 × 4 次页面提交
~~~

数据点总数没有减少，但很多“每提交一次就要支付”的固定成本从 20 次减少到 4 次。

所以：

> batch 增大减少的不是业务数据量，而是页面提交次数和固定调度开销。

### 【为什么 batch 又不能无限增大】

如果：

~~~text
一次提交 20 个点
        ↓
Vue + 图表 + 地图一次工作 80 ms
~~~

那么队列虽然很快排空，却可能制造一个明显长帧。

因此真正的目标不是：

~~~text
batch 越大越好
~~~

而是：

~~~text
尽量提高消费吞吐
同时不突破单帧可接受成本
~~~

这就是自适应控制器需要同时看“积压”和“渲染预算”的原因。

## 八、自适应控制器本质上是反馈控制系统

AdaptiveRenderController 不负责渲染，也不持有 WebSocket。

它的职责只有：

> 根据当前运行状态，决定下一阶段每帧应该消费多少，以及是否需要降低服务端输入。

输入包括：

~~~text
actualFps
baselineFps
arrivalRate
consumeRate
pending
oldestPendingMs
renderP95Ms
frameIntervalMs
effectivePointLimit
~~~

输出包括：

~~~text
batchSize
safeBatchSize
requiredBatchSize
frameBudgetMs
queueSlope
overloaded
requestedPointLimit
reason
~~~

这是一种 Feedback Control（反馈控制）：

~~~text
观察当前状态
        ↓
作出控制决策
        ↓
改变 batch / 输入档位
        ↓
下一窗口再次观察结果
~~~

它不是复杂预测算法，也不是 PID 控制器。当前更接近：

~~~text
阈值
+
趋势
+
滞回
+
冷却时间
~~~

这样做的优点是行为可解释、可测试，也适合项目当前规模。

## 九、requiredBatchSize 回答“为了追上积压，我至少需要多大 batch”

控制器默认希望在约 2 秒追赶窗口内消化已有积压。

公式可以抽象为：

~~~text
requiredBatchSize
=
ceil(
  (
    arrivalRate
    +
    pending / catchUpWindowSeconds
  )
  /
  actualFps
)
~~~

例如：

~~~text
arrivalRate = 20 点/s
pending = 20 点
catchUpWindowSeconds = 2
actualFps = 10
~~~

为了不继续积压，首先要处理：

~~~text
20 点/s 新输入
~~~

为了在两秒左右追掉当前 20 点积压，还要额外处理：

~~~text
20 / 2 = 10 点/s
~~~

所以总需求约：

~~~text
30 点/s
~~~

在 10 FPS 下：

~~~text
requiredBatchSize = ceil(30 / 10) = 3
~~~

它表达的是：

> 如果其他条件不变，每帧至少处理约 3 个点，才有机会在目标窗口内追平。

但 requiredBatchSize 不是“立即设置值”，因为还必须回答另一个问题：

> 页面是否承受得住这么大的 batch？

## 十、safeBatchSize 与 frameBudget 约束“能不能安全继续扩 batch”

当前控制器使用：

~~~text
frameBudgetMs = frameIntervalMs / 2
~~~

假设屏幕和页面当前约 60 FPS：

~~~text
frameIntervalMs ≈ 16.7 ms
frameBudgetMs ≈ 8.3 ms
~~~

为什么只拿约一半，而不是把完整 16.7 ms 都用掉？

因为一帧还包括：

~~~text
其他 JavaScript
requestAnimationFrame 回调
样式计算
布局
绘制
合成
浏览器内部任务
~~~

如果把所有预算都交给实时提交路径，系统几乎没有余量应对其他工作。

### 【requiredBatchSize 和 safeBatchSize 的区别】

~~~text
requiredBatchSize
=
为了追上输入，我希望 batch 至少多大

safeBatchSize
=
根据已经观测到的提交成本，我确认多大相对安全
~~~

如果：

~~~text
renderP95Ms <= frameBudgetMs
~~~

当前 batch 说明仍在预算内，可以逐步探索更大批量。

如果：

~~~text
renderP95Ms > frameBudgetMs
~~~

说明页面提交已经偏重，此时即使队列还在增长，也不能继续盲目加 batch。

这两个量共同解决：

~~~text
吞吐需求
vs
单帧成本
~~~

之间的冲突。

## 十一、当前自适应控制可以理解成四个运行状态

### 【状态一：积压增长，但页面还有余量】

~~~text
overloaded = true
renderWithinBudget = true
~~~

动作：

~~~text
增大 batchSize
~~~

目标：

~~~text
提高 consumeRate
尽快追平 arrivalRate
~~~

### 【状态二：积压增长，但提交预算已经吃满】

~~~text
overloaded = true
renderWithinBudget = false
~~~

动作：

~~~text
停止继续扩 batch
回到 safeBatchSize 附近
~~~

因为继续增加单帧工作只会把“队列问题”变成“长帧问题”。

### 【状态三：持续过载，而且本地无法再安全扩容】

当过载连续存在多个观察窗口，并且当前 batch 已经无法安全增加时，控制器才请求降低：

~~~text
maxPointsPerSecond
~~~

也就是从：

~~~text
全部 → 20 → 10 → 5 → 2 → 1
~~~

逐级减少实际进入浏览器的数据。

这一步的本质是：

> 本地消费能力已经成为硬上限，只能从上游减压。

### 【状态四：系统持续健康】

如果：

~~~text
pending = 0
oldestPendingMs = 0
FPS 健康
renderP95 健康
~~~

控制器不会立即把所有参数恢复，而是：

~~~text
连续健康若干窗口
        ↓
batchSize 缓慢减 1
~~~

如果之前降低过输入档位，还要持续健康更长时间，才逐级试探恢复更高输入。

这体现两个稳定性原则：

~~~text
降载可以快
恢复要慢
~~~

以及：

~~~text
不要被单个偶然好样本驱动
在高低档位之间来回震荡
~~~

因此代码还设置了 point-limit 调整冷却时间。


## 十二、FPS、submitRate、renderP95、frameTime 和 LoAF 必须严格区分

实时性能优化最容易出现的问题，不是没有指标，而是把不同含义的指标混成一个数字。

### 【FPS 表示浏览器帧调度能力】

当前页面通过独立的 rAF 采样获得 FPS。

它回答的是：

> 浏览器当前还能以多高频率获得下一次动画帧机会。

它不等于：

~~~text
WebSocket 每秒收到多少包
也不等于
handleRealtimePacket 每秒执行多少次
~~~

因此不能用业务回调次数冒充 FPS。

### 【submitRate 表示页面业务提交频率】

当前 submitRate 统计：

~~~text
每秒调用 handleRealtimePacket 多少次
~~~

假设服务端每秒下发 20 个点。

如果：

~~~text
maxPerFrame = 1
~~~

可能产生接近 20 次页面提交。

如果：

~~~text
maxPerFrame = 5
~~~

可能只产生约 4 次页面提交。

此时 submitRate 下降，但页面反而可能更流畅，因为固定提交成本减少了。

所以：

~~~text
submitRate ↓
不代表
FPS ↓
~~~

### 【renderP95Ms 表示业务提交成本分布】

页面在 handleRealtimePacket 开始时记录时间，更新 Vue 状态后等待 nextTick，再记录一次提交耗时。

因此它更接近：

> 实时数据进入页面状态更新后，一次 Vue 提交路径的业务侧成本。

P95 的意义是观察较差但又具有代表性的提交，而不是让少量高耗时样本被平均值稀释。

但必须明确：

~~~text
renderP95Ms
≠
浏览器完整一帧的全部时间
~~~

因为它不完整覆盖浏览器之后的样式、布局、绘制、合成等所有阶段。

### 【frameTime 表示从业务提交到下一次 rAF 的等待】

页面还会在状态提交后等待下一次 requestAnimationFrame，然后计算：

~~~text
frameTime
=
下一次 rAF 时间
-
本次 handleRealtimePacket 开始时间
~~~

它可以帮助观察一次业务提交以后多久重新获得帧调度机会。

但仍然不能把它直接写成：

~~~text
完整 Frame Time
~~~

### 【LoAF 用于观察长动画帧】

Long Animation Frame（LoAF，长动画帧）用于记录超过 50 ms 的长渲染更新。

它可以继续分析：

~~~text
renderStart
styleAndLayoutStart
scripts
整帧 duration
~~~

因此 LoAF 更适合回答：

> 页面已经出现长帧时，时间主要消耗在哪一阶段、哪些脚本参与了这次长帧。

官方资料：

- https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing
- https://developer.mozilla.org/en-US/docs/Web/API/PerformanceLongAnimationFrameTiming

### 【这些指标应该怎样组合】

~~~text
arrivalRate / consumeRate
→ 数据吞吐是否平衡

pending / oldestPendingMs / queueSlope
→ 是否产生实时积压

submitRate
→ 页面业务提交频率

renderP95Ms
→ 单次页面提交成本是否变重

FPS
→ 整体帧调度能力是否下降

LoAF
→ 是否已经出现明显长帧，以及长帧内部发生了什么
~~~

答辩时应该先说明指标定义，再引用数字。否则“FPS 提升 30%”本身没有意义。

## 十三、pending 为 0 不代表性能问题已经解决

这是实时渲染知识点里最容易被忽略的第二层问题。

假设：

~~~text
pending = 0
consumeRate >= arrivalRate
~~~

只能证明：

> 数据没有积压在 FrameTelemetryQueue 中。

它不能证明：

> 页面每次地图更新的成本没有随着历史数据增长。

当前页面会持续维护实时地图点。当历史轨迹越来越长时，如果后续地图逻辑存在：

~~~text
扫描历史数组
重新构造大量地图对象
重新计算轨迹
重新更新大量 Entity / Feature
~~~

那么单次更新成本可能随着历史规模增加。

这时会出现：

~~~text
arrivalRate = 20
consumeRate = 20
pending = 0
但 renderP95 越来越高
FPS 越来越低
~~~

所以实时渲染性能至少有两个维度：

~~~text
维度一：吞吐压力
arrivalRate vs consumeRate

维度二：单次更新复杂度
costPerUpdate(historySize)
~~~

自适应 batch 主要解决第一类问题。

如果第二类成本随着 historySize 增长，它不能从根本上解决：

~~~text
历史轨迹越来越大
地图对象越来越多
每次更新越来越贵
~~~

后续“地图历史轨迹渲染复杂度”应该单独作为一个知识点继续梳理。

### 【答辩注意点】

如果面试官问：

> 队列都没有积压了，为什么页面还会掉帧？

正确回答应该是：

> 队列指标只说明数据吞吐已经平衡，不代表下游渲染算法复杂度稳定。地图历史对象数量增加后，单次提交成本可能继续上升，因此需要同时观察 renderP95、FPS、LoAF 和地图对象规模，再判断问题是吞吐积压还是历史渲染复杂度。

## 十四、Web Worker 能减轻计算，但不能替代主线程渲染

另一个常见追问是：

> 既然主线程卡，为什么不把这些工作全部放进 Worker？

需要先区分工作类型。

适合搬到 Worker 的通常是：

~~~text
数据解析
数据清洗
聚合计算
批量坐标转换
纯数学计算
无 DOM 依赖的预处理
~~~

但页面最终仍然需要：

~~~text
Vue 状态更新
DOM 生命周期
ECharts 与页面节点协调
OpenLayers / Cesium 的主线程交互
用户事件处理
~~~

因此：

> Worker 能降低一部分 JavaScript 计算压力，但它不会自动解决主线程地图绘制和 UI 提交成本。

如果瓶颈是：

~~~text
JSON 解析 / 坐标转换 30 ms
~~~

Worker 很有价值。

如果瓶颈是：

~~~text
Cesium Entity 更新 / Vue 更新 / 图表重绘 80 ms
~~~

单纯把 WebSocket 数据接收搬到 Worker 不会让这 80 ms 消失。

这也是为什么性能优化前必须先有 LoAF、Performance Timeline 或可重复 A/B 数据，而不能看到掉帧就默认上 Worker。

## 十五、当前控制器的设计思想是可解释反馈控制，而不是复杂算法

当前自适应方案不是预测未来负载，而是：

~~~text
观察当前状态
        ↓
判断是否过载
        ↓
调整 batch 或输入
        ↓
下一窗口继续观察
~~~

可以概括为：

~~~text
阈值
+
趋势
+
安全上限
+
连续窗口
+
冷却时间
~~~

这种方案对当前项目有明显优点：

| 优点 | 说明 |
| --- | --- |
| 可解释 | 页面可以直接显示当前 reason |
| 可测试 | 可以给定固定样本验证输出决策 |
| 易回退 | 用户可切换手动 batch |
| 易调参 | 每个阈值都有明确业务意义 |
| 不依赖模型 | 不需要训练数据或复杂运行时 |

但也有边界：

| 边界 | 说明 |
| --- | --- |
| 参数依赖场景 | queueAge、健康窗口、预算比例都需要实验验证 |
| 有反馈延迟 | 必须先发生压力，下一观察窗口才能响应 |
| 指标存在耦合 | batch 改变会同时影响 submitRate、renderP95 和 FPS |
| 不是全局最优 | 目标是工程稳定，不是求数学最优控制 |

因此答辩中更准确的描述是：

> 当前实现的是基于运行指标的规则型反馈控制器。它用队列趋势判断是否持续过载，用提交 P95 判断是否还有扩批空间，通过连续窗口和 cooldown 防止频繁震荡。它追求的是可解释、可测试和稳定，而不是包装成复杂智能调度算法。

## 十六、这一设计真正体现的是三层控制思想

把具体代码名拿掉后，这个知识点可以抽象成三层。

### 【第一层：缓冲】

~~~text
网络到包
        ↓
先进入客户端缓冲队列
~~~

目的：

> 把输入时间与渲染时间解耦。

### 【第二层：调度】

~~~text
requestAnimationFrame
+
maxPerFrame
+
budgetMs
~~~

目的：

> 把待处理工作拆到不同帧，而不是一次全部提交。

### 【第三层：反馈控制】

~~~text
队列增长
+
渲染成本
+
FPS
        ↓
动态调整 batch
        ↓
必要时反向限制输入
~~~

目的：

> 让系统在输入压力变化时自动寻找一个相对稳定的工作点。

因此可以把这个方案总结成：

~~~text
缓冲解决“先别一次全做”
调度解决“这一帧做多少”
反馈控制解决“下一阶段应该做多少”
~~~

这三层关系比“项目用了 rAF”更接近设计思想。

## 十七、面试官可能连续追问的重点

| 追问 | 回答结论 | 答辩证明 |
| --- | --- | --- |
| WebSocket 为什么还需要背压 | 连接协议不等于消费能力，网络发送和页面渲染都有独立慢消费者 | bufferedAmount + FrameTelemetryQueue |
| 为什么不用 onmessage 直接更新地图 | 网络到包节奏不等于浏览器适合渲染的节奏 | enqueue → rAF → publishFrame |
| rAF 是否保证 60 FPS | 不保证，它只提供下一次重绘前的调度机会 | MDN + 独立 FPS 监控 |
| 为什么 batch 变大有时更流畅 | 减少页面提交次数和固定调度成本，同时提高消费能力 | submitRate、pending、renderP95 对比 |
| batch 是否越大越好 | 否，过大会增加单帧提交成本并制造长帧 | safeBatchSize + frameBudget |
| 为什么不一积压就限流 | 瞬时波动不等于持续过载，需要趋势和连续窗口防止震荡 | queueSlope + overloadWindows |
| pending 为 0 为什么还能掉帧 | 队列稳定不等于地图单次更新复杂度稳定 | renderP95 / LoAF / historySize |
| 为什么不用 Worker 全解决 | Worker 适合纯计算，不能替代主线程 UI 与地图提交 | 性能归因后决定是否拆 Worker |
| 为什么用 P95 不用平均值 | 平均值容易掩盖较差提交，P95 更能表示尾部成本 | renderSamples + percentile |
| 自动模式是什么算法 | 规则型反馈控制，不是预测模型或 PID | AdaptiveRenderController |

### 【一个完整回答示例】

如果面试官问：

> 你们实时页面卡顿是怎么优化的？

不要从“我们用了 rAF”开始。

更好的答法是：

> 我们先把问题定义成生产消费失衡：服务端持续输入，而浏览器地图和图表是消费者。首先用 FrameTelemetryQueue 把 WebSocket 接收与页面渲染解耦，再用 rAF 按帧消费；其次把 maxPointsPerSecond 和 maxPerFrame 分成输入控制和本地消费控制两条线。运行时持续观察 arrivalRate、consumeRate、pending、oldestPendingMs、真实 FPS 和提交 P95。队列增长但渲染还有余量时优先增大 batch，只有持续过载且单帧预算已经吃满时才降低服务端输入。这样优化目标不是单纯把 FPS 做高，而是在数据实时性、页面流畅度和数据密度之间找稳定平衡。

随后再根据追问进入具体实现，而不是一次把全部项目链路讲完。

## 十八、答辩证明必须从“代码存在”升级到“策略有效”

仅展示 AdaptiveRenderController 的源码不能证明策略有效。

证据应该分四层。

### 【代码结构】

证明职责拆分：

~~~text
RealtimeClient
        ↓
FrameTelemetryQueue
        ↓
AdaptiveRenderController
~~~

分别负责：

~~~text
实时输入
分帧调度
决策控制
~~~

### 【运行指标】

页面可以同时观察：

~~~text
FPS
arrivalRate
consumeRate
pending
oldestPendingMs
batchSize
queueSlope
renderP95Ms
controlReason
~~~

这样能看到一次控制动作前后的状态变化，而不是只展示最终一个 FPS。

### 【单元测试】

重点测试：

- [frameTelemetryQueue.spec.js](../QHZHC_Web/tests/unit/frameTelemetryQueue.spec.js)
- [frameTelemetryQueueMetrics.spec.js](../QHZHC_Web/tests/unit/frameTelemetryQueueMetrics.spec.js)
- [adaptiveRenderController.spec.js](../QHZHC_Web/tests/unit/adaptiveRenderController.spec.js)
- [realtimeClient.spec.js](../QHZHC_Web/tests/unit/realtimeClient.spec.js)

真正应该证明的是：

~~~text
大批数据是否按帧拆开
数据顺序是否保持
时间预算耗尽时队列是否仍能前进
received / consumed / pending 是否守恒
队列增长时 batch 是否增加
超过渲染预算时是否停止扩 batch
持续过载时是否降低输入档位
手动模式是否停止自动调节
~~~

### 【固定场景 A/B】

答辩时最有价值的是可重复实验：

~~~text
相同输入速率
相同历史点数量
相同地图模式
相同浏览器和机器
相同测试时长
~~~

对比：

~~~text
固定 batch
vs
自适应 batch
~~~

至少记录：

~~~text
FPS P5 / P50
LoAF count / P95
pending peak
oldestPendingMs peak
renderP95Ms
最终 pending
最终输入档位
~~~

不能只看平均 FPS，因为平均值可能把短时间严重卡顿稀释掉。

## 十九、这一知识点的完整框架

最终可以把本章记成下面这棵树：

~~~text
实时渲染背压与自适应调度
│
├─ 1. 生产消费模型
│   ├─ arrivalRate
│   ├─ consumeRate
│   ├─ pending
│   └─ λ / μ 稳定条件
│
├─ 2. 两级背压
│   ├─ WebSocket bufferedAmount
│   └─ FrameTelemetryQueue
│
├─ 3. 分帧调度
│   ├─ requestAnimationFrame
│   ├─ maxPerFrame
│   ├─ budgetMs
│   ├─ cursor
│   └─ pause / resume / stop
│
├─ 4. 自适应控制
│   ├─ requiredBatchSize
│   ├─ safeBatchSize
│   ├─ frameBudget
│   ├─ queueSlope
│   ├─ overloadWindows
│   └─ cooldown
│
├─ 5. 指标口径
│   ├─ FPS
│   ├─ submitRate
│   ├─ renderP95
│   ├─ frameTime
│   ├─ LoAF
│   └─ oldestPendingMs
│
├─ 6. 能力边界
│   ├─ rAF 不保证 60 FPS
│   ├─ batch 不能无限增大
│   ├─ pending=0 不代表渲染成本稳定
│   └─ Worker 不能替代主线程渲染
│
└─ 7. 答辩证明
    ├─ 代码职责
    ├─ 运行指标
    ├─ 单元测试
    └─ 固定场景 A/B
~~~

后续文档应该从这棵树的边界继续展开，而不是重新复制本章。例如：

~~~text
下一篇如果梳理 WebSocket
→ 重点研究连接状态机、心跳、关闭码和重连

如果梳理地图性能
→ 从“pending=0 但 FPS 仍下降”继续研究历史对象复杂度

如果梳理性能监控
→ 研究 FPS、LoAF、P95 如何通过 browser-monitor 在线上归因
~~~

这样逐篇积累，最终形成的是相互连接的知识树，而不是一批互相重复的项目总结。

## 参考资料

### 项目活动源码

- [QHZHC_Server/src/server/robot-socket-hub.ts](../QHZHC_Server/src/server/robot-socket-hub.ts)
- [QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts](../QHZHC_Web/src/views/DataVisualization/services/realtimeClient.ts)
- [QHZHC_Web/src/views/DataVisualization/services/FrameTelemetryQueue.ts](../QHZHC_Web/src/views/DataVisualization/services/FrameTelemetryQueue.ts)
- [QHZHC_Web/src/views/DataVisualization/services/AdaptiveRenderController.ts](../QHZHC_Web/src/views/DataVisualization/services/AdaptiveRenderController.ts)
- [QHZHC_Web/src/views/DataVisualization/services/RenderPerformanceMonitor.ts](../QHZHC_Web/src/views/DataVisualization/services/RenderPerformanceMonitor.ts)
- [QHZHC_Web/src/views/DataVisualization/dataVisualization.vue](../QHZHC_Web/src/views/DataVisualization/dataVisualization.vue)

### 项目测试

- [QHZHC_Web/tests/unit/frameTelemetryQueue.spec.js](../QHZHC_Web/tests/unit/frameTelemetryQueue.spec.js)
- [QHZHC_Web/tests/unit/frameTelemetryQueueMetrics.spec.js](../QHZHC_Web/tests/unit/frameTelemetryQueueMetrics.spec.js)
- [QHZHC_Web/tests/unit/adaptiveRenderController.spec.js](../QHZHC_Web/tests/unit/adaptiveRenderController.spec.js)
- [QHZHC_Web/tests/unit/realtimeClient.spec.js](../QHZHC_Web/tests/unit/realtimeClient.spec.js)

### 官方资料

- MDN WebSocket API：https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
- MDN WebSocket.bufferedAmount：https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount
- MDN requestAnimationFrame：https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame
- MDN Page Visibility API：https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- MDN Long Animation Frames：https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing
