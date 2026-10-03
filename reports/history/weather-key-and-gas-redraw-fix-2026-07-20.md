# 天气密钥缺失与气体浓度混绘修复记录

## 问题

1. 天气接口返回：

```text
GET /api/chart/weather -> 503
{"code": 503, "message": "天气服务暂不可用", "data": []}
```

2. 实时模式切换气体后，二维/三维地图上旧气体的浓度点或柱状实体没有清掉，导致不同气体的浓度颜色混在同一层里。

## 根因

### QWEATHER_API_KEY 缺失

后端天气接口只从进程环境变量读取 `QWEATHER_API_KEY`。当前本地证据：

- `.env.local` 存在，但没有 `QWEATHER_API_KEY`。
- 当前 shell 环境也没有 `QWEATHER_API_KEY`。
- 仓库内没有保存真实 key 的文件或历史备份；匹配到 `QWEATHER_API_KEY` 的只有 README、计划、天气代码和测试。
- 运行中的后端是在后续排障中重启的，新进程按 `.env.local` 和命令行环境重建配置；由于 `.env.local` 没有天气 key，新进程无法继承旧进程或旧 shell 里可能存在的 key。

因此，这不是天气接口把 key 清空了，而是 key 没有被持久化到当前运行配置。真实 key 不在当前文件系统里，无法从仓库恢复。

### 气体浓度混绘

父页面切换气体时只更新了 `gasName/gasValue`，历史模式会重新渲染，但实时模式没有通知 2D/3D 地图清空旧浓度层并按新字段重绘。

结果是：

- 2D OpenLayers `pointSource` 保留旧气体颜色的点。
- 3D Cesium `entities` 保留旧气体字段计算出的柱状实体。

## 修改

### 天气配置诊断

- `QHZHC_Server/api_chart/weather.py`
  - 增加 `get_qweather_api_key()`，统一读取并 trim `QWEATHER_API_KEY`。
  - 缺少 key 时写服务端 warning 日志，明确提示应在 `.env.local` 或部署 Secret Store 注入。
  - HTTP 响应仍保持通用 503，不向前端暴露环境变量名或密钥细节。

- `README.md`
  - 将 `QWEATHER_API_KEY` 从“天气和地图相关可选变量”移到“数据可视化天气预报必填变量”。
  - 明确缺失时不会使用模拟天气兜底。

### 气体切换重绘

- `DataVisualization/dataVisualization.vue`
  - 实时模式 `checkGasName()` 后调用 `redrawRealtimeConcentration()`。
  - 同步触发 2D 和 3D 地图按当前 `mapList`、当前气体字段重绘。

- `PlanimetricMap.vue`
  - 增加 `redrawConcentrationByGas(gasType, gasName, points)`。
  - 切换气体时更新子组件气体状态，清空 `pointSource`，用当前点集按新字段重绘浓度点。

- `StereoscopicMap.vue`
  - 增加 `redrawConcentrationByGas(gasType, points)`。
  - 切换气体时清空 Cesium 实体，并按新字段重建历史柱和最新点柱。

## 验证

已执行：

```text
QHZHC_SECRET_KEY=test-secret QHZHC_DB_PASSWORD=test ../.venv/bin/python manage.py test api_chart.test_weather api_chart.test_chartdatatrans
```

结果：15 个后端测试通过。

```text
npm run test:unit -- --runInBand
```

结果：55 个前端单元测试通过。

## 当前状态

- 气体切换混绘已通过单元测试覆盖并修复。
- 天气代码已能明确诊断缺失 key，但当前本地仍没有真实 `QWEATHER_API_KEY`，所以真实外部天气服务还不能返回 200。
- 恢复天气需要把真实 key 写入 `.env.local` 或部署环境 Secret Store 后重启后端。

## 2026-07-20 补充恢复记录

用户提供真实和风天气 API key 后，已将 `QWEATHER_API_KEY` 写入本地 `.env.local`。该 id 当前代码未读取，因此未新增无效 id 配置项。

重启后端后，天气接口从原来的缺 key 503 变为 502。进一步定位发现：

- API key 本身可用，直接访问和风 `24h`、`7d` 网格天气接口均返回成功。
- 后端 `.venv` 使用的 Homebrew Python 证书默认路径指向 `/opt/homebrew/etc/openssl@3/cert.pem`，该文件当前不存在。
- 因此 `.venv` 内 `urllib` 请求外部 HTTPS 时触发 `CERTIFICATE_VERIFY_FAILED`。

修复方式：

- 在 `.env.local` 增加 `SSL_CERT_FILE=/etc/ssl/cert.pem`，让后端 Python 使用系统可用 CA bundle。
- 重启 Daphne 后端。

验证结果：

```text
POST /auth/login/ -> 200
GET /api/chart/weather?longitude=104.817693&latitude=28.169435 -> 200
hourly_len=24
daily_len=7
```

当前天气服务已恢复为真实外部预报。
