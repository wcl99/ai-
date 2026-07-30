# 小易任务结果回传接口

本文档提供给小易智能体对接人员，用于把小易编排及下游渗透智能体产生的资产、漏洞、关键日志和报告持续回传到 AI 安服平台。

本文以《智能数字人对接接口文档》为字段基线，并补充本平台的任务标识映射、幂等及安全约束。平台负责创建并启动任务；小易负责维持任务会话、编排后端渗透智能体，并通过本文接口回传执行结果。

## 1. 环境与鉴权

- 当前体验环境：`http://101.43.119.26:8000`
- 生产环境必须使用 HTTPS。
- 数据格式：`application/json; charset=utf-8`
- 鉴权：`Authorization: Bearer <JWT_TOKEN>`

### 1.1 获取 JWT

`POST /api/auth/login`

```json
{
  "username": "<数字人专用账号>",
  "password": "<账号密码>",
  "org_id": "<平台组织 UUID，可选>"
}
```

成功响应：

```json
{
  "success": true,
  "token": "<JWT_TOKEN>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "<用户 UUID>",
    "org_id": "<平台组织 UUID>",
    "username": "xiaoyi-callback",
    "name": "小易回传账号",
    "role": "operator",
    "is_active": true,
    "is_digital_human": true
  }
}
```

除平台管理员外，调用回传接口的账号必须标记为数字人账号。Token 默认有效期为 3600 秒，过期后重新登录，不要自行解析或修改 JWT。

## 2. 任务标识约定

四个回传接口都需要以下关联字段：

| 字段 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| `plan_id` | integer 或 UUID | 是 | 优先传平台发起小易会话时提供的数字计划 ID；兼容平台计划 UUID。 |
| `task_id` | string 或 UUID | 否 | 优先传小易任务的 `taskId`/子任务 ID；兼容平台任务 UUID。建议始终传入，以便前端实时归入当前任务。 |
| `org_id` | integer 或 UUID | 否 | 可回传小易组织 ID。若传平台组织 UUID，必须与 JWT 中组织一致。数据归属最终以 JWT 和 `plan_id` 映射为准。 |

`plan_id` 的数字值来自平台调用小易 `/api/osCore/chat` 时提供的会话上下文。小易不要生成新的 `plan_id`。如果标识不存在、跨组织或 `task_id` 不属于该计划，平台会拒绝写入。

## 3. 通用响应与重试

成功响应统一使用：

```json
{
  "success": true,
  "message": "日志已接收",
  "data": {
    "log_id": "<平台资源 UUID>",
    "plan_id": 123,
    "org_id": "<平台组织 UUID>"
  }
}
```

失败响应统一使用：

```json
{
  "success": false,
  "code": "TASK_NOT_FOUND",
  "message": "回传任务不存在",
  "details": null
}
```

- HTTP `2xx` 才表示平台已接收。
- 网络超时或 `5xx` 可重试；建议指数退避并设置最大次数。
- 同一组织、同一接口、语义完全相同的 JSON 重复发送时，平台返回首次创建的资源 ID，不重复落库。JSON 键顺序不影响判重。
- 日志若确实是新事件，应使用不同的 `timestamp`、`action` 或 `content`。
- `400/401/403/404/422` 应先修正请求，不要无限重试。

## 4. 上传资产

`POST /api/ai/upload-asset`

```json
{
  "plan_id": 123,
  "task_id": "xiaoyi-task-456",
  "org_id": 1,
  "asset": {
    "asset_key": "1.2.3.4:443",
    "ip": "1.2.3.4",
    "port": 443,
    "service": "https",
    "status": "open",
    "fingerprint": {
      "server": "nginx",
      "framework": "django"
    },
    "tags": ["外网"]
  }
}
```

`asset` 必填。主机可放在 `address`、`host`、`hostname`、`domain` 或 `ip`；至少提供一个。未提供 `asset_key` 时，平台使用 `主机:端口` 生成。其他自定义字段完整保存在资产详情中。

成功响应的 `data` 包含 `asset_id`、`plan_id`、`org_id`。

## 5. 上传漏洞

`POST /api/ai/upload-vulnerability`

```json
{
  "plan_id": 123,
  "task_id": "xiaoyi-task-456",
  "org_id": 1,
  "asset_key": "1.2.3.4:443",
  "severity": "high",
  "title": "SQL 注入漏洞",
  "data": {
    "ip": "1.2.3.4",
    "port": 443,
    "http_method": "POST",
    "http_url": "https://demo.example.com/login?id=1",
    "payload": "' OR '1'='1",
    "http_request": "POST /login?id=1 HTTP/1.1\nHost: demo.example.com\n...",
    "http_response": "HTTP/1.1 500 Internal Server Error\n...",
    "description": "参数 id 存在 SQL 注入",
    "poc": "复现说明",
    "fix": "使用参数化查询"
  }
}
```

- `data` 必填，可包含任意结构化详情；平台脱敏后完整保存。
- `severity` 可用：`critical`、`high`、`medium`、`low`、`unknown`。
- 建议显式提供 `title`、`severity`、`asset_key`。
- 数字人文档中的历史别名（如 `url`、`target_url`、`method`、`attack_payload`、`request_raw`、`response_raw`）可以放在 `data` 中保存；为保证平台主视图信息完整，仍建议同时提供上例标准字段。

成功响应的 `data` 包含 `vulnerability_id`、`plan_id`、`org_id`。

## 6. 上传关键过程日志

`POST /api/ai/upload-log`

```json
{
  "plan_id": 123,
  "task_id": "xiaoyi-task-456",
  "org_id": 1,
  "timestamp": "2026-07-30T10:20:30+08:00",
  "level": "info",
  "type": "agent_activity",
  "agent_type": "xiaoyi",
  "action": "web_recon_complete",
  "details": {
    "agent": "WebRE工具",
    "finding_count": 1
  },
  "content": "WebRE 工具已完成前端 API 提取，发现 12 个接口，下一步进入接口验证。"
}
```

`content` 必填，最长 100000 字符。`level` 可用 `debug/info/warning/error`。

前端只突出展示关键信息：

- `warning`、`error` 会进入任务编排时间线。
- `action` 中包含 `complete`、`finished` 或 `report_generated` 的完成节点会进入时间线。
- 高频调试细节可用 `debug`，平台会归档但不打扰客户。
- `content` 应直接解释“完成了什么、得到什么、下一步做什么”，不要仅上传原始 JSON。

成功响应的 `data` 包含 `log_id`、`plan_id`、`org_id`。

## 7. 上传报告

`POST /api/ai/upload-report`

方式一：回传正文。

```json
{
  "plan_id": 123,
  "task_id": "xiaoyi-task-456",
  "org_id": 1,
  "format": "md",
  "report_level": "high",
  "filename": "pentest-report-ai.md",
  "content": "# 渗透测试报告\n\n本次测试结果……"
}
```

方式二：按数字人文档约定，将 OSS/对象存储 URL 放在 `filename`。

```json
{
  "plan_id": 123,
  "task_id": "xiaoyi-task-456",
  "org_id": 1,
  "filename": "https://bucket.example.com/reports/final-report.docx"
}
```

也可显式使用 `external_url`：

```json
{
  "plan_id": 123,
  "task_id": "xiaoyi-task-456",
  "external_url": "https://bucket.example.com/reports/final-report.md",
  "filename": "final-report.md"
}
```

- 普通文件名需要同时提供 `content`；内容上限 5000000 字符。
- HTTP/HTTPS URL 不在平台本地落盘。
- URL 不得包含用户名或密码。
- 当前 `format` 支持 `md`、`html`、`txt`；外链文件名可以保留其他后缀。

成功响应的 `data` 包含 `report_id`、`plan_id`、`org_id`。

## 8. 推荐回传时序

1. 小易登录获取 JWT。
2. 平台创建任务并通过 `/api/osCore/chat` 把任务上下文交给小易；小易保存对应的 `plan_id` 和 `taskId`。
3. 小易维持同一任务会话并编排后端渗透智能体。
4. 发现新资产时调用 `upload-asset`。
5. 关键阶段、等待、告警和失败时调用 `upload-log`，不要只等最终结果。
6. 验证后的漏洞逐条调用 `upload-vulnerability`。
7. 完成后调用 `upload-report`，并发送 `action=report_generated` 的完成日志。
8. 平台持续接收、归档并在任务编排时间线、漏洞中心和报告中心展示。

在本平台发起任务的流程里，小易不需要调用数字人文档中的 `create-test-plan` 和 `start-test-plan`；这两个接口保留给其他第三方主动创建计划的场景，避免重复创建或重复启动任务。

## 9. 联调检查清单

- 使用数字人专用账号成功获取 JWT。
- 使用平台下发的数字 `plan_id` 和小易 `taskId` 回传一条 `info` 完成日志。
- 重发完全相同的请求，确认返回相同 `log_id`。
- 回传资产、漏洞和外链报告，确认分别获得资源 ID。
- 在平台任务页确认关键日志进入编排时间线，漏洞和报告进入对应中心。
- 验证 Token 过期后重新登录，且错误组织 UUID、未知计划或未知任务会被拒绝。
