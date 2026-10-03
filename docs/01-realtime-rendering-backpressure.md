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
