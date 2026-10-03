# 代码评审报告

- 仓库：2024_QH_ZHC
- 检测模式：通用检测（全文件可视化审查）
- 检测范围：数据可视化前后端调用链全文件审查
- 生成时间：2026-07-19 21:58
- 检查文件：24
- 变更行数：8302

## 缺陷统计

- P0：2
- P1：3
- P2：0
- 合计：5

## P0 告警

- [P0][安全漏洞] QHZHC_Server/api_chart/consumers.py:442 | WebSocket historical-data command bypasses the history permission
- [P0][安全漏洞] QHZHC_Server/sever_main/settings.py:48 | JWT signing key is committed as a static production default

## 缺陷详情

### 1. [P0][安全漏洞] WebSocket historical-data command bypasses the history permission

- 位置：`QHZHC_Server/api_chart/consumers.py:442-442`
- 置信度：10/10

**问题描述**

connect() only checks can_visit_realtime, but this dispatcher exposes history_data_5min to every accepted connection. A user granted realtime access but denied can_visit_history can receive the protected historical dataset.

**修复建议**

Authorize each command before dispatching it: require can_visit_history (or is_superuser) for history_data_5min and can_visit_realtime (or is_superuser) for new_data_gps.

---

### 2. [P0][安全漏洞] JWT signing key is committed as a static production default

- 位置：`QHZHC_Server/sever_main/settings.py:48-48`
- 置信度：10/10

**问题描述**

SIMPLE_JWT signs access tokens with SECRET_KEY. Because this fixed value is committed in source, anyone with repository access can mint valid JWTs containing an arbitrary user_id.

**修复建议**

Load SECRET_KEY from a required deployment secret and fail startup when it is absent; rotate the exposed key and all tokens signed with it.

---

### 3. [P1][健壮性问题] High-range CH4 samples throw while constructing the chart series

- 位置：`QHZHC_Web/src/views/DataVisualization/components/chartData.js:55-55`
- 置信度：10/10

**问题描述**

The branch evaluates an undeclared identifier instead of a field on gas. It throws ReferenceError and aborts CH4 chart rendering.

**修复建议**

Read gas.picarro_hr_12ch4_dry and handle a missing HR value consistently.

---

### 4. [P1][业务语义问题] History search ignores the selected time range

- 位置：`QHZHC_Web/src/views/DataVisualization/dataVisualization.vue:735-746`
- 置信度：10/10

**问题描述**

The history search button only reloads cached real-time mapList from localStorage. Selected day/time values are unused and getTimeLapse() is never called by the UI.

**修复建议**

Restore input validation, build start/end timestamps from day and value1, and call getTimeLapse(startTime, endTime).

---

### 5. [P1][健壮性问题] Historical REST failures are returned as a successful data response

- 位置：`QHZHC_Server/api_chart/chartdatatrans.py:182-182`
- 置信度：10/10

**问题描述**

The callers treat the non-empty tuple as truthy, emit business code 200, and serialize the internal error as data. Clients cannot distinguish failure from valid history.

**修复建议**

Log the exception server-side and map it to a structured HTTP 5xx response; do not return an (error, status) tuple as data.

---
