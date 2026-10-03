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
