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
  - `two_clear_two_fixed`：两清两固
  - `classified_protection_2_0`：等保2.0
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
- 平台状态：`OPEN`、`FIXING`、`RETESTING`、`FIXED`。

### 报告 `GET /api/v1/reports`

- 分页参数：`page`、`page_size`。
- 过滤参数：`task_id`、`plan_id`。
- 关联摘要：`plan_name`、可空的 `task_name`。
- 列表不返回 `local_path`；预览和下载只能通过鉴权接口访问。
- 新写入的外部 URL 不允许携带用户信息；历史记录若含 URL 凭据，对外返回 `null`。

## 空值与安全边界

- 没有真实来源的展示值返回 `null`、空字符串或空集合，不填充 Mock 数值。
- 前端不得接收或解释 `raw_external`、数据库连接、JWT 密钥、小易 Token、白盒凭据或报告绝对路径。
- 所有列表按当前用户组织隔离；写操作还要经过路由声明的角色校验。
