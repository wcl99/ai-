# 平台 API 契约

本文件记录 React 前端可依赖的平台契约。浏览器只调用平台 `/api/v1/*`；小易原始字段、凭据和本地文件路径不属于前端契约。

## 鉴权

- `POST /api/v1/auth/login`：提交 `username`、`password` 和可选 `org_id`。
- `GET /api/v1/auth/me`：返回当前有效用户；未登录或账号停用返回 `401 UNAUTHORIZED`。
- `POST /api/v1/auth/logout`：使 `access_token` Cookie 立即过期。
- 浏览器使用 HttpOnly Cookie，不把 Token 写入 Web Storage。HTTPS 环境必须设置 `COOKIE_SECURE=true`。
- API 客户端或数字人仍可使用 `Authorization: Bearer <token>`；浏览器优先使用同源 Cookie。

## 通用响应

带 envelope 的成功响应：

```json
{
  "success": true,
  "message": "ok",
  "data": {}
}
```

分页数据：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 20
}
```

错误响应：

```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Human-readable message",
  "details": null
}
```

常用状态码为 `401` 未认证、`403` 无权限、`404` 资源不存在、`409` 状态冲突、`422` 输入不合法。前端不得依赖未记录的 `details` 内部结构。

## 渗透测试计划 `POST /api/v1/scan-plans`

- `test_type`：任务大类；渗透测试固定使用 `standard`。
- `scan_mode`：场景模式，支持：
  - `standard`：标准渗透
  - `two_high_one_weak`：两高一弱
  - `two_high_one_weak`：两清两固（小易当前与“两高一弱”共用该模式值）
  - `mlps_2_0`：等保2.0
- `scan_speed`：执行速度，支持 `quick`、`standard`、`deep`。
- 场景与速度随计划快照冻结，授权确认后由平台原样写入小易正式任务上下文。

## 资源列表

### 任务 `GET /api/v1/tasks`

- 分页参数：`page`、`page_size`。
- 过滤参数：`status`。
- 关联摘要：`plan_name`、`test_type`、`targets`、`created_by_name`。
- 平台状态：`QUEUED`、`RUNNING`、`CANCELLING`、`SUCCEEDED`、`PARTIAL_SUCCEEDED`、`FAILED`、`CANCELLED`。

### 资产 `GET /api/v1/assets`

- 分页参数：`page`、`page_size`。
- 关键字段：`asset_key`、`asset_type`、`address`、`service`、`owner`、`authorized`、`data_json`、`created_at`、`updated_at`。
- `data_json` 是受控业务扩展数据，不代表小易原始响应契约。

### 漏洞 `GET /api/v1/vulnerabilities`

- 分页参数：`page`、`page_size`。
- 过滤参数：`severity`、`status`。
- 关联摘要：可空的 `task_name`。
- `tags` 仅返回 `data_json.tags` 中的字符串，非字符串值会被丢弃。

### 漏洞总览 `GET /api/v1/vulnerabilities/overview`

- 查询参数：`range=today|3d|7d|all`，默认 `7d`；`timezone` 接收 IANA 时区，缺省或无效时回退到 `Asia/Shanghai`。
- `metrics` 是当前组织的全量漏洞指标；`risk_distribution`、`source_distribution` 是当前组织的全量分布。
- `trend` 仅统计所选时间范围，按时间升序返回 `{start, count}`，没有数据的时间桶也会返回 `count: 0`。
- `today` 从客户时区当日 00:00 到当前小时，按小时；`3d` 为最近 72 个小时；`7d` 为最近 7 个自然日；`all` 从首条记录开始，跨度不足 90 天按日，否则按月。
- 数据库过滤采用 UTC 的左闭右开边界，展示桶按客户时区计算。来源缺失时归为 `xiaoyi`（小易回传）。
- `recommendations` 是根据真实严重度、状态计数生成的确定性建议，不调用模型补造结论。
- 平台状态：`OPEN`、`FIXING`、`RETESTING`、`FIXED`。

### 报告 `GET /api/v1/reports`

- 分页参数：`page`、`page_size`。
- 过滤参数：`task_id`、`plan_id`。
- 关联摘要：`plan_name`、可空的 `task_name`。
- 列表不返回 `local_path`；预览和下载只能通过鉴权接口访问。

### 报告总览 `GET /api/v1/reports/overview`

- 时间参数、时区回退、桶边界和零值补齐规则与漏洞总览一致。
- `metrics` 返回总数、完整报告数、部分报告数、近 7 日新增数和最新生成时间。
- `source_distribution` 按平台生成/小易回传聚合；存在 `external_url` 的报告归为小易回传。
- `level_distribution` 将 `standard`、`partial` 映射为标准报告、部分结果，其他值归为其他。
- `trend` 统计所选范围内的报告生成数量；`insights` 只解释当前聚合结果。

### 总览性能约束

- 漏洞与报告均使用 `(org_id, created_at)` 复合索引，聚合在数据库内完成，不把明细行加载到应用进程。
- 目标数据规模为单组织万级；专用 PostgreSQL 性能检查要求预热后接口 P95 不高于 300ms，页面切换目标不高于 500ms。
- 性能检查仅在显式配置 `OVERVIEW_PERF_DATABASE_URL` 时运行，并在独立临时 schema 内创建和清理测试数据。
- 新写入的外部 URL 不允许携带用户信息；历史记录若含 URL 凭据，对外返回 `null`。

## 空值与安全边界

- 没有真实来源的展示值返回 `null`、空字符串或空集合，不填充 Mock 数值。
- 前端不得接收或解释 `raw_external`、数据库连接、JWT 密钥、小易 Token、白盒凭据或报告绝对路径。
- 所有列表按当前用户组织隔离；写操作还要经过路由声明的角色校验。
