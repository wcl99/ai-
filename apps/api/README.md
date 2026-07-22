# AI 安服平台 API

当前为单体 FastAPI 验证模型。平台保存业务状态，实际渗透计算通过小易引擎 API；默认 `ENGINE_MODE=mock`，不会发起真实扫描。

## 启动

1. 复制 `deploy/.env.example` 为 `deploy/.env` 并更换密码和 JWT 密钥。
2. 在仓库根目录运行 `docker compose -f deploy/compose.yaml up --build`。
3. 打开 `http://127.0.0.1:8000/docs` 查看和调试 API。

扫描计划创建后默认是 `DRAFT`。只有管理员或安全专家调用 `POST /api/v1/scan-plans/{id}/confirm` 明确确认授权，任务才能启动。

## 本地检查

```powershell
python -m ruff check apps/api
python -m pytest apps/api/tests
```

## 本轮任务接口

- `GET /api/v1/tasks/{id}/children`：读取同步到平台数据库的引擎子任务。
- `GET /api/v1/tasks/{id}/events`：读取独立的扫描执行时间线。
- `GET /api/v1/tasks/{id}/qa/messages`：读取任务范围内的专家问答历史。
- `POST /api/v1/tasks/{id}/qa/messages`：保存当前用户问题；本期只验证上下文隔离和历史，不在平台内自建推理引擎。

同步器通过小易 `/api/osCore/segment-task/{taskId}/children` 更新子任务。子任务接口暂时失败时只记录告警，不会把父任务误标为失败；引擎原始响应写库前会遮蔽凭据和白盒字段。
## 管理与审计接口

- `GET/POST /api/v1/users`、`PATCH /api/v1/users/{id}`：管理员维护本组织账号和数字人身份。
- `GET/PATCH /api/v1/settings/organization`：读取或修改组织名称。
- `GET /api/v1/settings/runtime`：只返回引擎是否配置等非敏感运行状态。
- `GET /api/v1/audit-logs`：管理员、安全专家和审计员查询本组织关键操作记录。

数字人账号通过统一登录接口获得 JWT，再访问 `/api/ai/*`；配置接口不会返回数据库连接、Token 或密钥。
## 任务结果与报告规则

- 小易任务响应中的 `reportUrl`、`report_url` 或 `report.url` 会映射为平台 `Report`，并关联对应父任务或子任务。
- 仅接受无内嵌账号密码的 HTTP(S) 报告地址；平台记录元数据但不自动抓取未知 URL。
- 数字人上传漏洞或报告时可传 `task_id`；若任务不属于指定计划，接口返回 `TASK_PLAN_MISMATCH`。
- 数字人上传正文会写入受控本地目录，下载必须通过平台鉴权并写入审计日志。

## 任务同步可靠性

- API 重启后，同步器会从 PostgreSQL 继续处理 `QUEUED`、`RUNNING` 和 `CANCELLING` 任务。
- 仅连接类 `ENGINE_UNAVAILABLE` 错误按 `ENGINE_RETRY_LIMIT` 有限重试，默认 2 次；失败次数持久化在任务记录中。
- 参数拒绝、鉴权失败、任务不存在和响应格式错误不会盲目重试，并返回独立错误码。
- 单次同步器迭代异常会记录日志并继续下一轮，不会永久终止后台同步。

## 补充运营接口

- `POST /api/v1/tasks/{id}/retry`：为失败、取消或部分成功任务创建新的平台任务，原任务历史保持不变。
- `GET /api/v1/ai-logs`：按组织隔离，可按计划和级别查询数字人日志；凭据字段和常见 Token 文本写入前脱敏。
- `GET /api/v1/reports/{id}/content`：预览本地文本报告，最大 1 MB；统一返回 `text/plain` 并禁止 MIME 嗅探。

外部 URL 报告和 PDF 不在平台域直接预览，避免执行不可信 HTML 或扩大服务端抓取范围。