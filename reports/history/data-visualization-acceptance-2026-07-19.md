# 数据可视化模块验收检查报告

检查日期：2026-07-19

检查范围：`QHZHC_Web/src/views/DataVisualization`、相关路由/请求/WebSocket 代码，以及 `api_chart` 历史与实时数据链路。

验收结论：**不通过，禁止按当前状态上线。**

发现 2 个 P0、17 个 P1、2 个 P2 缺陷；另记录若干 UI、可访问性、死代码和工程质量问题。已验证的运行时故障包括 CH4 图表 `ReferenceError` 与历史 SQL 字段不存在。此次仅做审查，未修改数据可视化业务代码。

## 1. 检查方法与证据

| 方法 | 结论 |
| --- | --- |
| 浏览器访问 `#/dataVisualization` | 已登录管理员可加载主页面，二维地图、天气、左右图表和实时面板可见。 |
| 浏览器控制台 | WebSocket 输出“连接服务端成功了”；随后出现 `ReferenceError: picarro_hr_12ch4_dry is not defined`。ECharts 同时报告废弃的 `itemStyle.normal` 配置。 |
| 浏览器网络 | 页面请求 Cesium、天地图、QWeather 等第三方服务，Cesium、天地图和 QWeather 凭据均可从客户端代码或请求 URL 取得；部分天地图请求走 HTTP。 |
| 历史查询后端实测 | 通过 Django shell 调用历史查询，结果为 `({'error': 'column picarro.pic_12co2_dry does not exist'}, 500)`，证实当前 SQL 与实际表结构不匹配。 |
| 后端基础验证 | `manage.py check` 通过；`manage.py test api_chart --verbosity 2` 通过 2 项 WebSocket 连接/匿名拒绝测试。测试未覆盖历史权限、历史 SQL、响应字段与前端流程。 |
| 前端工程验证 | `npm run build` 成功，但有入口包与大资源警告；`npm run lint` 失败，报告 173 个 error，数据可视化模块包含未定义变量、重复条件、未使用组件和全局变量错误。 |
| 可访问性快照 | 主导航和天气标签可被识别，但地图类型、实时/历史、气体选择、阈值、清除等关键操作使用可点击 `div`，缺少语义、键盘路径与 ARIA，自动化无法以可访问方式操作。 |

## 2. 功能清单与验收状态

| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 路由鉴权 | 部分可用 | 未登录访问会被重定向到登录页；登录成功却固定跳转首页，丢失原目标路由。 |
| 实时 WebSocket 数据 | 部分可用 | 浏览器已连接并收到实时数据；重复点击“实时数据”会重复建连和轮询，离页也没有可靠关闭连接。 |
| 五分钟实时图表 | 部分可用 | 面板可显示；CH4 高值路径确定性抛异常，其他图表数据正确性未形成自动化验证。 |
| 二维地图 | 部分可用 | 浏览器可显示底图、车辆和数据点；历史重绘会叠加点击监听器。 |
| 三维地图 | 未闭环 | 组件在二维模式下仍常驻并持续渲染；清理钩子无效，历史点击事件会累积。未获得可接受的切换与资源释放证据。 |
| 历史时间范围查询 | 不可用 | 前端搜索按钮不读取日期/时间、不调用查询接口，只重载本地实时缓存；即使补上调用，后端 SQL 仍会失败。 |
| 历史点选与五分钟详情 | 不可靠 | 后端历史接口错误会伪装为成功；右侧图表不会因点选恢复显示。 |
| 气体类别/字段选择 | 部分可用 | 有 UI 和局部重绘代码，但依赖历史数据与地图生命周期，未形成稳定端到端流程。 |
| 阈值配置与图例 | 不可靠 | 可编辑并提交到 Vuex，但不校验数值、区间顺序、重叠或间隙，错误配置会立即影响地图分类。 |
| 天气预报 | 部分可用 | 当前小时/七日数据直接由浏览器请求；临时失败会抑制后续刷新，周报图在加载前可能崩溃。 |
| “现场照片”“卫星” | UI 占位 | [模板](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/dataVisualization.vue#L225-L236)中没有绑定点击行为、数据源或失败态。 |
| “清除数据” | 仅本地清理 | 只删除浏览器 `mapList` 与当前图层，实时连接会继续推送并重新填充；没有明确的业务确认或服务端清理语义。 |
| 演示图表 | 不应作为生产功能 | `/showChart` 可访问并随机生成传感器、风速和坐标数据，真实页面与演示页面边界不清。 |

## 3. 阻断问题

### P0-01 WebSocket 绕过历史权限

[命令分发](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Server/api_chart/consumers.py#L438-L476)只在连接时检查 `can_visit_realtime`，却允许任何已连接用户发送 `history_data_5min`。REST 历史接口要求 `can_visit_history`，两条通道的权限契约不一致。

影响：仅有实时权限的用户可读取受保护历史数据。

修改意见：按命令执行权限校验。`new_data_gps` 校验实时权限，`history_data_5min` 校验历史权限，拒绝时发送统一的 403 业务响应并停止分发。补充“实时允许、历史拒绝”的 Channels 集成测试。

### P0-02 JWT 签名密钥已提交到仓库

[settings.py](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Server/sever_main/settings.py#L47-L48)包含固定 `SECRET_KEY`，而 [SIMPLE_JWT](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Server/sever_main/settings.py#L135-L149)直接用它签发 token。

影响：具备仓库读取权限的人可伪造任意 `user_id` 的 JWT，并访问 REST 和 WebSocket。

修改意见：立即轮换密钥并使存量 token 失效；密钥仅从部署 Secret 注入，缺失即拒绝启动；从 Git 历史和构建产物中清理泄露值。

## 4. 主要功能与数据链路问题

| 编号 | 级别 | 问题与证据 | 修改意见 |
| --- | --- | --- | --- |
| F-01 | P1 | [CH4 图表](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/chartData.js#L52-L56)在 `hp_12ch4_dry >= 12` 时引用未定义变量。浏览器已复现 `ReferenceError`。 | 改为 `gas.picarro_hr_12ch4_dry`，并为缺失 HR 值定义降级策略与单测。 |
| F-02 | P1 | [历史搜索](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/dataVisualization.vue#L735-L746)只读取 `localStorage.mapList`，日期、时间范围和 `getTimeLapse` 全被注释。 | 恢复必填校验、构造 `start_time/end_time`、调用接口；只在成功后切换历史 UI 和隐藏时间面板。 |
| F-03 | P1 | [历史 SQL](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Server/api_chart/chartdatatrans.py#L126-L129)使用不存在的 `picarro.pic_12co2_dry`，实测已失败。 | 改为表中真实字段 `co2_12_dry`，用真实 PostgreSQL schema 的集成测试锁定字段契约。 |
| F-04 | P1 | [异常处理](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Server/api_chart/chartdatatrans.py#L155-L182)返回 `(error, 500)` 元组；调用方把非空元组当成功数据，产生业务 code 200。 | 记录内部错误，统一返回 HTTP 5xx/明确业务失败；不要把数据库错误文本返给前端。 |
| F-05 | P1 | 历史查询 `fetch` 或数据转换失败时，连接关闭代码不会执行。 | 用 `async with` 或 `finally` 关闭 `asyncpg` 连接；添加失败路径的连接数回归测试。 |
| F-06 | P1 | [WebSocket 历史查询](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Server/api_chart/consumers.py#L365-L421)没有为 CH4 字段取前端期望的别名，`get_picarro_ch4` 会得到 `None`。 | 统一历史 REST、历史 WebSocket、实时 WebSocket 的 DTO 与字段别名，并用 schema test 校验。 |
| F-07 | P1 | [周天气图](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/chartData.js#L1281-L1296)在异步数据未到达时访问 `dataY2[0][1]`。 | 空数组先显示 loading/empty option；响应校验后再初始化图表。 |
| F-08 | P1 | [实时模式切换](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/dataVisualization.vue#L705-L732)重复点击会重复建 WebSocket 和 interval，旧 timer 句柄丢失。 | 模式切换幂等化；切换前主动 close 旧 socket、clear 旧 timer，加入连接状态机。 |
| F-09 | P1 | [销毁代码](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/dataVisualization.vue#L492-L500)仅读取 `this.websock.onclose`，没有调用 `close()`；`beforeunload` 监听也未解绑。 | 使用 `beforeDestroy` 做幂等资源清理，显式关闭 socket、解绑监听、清除全部 timer。 |
| F-10 | P1 | [登录成功](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/loginPage.vue#L358-L375)固定跳转 `/index`，与路由守卫 `redirect` 不一致。 | 校验并消费内部 `redirect`，缺失时才回退首页。 |
| F-11 | P1 | [Axios 拦截器](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/utils/request.js#L37-L83)不处理 401；后端无效 token 返回 401。 | 401/认证类 403 走同一退出与回跳逻辑，防止 UI 保留过期认证态。 |
| F-12 | P2 | [点选成功路径](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/dataVisualization.vue#L786-L791)写成 `this.rightFlag - true`，右栏不会恢复。 | 改为 `this.rightFlag = true` 并增加点选 UI 用例。 |

## 5. 地图、阈值与 UI 问题

| 编号 | 级别 | 问题与证据 | 修改意见 |
| --- | --- | --- | --- |
| M-01 | P1 | [二维地图](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/PlanimetricMap.vue#L541-L595)每次历史重绘都 `map.on` 一次。重复查询、阈值或气体变更后，单击会触发多份回调。 | 初始化时仅绑定一次，保存 listener key，在卸载时移除。 |
| M-02 | P1 | [三维历史绘制](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/StereoscopicMap.vue#L400-L511)每次新建 `ScreenSpaceEventHandler`，旧闭包和旧数据不释放。 | 组件持有唯一 handler，重绘前 `destroy()` 旧 handler，卸载时再清理。 |
| M-03 | P1 | [三维组件](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/StereoscopicMap.vue#L62-L67)使用不存在的 Vue 2 `destroy()` 生命周期钩子。 | 改为 `beforeDestroy`/`destroyed`，释放 viewer、data sources、entities、handlers。 |
| M-04 | P1 | 三维地图通过 `v-show` 隐藏，且 `requestRenderMode: false`，二维模式仍保留 WebGL 持续渲染与实时 watcher。 | 采用条件挂载或暂停/恢复策略；启用按需渲染。 |
| M-05 | P1 | Cesium、天地图凭据硬编码在 [二维](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/PlanimetricMap.vue#L219-L227) 与 [三维](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/StereoscopicMap.vue#L71-L89)客户端。浏览器网络已直接暴露。 | 轮换全部凭据；使用域名/配额限制的公钥或服务端代理；禁止将私密 token 打包到前端。 |
| M-06 | P2 | 部分瓦片 URL 是 HTTP，HTTPS 页面存在混合内容、劫持和浏览器拦截风险。 | 全部升级 HTTPS，发布前加 CSP 与资源完整性检查。 |
| U-01 | P1 | [阈值弹窗](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/RangeConfig.vue#L69-L80)接受文本、倒置区间、重叠区间和间隙，直接影响图例/点位颜色。 | 使用数值输入和表单规则：有限数、下界小于上界、全序且不重叠；校验失败不得关闭弹窗。 |
| U-02 | P2 | 地图模式、气体、查询方式、阈值和清除操作主要是可点击 `div`。 | 改为 `button`/Element UI Button，提供可见焦点、`aria-pressed`、键盘操作、禁用态与加载态。 |
| U-03 | P2 | “现场照片”“卫星”只有图标和标题，没有事件、接口、空态或错误提示。 | 明确需求后实现，或在验收版本移除未交付入口。 |
| U-04 | P2 | 图形展示切换 UI 与 `changeGraph` 整段逻辑被注释，历史轨迹模式不可由用户选择。 | 删除废弃代码，或恢复为已测试、可发现的功能。 |

## 6. 安全与外部依赖问题

1. WebSocket JWT 以 `?token=` 形式拼到 URL：
   [前端](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/dataVisualization.vue#L510-L514)和[中间件](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Server/api_auth/middleware.py#L38-L46)均可确认。
   token 会进入浏览器历史、代理、服务端日志与监控链路。应改为受限 HttpOnly Cookie，或使用仅握手可见、不会进入 URL 日志的认证方案。

2. [登录页](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/loginPage.vue#L358-L360)打印完整登录响应；浏览器控制台已记录响应对象。
   删除敏感 console 输出，生产构建禁止调试日志。

3. [天气组件](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/Weather.vue#L593-L629)在浏览器端使用 QWeather key。
   轮换 key，并将取数移至后端；前端只消费脱敏、限流、缓存后的业务接口。

4. 天气方法在发起请求前写入 `currentTime/currentDay`。若网络、HTTP 或 JSON 解析失败，本小时/本日不再重试。
   仅在成功并完成数据校验后更新缓存标记，并加入超时、错误 UI 和有界重试。

## 7. 代码规范、死代码和可维护性

1. `npm run lint` 有 173 个 error。可视化范围内的直接错误包括：
   `chartData.js` 未定义变量/未使用 import，`dataVisualization.vue` 重复 `else if`，`WindCharts` 已注册未渲染，`StereoscopicMap.vue` 大量未声明的 `Cesium` 全局与未使用变量。

2. 单文件过大且职责混杂：
   [dataVisualization.vue](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/dataVisualization.vue) 1,468 行，
   [chartData.js](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/chartData.js) 1,449 行，
   [StereoscopicMap.vue](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/StereoscopicMap.vue) 708 行，
   [PlanimetricMap.vue](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/PlanimetricMap.vue) 687 行。
   建议按“数据适配层、图表 option 工厂、实时连接、历史查询、地图渲染、页面状态”拆分。

3. 无用或遗留实现：
   [WindCharts.vue](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/components/WindCharts.vue)被注册却未渲染；
   [dataVisualization1.vue](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/views/DataVisualization/dataVisualization1.vue)没有路由入口；
   [utils/websocket.js](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/utils/websocket.js)没有被当前模块导入，且保留私网地址和无上限重试；
   `showChart` 是随机数据演示，却被生产路由暴露。

4. 运行配置不应硬编码：
   [request.js](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/QHZHC_Web/src/utils/request.js#L7-L12)固定 `127.0.0.1:18080`，限制部署环境并与协议/网关配置耦合。
   应通过构建时环境变量或同源 `/api` 代理统一管理。

5. ECharts 已报告 `itemStyle.normal` 废弃警告。应按当前 ECharts API 迁移，避免未来升级后样式失效。

## 8. 建议整改顺序

### 第一阶段：立即阻断上线风险

1. 轮换 Django `SECRET_KEY`、所有 Cesium/天地图/QWeather key，清理历史泄露和浏览器调试输出。
2. 为 WebSocket 每个命令实施权限校验；补足“实时用户不可读历史”的测试。
3. 修复历史 SQL 字段、异常响应和连接关闭，确保数据库失败返回明确 5xx。
4. 修复 CH4 未定义变量，加入高浓度数据回归测试。

### 第二阶段：闭合主业务链路

1. 重写历史查询状态机：日期时间校验 -> REST 查询 -> loading -> 地图/图表/详情联动 -> empty/error state。
2. 统一实时、历史 REST、历史 WebSocket 的 DTO 和字段命名，采用共享 schema/adapter。
3. 修复登录回跳、401 退出、重复实时连接和页面销毁清理。
4. 设定阈值的强校验和保存语义，明确“清除数据”仅清本地还是清服务端。

### 第三阶段：地图、体验和工程治理

1. 收敛二维/三维地图的事件、timer、WebGL 生命周期；二维模式不保留三维持续渲染。
2. 将所有操作改为语义化控件，补充键盘与屏幕阅读器支持。
3. 删除或隔离 demo、注释块、死组件和废弃 WebSocket；拆分超大文件。
4. 修复 lint，设置 CI 门禁为 `lint + build + backend tests + frontend unit tests`。

## 9. 复验准入条件

以下全部通过后，才建议重新验收：

| 场景 | 通过标准 |
| --- | --- |
| 权限 | 只有实时权限的用户无法从 REST 或 WebSocket 获取历史数据；伪造/过期 token 被统一拒绝。 |
| 历史查询 | 输入有效范围后实际请求 `/api/chart/dataTrans/between`；返回的数据、地图、图表和详情的时间范围一致。 |
| 历史失败 | SQL、网络、空数据和权限失败均显示可理解错误，不返回业务 code 200，不泄露数据库信息。 |
| 实时数据 | 多次点击实时模式最多保留一个 WebSocket 和一个 timer；离开页面后两者均关闭。 |
| 图表 | CH4 高值、空五分钟、空/慢七日天气数据都不抛异常；ECharts 控制台无废弃配置告警。 |
| 地图 | 连续执行至少 10 次“历史查询 -> 气体切换 -> 阈值更新 -> 2D/3D 切换”，每次点击只触发一次详情请求，离页后无持续 WebGL/事件处理器。 |
| 阈值 | 非数值、倒置、重叠、间隙输入不可提交，并显示具体校验提示。 |
| 可访问性 | 所有主要动作可通过 Tab/Enter/Space 操作，状态能被辅助技术读取。 |
| 工程质量 | `npm run lint` 零 error；`npm run build` 无新增阻断错误；新增的前端、后端和浏览器流程测试在 CI 通过。 |

## 10. 关联产物

- [Code Guard HTML 报告](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/reports/data-visualization-code-review.html)
- [Code Guard Markdown 报告](file:///Users/bytedance/cx/spec-2/cxdlogver/2024_QH_ZHC/reports/data-visualization-code-review.md)
- [全部审查结构化发现](file:///tmp/2024_QH_ZHC_data_visualization_1784468559/comments.jsonl)
