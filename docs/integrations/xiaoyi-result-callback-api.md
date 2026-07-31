# 小易数字人接口兼容说明

平台的数字人接口以项目工作区提供的《数字人对接文档》为外部契约。小易侧只需要把原基础地址替换为平台地址，不需要增加字段或改变既有调用顺序。

本文不包含真实账号密码。包含体验环境账密的交付版本保存在仓库外，由项目负责人单独提供给小易对接人员。

## 基础地址

- 体验环境：`http://101.43.119.26:8000`
- 生产环境应使用 HTTPS。
- 数据格式：`application/json; charset=utf-8`
- 鉴权：先登录获取 JWT，后续使用 `Authorization: Bearer <JWT_TOKEN>`。

## 兼容路径

- `POST /api/auth/login`
- `POST /api/ai/upload-vulnerability`
- `POST /api/ai/upload-report`
- `POST /api/ai/upload-log`
- `POST /api/ai/upload-asset`
- `POST /api/ai/create-test-plan`
- `POST /api/ai/start-test-plan`

请求字段、可选性和调用顺序以原《数字人对接文档》为准。

## 平台内部适配

小易不需要感知以下平台实现细节：

- 数字 `plan_id` 自动映射到平台 UUID 计划。
- 只传 `plan_id` 时，平台自动关联该计划的当前任务。
- 不传 `plan_id` 时，如果组织内只有一个运行任务，平台自动归属该任务。
- 如果多个任务同时运行且没有足够标识，平台拒绝猜测，避免结果串到错误任务。
- 平台仍兼容额外的 `task_id`，但它不是原数字人文档要求小易新增的字段。
- 数字 `org_id` 作为外部组织上下文，实际数据隔离以 JWT 账号所属平台组织为准。

## 结果处理

### 漏洞

- 保存 `data` 的完整结构化内容。
- 未传 `asset_key` 时，根据 `data.ip` 和 `data.port` 生成。
- 漏洞等级依次使用顶层 `severity`、`data.severity`、`data.level`，默认 `medium`。
- 支持原文档声明的 URL、方法、Payload、请求包和响应包历史别名。

### 报告

- 普通文件名配合 `content` 写入平台报告目录。
- `filename` 为 HTTP/HTTPS URL 时保存外链，不创建本地文件。
- 未提供文件名时生成 `ai_report_<timestamp>.<format>`。
- 成功响应提供原文档要求的顶层 `report_path`。

### 日志

- 接受原文档中的 `user_id`，但实际写入身份以 JWT 账号为准。
- 警告、错误和关键完成动作会同步到任务事件。

### 资产

- 接受原文档资产对象的自定义字段。
- 未传 `asset_key` 时，根据主机和端口生成。
- 同一资产可以分别归属于不同测试计划。

## 响应

数字人接口成功字段位于顶层，例如：

```json
{
  "success": true,
  "message": "漏洞已接收",
  "plan_id": 123,
  "org_id": 1
}
```

失败响应遵循原文档：

```json
{
  "success": false,
  "error": "错误原因"
}
```

只有 HTTP `2xx` 表示接收成功。网络超时或 `5xx` 可以有限重试；相同 JSON 的重复回传由平台幂等处理，不会重复落库。
