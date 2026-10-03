# 数据可视化功能说明

文档日期：2026-07-19  
适用范围：`/dataVisualization` 页面、其前端组件、历史查询 REST API、实时 WebSocket，以及相关认证和阈值状态。  
文档性质：本文说明**当前仓库实际实现的行为**，同时明确已知的未闭环能力与约束。它不是目标产品承诺。

## 1. 功能定位

数据可视化页面用于展示走航车辆采集的温室气体、GPS、风场和气象站数据。页面以地图为中心，配合五分钟时序图、实时指标、风速浓度分布、甲烷同位素和天气预报，提供两种查询模式：

- **实时数据：** 通过 WebSocket 每秒请求最新一条走航数据，同时保持一个五分钟窗口用于图表展示。
- **历史查询：** 用户选择日期和时间段后，应从 REST API 查询相应历史点，绘制浓度点或轨迹，并支持点选查看五分钟详情。

当前实现中，实时链路可以连接并显示部分内容；历史查询入口已经渲染，但没有形成可用的端到端流程。

## 2. 页面入口与访问控制

### 2.1 路由

| 路由 | 组件 | 路由鉴权 | 说明 |
| --- | --- | --- | --- |
| `/dataVisualization` | `src/views/DataVisualization/dataVisualization.vue` | `requireAuth: true` | 正式数据可视化入口。 |
| `/showChart` | `src/views/DataVisualization/components/showChart.vue` | `requireAuth: true` | 随机生成传感器数据的演示页面，不属于真实监测链路。 |
| `/login` | `src/views/loginPage.vue` | 否 | 认证入口。 |

路由守卫读取 `localStorage.token` 与 `localStorage.time`。未登录访问 `/dataVisualization` 时，守卫会重定向到：

```text
/login?redirect=/dataVisualization
```

登录成功后，当前实现固定跳转 `/index`，没有使用 `redirect` 参数。因此用户需要自行再次进入数据可视化页面。

### 2.2 后端权限模型

用户模型包含两个与可视化相关的布尔权限：

| 权限字段 | 设计用途 | 当前使用位置 |
| --- | --- | --- |
| `can_visit_realtime` | 允许实时数据连接 | WebSocket `connect()`。 |
| `can_visit_history` | 允许历史 REST 查询 | `/api/chart/dataTrans/5min` 与 `/api/chart/dataTrans/between`。 |

管理员通过 `is_superuser` 绕过上述权限判断。

注意：当前 WebSocket 仅在建立连接时校验 `can_visit_realtime`，没有针对 `history_data_5min` 命令再次校验 `can_visit_history`。因此 WebSocket 与 REST 接口的权限边界不一致。

## 3. 总体架构与数据流

### 3.1 前端组成

```text
Vue Router
  └─ dataVisualization.vue（页面状态、模式切换、请求编排）
      ├─ Weather.vue（第三方天气与气象站数据显示）
      ├─ Charts.vue（ECharts 生命周期与五分钟窗口）
      │   └─ chartData.js（CH4、CO2、风速、实时、同位素、天气 option）
      ├─ PlanimetricMap.vue（OpenLayers 二维地图）
      ├─ StereoscopicMap.vue（Cesium 三维地图）
      ├─ Details.vue（点位详情）
      ├─ legend.vue（浓度阈值图例）
      └─ RangeConfig.vue（阈值配置弹窗）
```

页面在 `created()` 中初始化 WebSocket。收到数据后，将同一份数据包分发给图表、天气、详情和地图：

```text
WebSocket 消息
  -> gasdata              图表与天气
  -> detailData           详情面板
  -> mapList              二维/三维实时地图
  -> weather_location_data 天气接口位置参数
```

### 3.2 后端组成

```text
JWT 请求认证
  ├─ REST：CustomTokenAuthentication 读取 HTTP token 请求头
  └─ WebSocket：JWTAuthMiddleware 从 URL 查询参数 token 读取 JWT

api_chart
  ├─ chartdatatrans.py：历史 REST 查询
  └─ consumers.py：实时与五分钟历史 WebSocket 查询

PostgreSQL
  ├─ gps_parse_copy1
  ├─ pri_parse
  ├─ picarro_parse
  ├─ windspeed_parse
  └─ meteorological_station（仅实时查询关联）
```

## 4. 页面区域与功能说明

### 4.1 左侧区域

左侧区域在实时模式始终显示；历史模式只有在用户点选到历史数据并将 `checkData` 设为真后显示。可通过侧边箭头收起。

| 区域 | 组件 | 输入 | 当前展示内容 |
| --- | --- | --- | --- |
| 气象信息 | `Weather.vue` | `weather_location_data`、`gasdata` | 当前天气、小时预报、七日预报，以及气象站风向、风速、湿度、气压。 |
| CH4 时序变化 | `Charts.vue` | `chartName="CH4"`、`gasdata` | PRI CH4 与 Picarro CH4 的五分钟时间序列。 |
| CO2 时序变化 | `Charts.vue` | `chartName="CO2"`、`gasdata` | PRI CO2 与 Picarro 12CO2 的五分钟时间序列。 |

#### 气象信息

天气组件有两个数据来源：

1. QWeather 的逐小时与七日预报。前端按 `location[0],location[1]` 直接请求外部服务。
2. 实时数据包中的气象站字段：`pressure`、`speed_of_true_wind`、`direction_of_true_wind`、`relative_humidity`。

逐小时预报包含天气文本、图标、温度曲线、风速与风向。七日预报包含日期、日间天气、温度曲线和降水量。

当前天气定位的更新频率不是每条实时消息一次。页面以 `num % 300 === 0` 为条件更新 `weather_location_data`。如果一秒一条数据，大约每 300 秒更新一次位置。

### 4.2 中央地图区域

地图区域包含以下控件与状态。

| 控件 | 状态字段/方法 | 当前行为 |
| --- | --- | --- |
| 工具箱展开 | `boxShow` | 打开或隐藏地图设置区。 |
| 视角跟随 | `viewFlag` | 实时二维地图会将中心移动到最新点；三维地图会尝试跟随车辆实体。 |
| 地图类型 | `mapType`、`checkMapType()` | `1` 为二维 OpenLayers，`2` 为三维 Cesium。两个组件均会挂载，非当前地图只通过 `v-show` 隐藏。 |
| 气体大类 | `gasType`、`changeGas()` | 切换 `PRI` 与 `Picarro` 可选字段集合。 |
| 气体字段 | `gasName`、`gasValue`、`checkGasName()` | 用于阈值读取、图例和地图浓度着色。 |
| 查询方式 | `searchType`、`changeSearch()` | `1` 为实时，`2` 为历史。切入历史会关闭当前 WebSocket。 |
| 历史日期 | `day` | 日期格式为 `yyyy-MM-dd`。 |
| 历史时间范围 | `value1` | 起止时间格式为 `HH:mm:ss`。 |
| 历史搜索 | `searchHistory()` | 当前没有使用日期和时间范围，只重载本地缓存。 |
| 阈值设置 | `dialogVisible` | 打开 `RangeConfig`，修改 Vuex 内存中的区间。 |
| 清除数据 | `clearData()` | 清空 `mapList`、移除 `localStorage.mapList`、清理地图图层；实时流继续存在。 |

“现场照片”和“卫星”在页面中只有标签与图标，没有事件处理、数据接口、模态框或跳转地址。

### 4.3 右侧区域

右侧区域在实时模式显示；历史模式需点选数据后显示。可通过侧边箭头收起。

| 图表 | `chartName` | 主要字段 | 说明 |
| --- | --- | --- | --- |
| 风速浓度分布 | `windspeed` | `r`、`angle`、`pri_ch4` | 将风速大小、风向和 CH4 分段展示在极坐标散点图。 |
| 实时监测 | `realTime` | `pri_ch4`、`pri_c2h6`、`pri_co2`、`pri_co` | 显示 CH4/C2H6、CO2/CO 值及两个比值。 |
| 甲烷碳同位素变化 | `iCH4` | `picarro_delta_ich4_raw` | 显示五分钟甲烷同位素时间序列。 |

图表共享 `Charts.vue`。该组件在首次数据到达时复制 `newdata.data`，在实时更新后删除本地数组第一项并追加最新项，试图维持五分钟窗口。数据不足五分钟时，会人工加入起始与结束空点。

## 5. 气体字段与阈值

### 5.1 可选字段

| 大类 | 显示名称 | 数据字段 |
| --- | --- | --- |
| PRI | CH4 | `pri_ch4` |
| PRI | C2H6 | `pri_c2h6` |
| PRI | CO2 | `pri_co2` |
| PRI | CO | `pri_co` |
| PRI | N2O | `pri_n2o` |
| Picarro | HP_12CH4_dry | `picarro_hp_12ch4_dry` |
| Picarro | HR_12CH4_dry | `picarro_hr_12ch4_dry` |
| Picarro | 12CO2_dry | `picarro_12co2_dry` |

### 5.2 阈值存储与使用方式

阈值默认定义在 Vuex 的 `state.gasData`。每种气体拥有 5 个区间，例如默认 CH4 区间为：

```text
(0, 2.2]、(2.2, 5]、(5, 20]、(20, 50]、(50, 500]
```

二维和三维地图依次匹配区间，分别使用绿色、黄色、橙色、红色、紫色。所有不在区间内的值显示为“异常”颜色。

阈值弹窗通过 `SET_GasData` 直接修改 Vuex 状态。页面在浏览器刷新前把整个 `gasData` 写到 `sessionStorage.GasData`，下次进入页面时再直接恢复。当前没有服务端持久化、版本、审计、按用户隔离或输入校验。

## 6. 实时数据流程

### 6.1 建立连接

前端从 `localStorage.token` 读取 JWT，拼接 WebSocket URL：

```text
ws://127.0.0.1:18080/chat/socket/?token=<JWT>
```

后端中间件解析查询参数，解码 JWT 后把用户放入 `scope.user`。`ChatView.connect()` 只接受已认证且拥有 `can_visit_realtime` 或管理员权限的用户。

连接成功后，前端立即发送一次：

```json
{ "command": "history_data_5min" }
```

随后每秒发送：

```json
{ "command": "new_data_gps" }
```

### 6.2 `new_data_gps` 命令

后端以当前上海时区时间减去 `TIME_DELAY`（默认 40 秒）为窗口起点，查询一秒时间窗内最新的 GPS 记录，并通过时间近邻关联 PRI、Picarro、风速和气象站数据。

有数据时，响应包含：

```json
{
  "code": "200",
  "msg": null,
  "3m_dis": false,
  "distance": null,
  "data": [
    {
      "time": "YYYY-MM-DD HH:mm:ss",
      "latitude": 0,
      "longitude": 0,
      "altitude": 0,
      "geo_location": [0, 0],
      "pri_ch4": 0,
      "pri_co2": 0,
      "pri_c2h6": 0,
      "pri_co": 0,
      "pri_n2o": 0,
      "pri_h2o": "0",
      "picarro_hp_12ch4_dry": 0,
      "picarro_hr_12ch4_dry": 0,
      "picarro_12co2_dry": 0,
      "picarro_delta_ich4_raw": 0,
      "picarro_h2o": 0,
      "wind": [0, 0],
      "angle": "0",
      "r": 0,
      "speed": 0,
      "pressure": 0,
      "speed_of_true_wind": 0,
      "direction_of_true_wind": 0,
      "relative_humidity": 0,
      "picarro_ch4": 0
    }
  ]
}
```

`3m_dis` 与 `distance` 是通过相邻实时坐标估算的移动距离标记。前端当前没有将这两个字段呈现为独立交互。

无最新数据时，后端仍返回一个字段齐全、数值为 `null` 的占位点，业务 code 为 `"400"`。前端会把 `msg` 写入连接状态。

### 6.3 实时前端更新

前端收到任意 WebSocket 消息后执行以下操作：

1. 将整个响应赋值给 `gasdata`，触发全部图表与天气组件更新。
2. 将整个响应赋值给 `detailData`，并显示详情面板。
3. 当响应 code 为 `200` 且初始五分钟请求已完成时，将最新点追加到 `mapList`。
4. 二维地图监听 `mapList` 深度变化，移动车辆并增加一个浓度点。
5. 三维地图也监听同一个 `mapList`，即使当前页面显示的是二维地图。

实时模式切换没有幂等保护。重复点击“实时数据”会多次建立连接并创建多个 `setInterval`，而状态对象只保存最后一个 timer 句柄。

## 7. 历史查询流程

### 7.1 设计上的目标流程

历史查询应按如下顺序执行：

```text
选择日期和时间范围
  -> 校验开始时间、结束时间和范围上限
  -> GET /api/chart/dataTrans/between
  -> 返回时间范围内的走航点
  -> 保存 historyData
  -> 按地图类型渲染浓度点或轨迹
  -> 点击点位
  -> GET /api/chart/dataTrans/5min?time=<点位时间>
  -> 更新详情与两侧五分钟图表
```

### 7.2 当前实际流程

当前搜索按钮调用 `searchHistory()`，但这个方法仅执行：

```javascript
this.mapList = JSON.parse(localStorage.getItem("mapList")) || [];
```

因此用户选择的 `day` 与 `value1` 不参与请求，`getTimeLapse(startTime, endTime)` 不会被调用。页面展示的“查询时间”只是表单回显，并不代表地图数据的实际时间范围。

### 7.3 历史 REST API

| API | 请求方式 | 参数 | 权限 | 预期用途 |
| --- | --- | --- | --- | --- |
| `/api/chart/dataTrans/between` | GET | `start_time`、`end_time` | `can_visit_history` 或管理员 | 查询指定时间范围的走航数据。 |
| `/api/chart/dataTrans/5min` | GET | `time` | `can_visit_history` 或管理员 | 查询选中时间点前后五分钟数据。 |

两条接口通过 `dataTrans_time_between_async()` 执行 SQL。当前实现存在以下行为边界：

- 未提供参数时返回 HTTP 400。
- 时间字符串解析失败没有显式校验，后续调用可能抛异常。
- SQL 仍引用 `picarro.pic_12co2_dry`，实际字段为 `co2_12_dry`，历史查询会失败。
- 异常时异步函数返回 `({"error": "..."} , 500)` 元组；外层把非空元组判断为成功并生成业务 code `"200"`。
- 异常发生在 `fetch()` 或数据转换后时，`conn.close()` 不会执行。

### 7.4 五分钟历史 WebSocket 命令

`history_data_5min` 不是用户日期范围查询，而是“当前时间减延迟”的最近五分钟数据。它在实时页面刚连接时自动调用，用来初始化五分钟图表。

该命令存在两个契约问题：

1. SQL 中的 `hr_12ch4_dry`、`hp_12ch4_dry` 没有别名为前端所需的 `picarro_hr_12ch4_dry`、`picarro_hp_12ch4_dry`。
2. 命令没有单独检查历史权限。

## 8. 地图功能说明

### 8.1 二维地图

二维地图使用 OpenLayers，初始中心位于固定坐标 `[104.81769266666667, 28.169435333333332]`，默认缩放级别为 21。地图有 3 个业务图层：

| 图层 | 内容 | 更新方式 |
| --- | --- | --- |
| 车辆图层 | 走航车辆图标 | 新实时点到达时更新位置与朝向。 |
| 轨迹图层 | 历史播放线段 | 轨迹模式下每 200 ms 追加一段线。 |
| 浓度点图层 | 实时或历史气体浓度点 | 根据当前 `gasValue` 与阈值范围着色。 |

实时模式下，`drawRealtimePoint()` 会移动车辆、按当前气体字段计算颜色，并绘制半径为 2 的点。历史浓度模式调用 `createCircle()`，绘制半径为 5 的点。

`createCircle()` 每次执行都会调用 `bindClickEvent()`。该方法向 OpenLayers map 添加新的 `singleclick` 监听器，但没有保存或移除旧监听器。重复查询、阈值修改、气体切换和二维/三维切换后，单次点击可能触发多次详情请求。

### 8.2 三维地图

三维地图使用 Cesium。实时模式中，每个数据点对应一个随阈值变化高度和颜色的柱体，并绘制车辆模型。历史浓度模式使用 `echartsPlay()` 批量创建柱体；轨迹模式使用 `drawLine()` 与 `SampledPositionProperty` 播放车辆。

当前三维地图具有以下实现事实：

- 组件与二维地图同时挂载，只使用 `v-show` 隐藏。
- `requestRenderMode` 配置为 `false`，隐藏时仍可能持续渲染。
- 清理函数命名为 `destroy()`，不是 Vue 2 生命周期钩子，不会自动执行。
- 每次 `echartsPlay()` 都创建新的 `ScreenSpaceEventHandler`，旧 handler 不销毁。
- Cesium 和天地图 token 被写入浏览器代码。

## 9. 图表功能说明

### 9.1 CH4 与 CO2 时序图

两张时序图使用 `lineChart()`：

- CO2：Picarro `picarro_12co2_dry` 与 PRI `pri_co2`。
- CH4：当 `picarro_hp_12ch4_dry < 12` 时使用 HP 值，其他情况应使用 HR 值；同时显示 PRI `pri_ch4`。

当前 CH4 的高值分支引用了未声明的 `picarro_hr_12ch4_dry`，应从当前行对象读取。高值数据到达时，图表 option 构建抛出 `ReferenceError`，浏览器已复现。

### 9.2 风速浓度分布图

风速浓度图按 `pri_ch4` 划分 5 个浓度等级，输入为：

```text
[风速大小 r, 风向 angle, CH4 浓度, 时间]
```

该图不随用户选择的气体字段变化，始终使用 `pri_ch4`。因此其“风速浓度分布”实际是 PRI CH4 分布，而不是当前地图选中气体的分布。

### 9.3 实时监测图

实时监测图读取最后一个数据点，显示：

- CH4 与 C2H6；
- CO2 与 CO；
- `C2H6 / CH4`；
- `CO / CO2`。

当分母为 0 时，当前代码把比值保留为 0，而不是标记为无效或不可计算。

### 9.4 甲烷碳同位素图

甲烷碳同位素图读取 `picarro_delta_ich4_raw`，展示最近五分钟的时间序列。空值会保留首尾时间点，以维持横轴范围。

## 10. 详情面板

详情面板显示当前实时点或历史点选中的数据：

- 经度、纬度、海拔；
- Picarro 水汽、PRI 水汽；
- 时间；
- 实时模式下的车速；
- 历史模式下当前选择气体的 ppm 值。

详情组件通过 `detailData` 判断数据结构：如果传入对象带 `data` 数组，则使用 `data[0]`；否则把传入对象本身当作点位。这种双形态约定没有类型定义，调用方必须保证对象结构正确。

历史点选成功后，页面尝试设置 `rightFlag - true`。这是算术表达式，不会恢复被关闭的右侧图表区域。

## 11. 浏览器存储与状态恢复

| 存储键 | 位置 | 内容 | 当前用途 |
| --- | --- | --- | --- |
| `token` | `localStorage` | JWT access token | REST 请求头、WebSocket URL。 |
| `time` | `localStorage` | 前端计算的 48 小时过期时间 | 路由守卫。 |
| `user` | `localStorage` | 登录请求参数与 token | 前端用户信息。 |
| `userform` | `localStorage` | 登录响应 | 用户资料和权限标识。 |
| `mapList` | `localStorage` | 实时地图点列表 | 刷新后恢复地图点，也被错误地当作历史搜索结果。 |
| `GasData` | `sessionStorage` | 各气体阈值区间 | 刷新后恢复本次浏览器会话内的阈值。 |

当前存储策略没有容量上限。实时 `mapList` 会持续追加，长时间开启页面后可能造成浏览器存储与内存增长。

## 12. 当前未交付或不可靠能力

以下内容出现在页面或代码中，但不应视为已验收功能：

1. 历史日期范围查询。
2. 历史轨迹图切换。界面和 `changeGraph()` 已整体注释。
3. 现场照片。
4. 卫星功能。
5. 阈值的后端持久化、用户隔离、审计与恢复。
6. 三维地图的安全释放和性能稳定性。
7. 演示图表与真实监测数据的明确隔离。
8. 键盘可操作、焦点状态、屏幕阅读器语义。

## 13. 当前验证范围与限制

已完成的验证包括：受保护路由跳转、管理员登录、主页面渲染、二维地图显示、WebSocket 建连、浏览器控制台与网络检查、历史 SQL 直接调用、Django 检查、现有 WebSocket 测试、前端构建和 lint。

未完成或尚无自动化覆盖的验证包括：历史范围查询成功链路、不同权限用户的历史 WebSocket 拒绝、三维资源释放、连续模式切换、阈值非法输入、慢网络天气、图表高值回归、键盘可访问性和长期运行内存。

详细缺陷、严重度、修复优先级与复验条件见 [数据可视化验收检查报告](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/reports/data-visualization-acceptance-2026-07-19.md)。
