# 数字人对接契约兼容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使现有平台完整接受原《数字人对接文档》的请求与响应契约，让小易只替换基础回传地址即可使用。

**Architecture:** 在现有 `/api/auth/login` 与 `/api/ai/*` 边界增加数字人兼容行为，内部继续使用 UUID、`XiaoyiPlanMapping` 和 `Task.external_task_id`。兼容解析、响应和错误转换集中在后端适配层，平台 `/api/v1/*` 与前端内部契约不变。

**Tech Stack:** Python 3.12、FastAPI、Pydantic v2、SQLAlchemy 2、Alembic、pytest、React/TypeScript。

---

### Task 1: 登录、响应和错误格式兼容

**Files:**
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_auth.py`
- Test: `apps/api/tests/test_results.py`

- [ ] **Step 1: 编写数字 `org_id` 登录和文档响应字段的失败测试**

```python
async def test_digital_human_login_accepts_numeric_org_and_returns_document_fields(
    client, digital_human_user,
):
    response = await client.post(
        "/api/auth/login",
        json={"username": "digital", "password": "Password123!", "org_id": 1},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["user"]["username"] == "digital"
    assert body["org"]["id"] == 1
    assert body["role"] == "operator"
    assert body["is_sys_admin"] is False
```

- [ ] **Step 2: 运行测试并确认因 `org_id` 只接受 UUID 而失败**

Run: `..\..\.venv\Scripts\python.exe -m pytest tests/test_auth.py::test_digital_human_login_accepts_numeric_org_and_returns_document_fields -q`

Expected: FAIL，状态为 422 或缺少 `org` 顶层字段。

- [ ] **Step 3: 扩展登录模型和响应**

在 `LoginRequest` 中使用：

```python
org_id: uuid.UUID | int | None = None
```

登录查询只在 `org_id` 为 UUID 时用于平台组织过滤；数字值作为外部组织上下文回显。登录成功响应增加：

```python
{
    "success": True,
    "token": token,
    "token_type": "Bearer",
    "expires_in": settings.jwt_ttl_seconds,
    "user": UserRead.model_validate(user),
    "org": {"id": payload.org_id or str(user.org_id), "name": organization.name},
    "role": user.role,
    "is_sys_admin": user.role == "admin",
}
```

- [ ] **Step 4: 编写数字人路径错误格式的失败测试**

```python
async def test_ai_validation_errors_use_document_error_shape(
    digital_human_client,
):
    response = await digital_human_client.post("/api/ai/upload-log", json={})
    assert response.status_code == 422
    assert response.json()["success"] is False
    assert isinstance(response.json()["error"], str)
    assert "data" not in response.json()
```

- [ ] **Step 5: 为登录与 `/api/ai/*` 增加路径级错误转换**

在现有异常处理器中根据 `request.url.path` 判断数字人契约路径：

```python
def is_digital_contract_path(request: Request) -> bool:
    return request.url.path == "/api/auth/login" or request.url.path.startswith("/api/ai/")
```

这些路径的认证、`AppError` 和 Pydantic 校验错误返回：

```python
{"success": False, "error": message}
```

其他路径保留现有 `code/message/details`。

- [ ] **Step 6: 运行登录与错误契约测试**

Run: `..\..\.venv\Scripts\python.exe -m pytest tests/test_auth.py tests/test_results.py -q`

Expected: PASS。

- [ ] **Step 7: 提交**

```powershell
git add apps/api/app/schemas.py apps/api/app/main.py apps/api/tests/test_auth.py apps/api/tests/test_results.py
git commit -m "feat: match digital human authentication contract"
```

### Task 2: 可选计划与任务自动归属

**Files:**
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/result_ingest.py`
- Test: `apps/api/tests/test_results.py`

- [ ] **Step 1: 编写只传文档 `plan_id` 自动找到任务的失败测试**

```python
async def documented_task_identity(client, request_id="documented-task"):
    plan_id, task_id = await create_task(client, "Document contract", request_id)
    external_plan_id, external_task_id = await xiaoyi_result_identity(
        plan_id, task_id
    )
    return external_plan_id, external_task_id, plan_id, task_id

async def test_document_callback_plan_id_finds_current_task(
    digital_human_client,
):
    plan_id, task_id = await create_task(digital_human_client, "Document", "document")
    external_plan_id, _ = await xiaoyi_result_identity(plan_id, task_id)
    response = await digital_human_client.post(
        "/api/ai/upload-log",
        json={
            "plan_id": external_plan_id,
            "action": "document_complete",
            "content": "文档格式回传",
        },
    )
    assert response.status_code == 200
    events = await digital_human_client.get(f"/api/v1/tasks/{task_id}/events")
    assert any(item["message"] == "文档格式回传" for item in events.json()["data"])
```

- [ ] **Step 2: 编写不传 `plan_id` 时唯一运行任务自动归属、多个任务拒绝的失败测试**

```python
async def test_document_callback_without_plan_uses_only_active_task(client):
    _, task_id = await create_task(client, "Only active", "only-active")
    response = await client.post(
        "/api/ai/upload-log",
        json={"content": "唯一任务回传"},
    )
    assert response.status_code == 200

async def test_document_callback_without_plan_rejects_ambiguous_tasks(client):
    await create_task(client, "First", "first-active")
    await create_task(client, "Second", "second-active")
    response = await client.post(
        "/api/ai/upload-log",
        json={"content": "无法确定任务"},
    )
    assert response.status_code == 409
    assert "无法确定" in response.json()["error"]
```

- [ ] **Step 3: 运行测试并确认当前 `plan_id` 必填或任务为空导致失败**

Run: `..\..\.venv\Scripts\python.exe -m pytest tests/test_results.py -k "document_callback" -q`

Expected: FAIL。

- [ ] **Step 4: 实现兼容上下文解析**

四个上传模型改为：

```python
plan_id: uuid.UUID | int | None = None
```

`resolve_result_context` 实现顺序：

1. 校验平台 UUID `org_id`。
2. 有 `plan_id` 时解析平台计划。
3. 有 `task_id` 时按平台 UUID 或 `external_task_id` 解析并校验计划。
4. 有计划但无任务时查询该计划任务，优先 `QUEUED/RUNNING/CANCELLING`，否则取最近任务。
5. 无计划无任务时查询组织内非终态任务；仅一条时使用，多条返回 `409 AMBIGUOUS_TASK`，无任务返回 `404 TASK_NOT_FOUND`。

返回的 `ResultContext` 始终包含用于漏洞、日志和报告的计划与任务。

- [ ] **Step 5: 运行上下文测试**

Run: `..\..\.venv\Scripts\python.exe -m pytest tests/test_results.py -k "document_callback or xiaoyi_result_ids" -q`

Expected: PASS。

- [ ] **Step 6: 提交**

```powershell
git add apps/api/app/schemas.py apps/api/app/result_ingest.py apps/api/tests/test_results.py
git commit -m "feat: resolve documented callback context"
```

### Task 3: 四类上传接口严格适配数字人文档

**Files:**
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/result_ingest.py`
- Test: `apps/api/tests/test_results.py`

- [ ] **Step 1: 编写漏洞推导和别名归一化失败测试**

```python
async def test_document_vulnerability_defaults_and_aliases(client):
    external_plan_id, _ = await documented_task_identity(client)
    response = await client.post(
        "/api/ai/upload-vulnerability",
        json={
            "plan_id": external_plan_id,
            "data": {
                "ip": "192.0.2.5",
                "port": 443,
                "name": "Alias finding",
                "level": "high",
                "target_url": "https://example.test/login",
                "verb": "POST",
                "attack_payload": "payload",
                "request_raw": "request",
                "response_raw": "response",
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["plan_id"] == external_plan_id
    items = await client.get("/api/v1/vulnerabilities?page=1&page_size=20")
    item = items.json()["data"]["items"][0]
    assert item["asset_key"] == "192.0.2.5:443"
    assert item["severity"] == "high"
    assert item["data_json"]["http_url"] == "https://example.test/login"
    assert item["data_json"]["http_method"] == "POST"
```

- [ ] **Step 2: 编写报告路径、自动文件名和顶层响应失败测试**

```python
async def test_document_report_response_contains_report_path(client):
    external_plan_id, _ = await documented_task_identity(client)
    response = await client.post(
        "/api/ai/upload-report",
        json={
            "plan_id": external_plan_id,
            "format": "docx",
            "filename": "https://bucket.example/report.docx",
        },
    )
    assert response.status_code == 200
    assert response.json()["report_path"] == "https://bucket.example/report.docx"
    assert "data" not in response.json()
```

- [ ] **Step 3: 编写日志 `user_id` 和资产文档字段失败测试**

```python
async def test_document_log_accepts_numeric_user_id(client):
    external_plan_id, _ = await documented_task_identity(client)
    response = await client.post(
        "/api/ai/upload-log",
        json={
            "plan_id": external_plan_id,
            "user_id": 5,
            "content": "数字人日志",
        },
    )
    assert response.status_code == 200
    assert response.json()["message"] == "日志已接收"

async def test_document_asset_uses_ip_and_port(client):
    external_plan_id, _ = await documented_task_identity(client)
    response = await client.post(
        "/api/ai/upload-asset",
        json={
            "plan_id": external_plan_id,
            "asset": {"ip": "192.0.2.10", "port": 80, "service": "http"},
        },
    )
    assert response.status_code == 200
    assert response.json()["plan_id"] == external_plan_id
```

- [ ] **Step 4: 运行失败测试**

Run: `..\..\.venv\Scripts\python.exe -m pytest tests/test_results.py -k "document_" -q`

Expected: FAIL，原因分别为默认值、格式枚举或响应包装不符合文档。

- [ ] **Step 5: 实现标准字段归一化**

在 `result_ingest.py` 增加明确映射：

```python
VULNERABILITY_ALIASES = {
    "http_url": ("url", "target_url", "vuln_url", "endpoint", "uri", "request_url", "path"),
    "http_method": ("method", "verb"),
    "payload": ("attack_payload", "exploit_payload", "request_payload", "poc"),
    "http_request": ("request_raw", "request_packet", "raw_request", "request"),
    "http_response": ("response_raw", "response_packet", "raw_response", "response"),
}
```

只在标准字段不存在时从第一个有效别名复制，保留原始字段。

- [ ] **Step 6: 调整四类模型与路由**

- `AiLogUpload` 增加 `user_id: uuid.UUID | int | None`。
- `AiReportUpload.format` 改为长度 1–16 的安全字符串；`filename` 上限改为 2000。
- 资产主机优先按文档顺序解析非空字段。
- 漏洞默认等级为 `medium`，推导标题和资产键。
- 自动报告文件名使用 UTC 毫秒时间戳：`ai_report_<timestamp>.<format>`。
- 四个路由成功响应改为顶层文档结构，不返回 `data` 包装；可额外保留资源 ID 顶层字段用于排障，但小易不需要解析。
- 幂等重复请求返回与首次相同的文档格式。

- [ ] **Step 7: 运行结果接口测试**

Run: `..\..\.venv\Scripts\python.exe -m pytest tests/test_results.py -q`

Expected: PASS。

- [ ] **Step 8: 提交**

```powershell
git add apps/api/app/main.py apps/api/app/schemas.py apps/api/app/result_ingest.py apps/api/tests/test_results.py
git commit -m "feat: match documented result uploads"
```

### Task 4: 资产按计划唯一

**Files:**
- Create: `apps/api/alembic/versions/0008_scope_assets_by_plan.py`
- Modify: `apps/api/app/models.py`
- Modify: `apps/api/tests/test_migrations.py`
- Test: `apps/api/tests/test_results.py`

- [ ] **Step 1: 编写同一资产可存在于不同计划的失败测试**

```python
async def test_document_asset_is_scoped_per_plan(client):
    first_plan, _ = await documented_task_identity(client, request_id="asset-one")
    second_plan, _ = await documented_task_identity(client, request_id="asset-two")
    payload = {"asset": {"ip": "192.0.2.20", "port": 443}}
    first = await client.post("/api/ai/upload-asset", json={**payload, "plan_id": first_plan})
    second = await client.post("/api/ai/upload-asset", json={**payload, "plan_id": second_plan})
    assert first.status_code == second.status_code == 200
    assert first.json()["asset_id"] != second.json()["asset_id"]
```

- [ ] **Step 2: 运行测试并确认现有组织级唯一约束导致失败**

Run: `..\..\.venv\Scripts\python.exe -m pytest tests/test_results.py::test_document_asset_is_scoped_per_plan -q`

Expected: FAIL，数据库唯一约束冲突。

- [ ] **Step 3: 修改模型与迁移**

模型约束改为：

```python
UniqueConstraint("org_id", "plan_id", "asset_key")
```

迁移 `0008`：

```python
op.drop_constraint("uq_assets_org_asset_key", "assets", type_="unique")
op.create_unique_constraint(
    "uq_assets_org_plan_asset_key",
    "assets",
    ["org_id", "plan_id", "asset_key"],
)
```

迁移需兼容 SQLite 测试的 batch alter 和 PostgreSQL 生产环境。

- [ ] **Step 4: 扩展迁移测试并运行**

Run: `..\..\.venv\Scripts\python.exe -m pytest tests/test_migrations.py tests/test_results.py::test_document_asset_is_scoped_per_plan -q`

Expected: PASS。

- [ ] **Step 5: 提交**

```powershell
git add apps/api/app/models.py apps/api/alembic/versions/0008_scope_assets_by_plan.py apps/api/tests/test_migrations.py apps/api/tests/test_results.py
git commit -m "fix: scope callback assets by plan"
```

### Task 5: 数字计划创建与启动

**Files:**
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_results.py`

- [ ] **Step 1: 编写原文档创建响应失败测试**

```python
async def test_document_create_plan_returns_numeric_plan_contract(client):
    response = await client.post(
        "/api/ai/create-test-plan",
        json={
            "plan_name": "数字人计划",
            "org_id": 1,
            "test_type": "standard",
            "targets": ["https://example.test"],
            "templates": ["web-basic", "cms-check"],
            "time_limit": 60,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body["plan_id"], int)
    assert body["plan"]["id"] == body["plan_id"]
    assert body["task_count"] == 2
    assert body["time_limit"] == 60
```

- [ ] **Step 2: 编写数字计划 ID 启动失败测试**

```python
async def test_document_start_plan_accepts_numeric_plan_id(client):
    created_response = await client.post(
        "/api/ai/create-test-plan",
        json={
            "plan_name": "待启动数字人计划",
            "org_id": 1,
            "targets": ["https://example.test"],
        },
    )
    created = created_response.json()
    response = await client.post(
        "/api/ai/start-test-plan",
        json={"plan_id": created["plan_id"], "org_id": 1, "time_limit": 60},
    )
    assert response.status_code == 200
    assert response.json()["plan_id"] == created["plan_id"]
    assert response.json()["target_count"] == 1
```

- [ ] **Step 3: 运行测试并确认 UUID 模型和包装响应导致失败**

Run: `..\..\.venv\Scripts\python.exe -m pytest tests/test_results.py -k "document_create_plan or document_start_plan" -q`

Expected: FAIL。

- [ ] **Step 4: 实现数字计划映射响应**

- `AiPlanCreate.org_id` 与 `AiPlanStart.org_id` 接受 UUID、数字或省略。
- `AiPlanStart.plan_id` 接受 UUID 或数字。
- 创建平台计划后创建或读取 `XiaoyiPlanMapping`。
- 返回文档顶层结构，外部 `plan.id` 和 `plan_id` 均使用映射数字 ID。
- 启动时数字 ID 先解析到平台计划，再调用现有 `create_task`。
- `task_count` 使用 `目标数 × max(模板数, 1)`。

- [ ] **Step 5: 运行计划接口测试**

Run: `..\..\.venv\Scripts\python.exe -m pytest tests/test_results.py -k "document_create_plan or document_start_plan" -q`

Expected: PASS。

- [ ] **Step 6: 提交**

```powershell
git add apps/api/app/schemas.py apps/api/app/main.py apps/api/tests/test_results.py
git commit -m "feat: match documented plan endpoints"
```

### Task 6: 生成新的数字人交付文档

**Files:**
- Create outside repository: `E:\ai自动渗透\新数字人对接文档.md`
- Modify: `docs/integrations/xiaoyi-result-callback-api.md`

- [ ] **Step 1: 从原文档复制交付版本**

复制 `E:\ai自动渗透\数字人对接文档.md` 的章节、字段、示例和调用顺序，不重新设计接口。

- [ ] **Step 2: 只替换部署信息**

- 地址替换为 `http://101.43.119.26:8000`。
- 登录示例替换为 `xiaoyi` / `Xiaoyi2026!`。
- 保持原路径和请求字段。
- 在开头标注体验环境当前为 HTTP，正式环境建议 HTTPS。

- [ ] **Step 3: 更新仓库内无密码说明**

`docs/integrations/xiaoyi-result-callback-api.md` 改为指向原文档兼容契约，不包含真实密码；删除要求小易必须提供自定义 `task_id` 的表述。

- [ ] **Step 4: 文档自审**

Run:

```powershell
Select-String -Path 'E:\ai自动渗透\新数字人对接文档.md' -Pattern '123\.125\.220\.27|admin|password|task_id.*必须'
```

Expected: 不再出现旧地址、旧示例账密或要求小易新增必填字段。

- [ ] **Step 5: 提交不含密码的仓库文档**

```powershell
git add docs/integrations/xiaoyi-result-callback-api.md
git commit -m "docs: align Xiaoyi callbacks with digital human contract"
```

### Task 7: 全量验证、推送和部署

**Files:**
- Verify: entire repository
- Deploy: `101.43.119.26:/opt/ai-security-platform`

- [ ] **Step 1: 后端全量验证**

Run:

```powershell
..\..\.venv\Scripts\python.exe -m ruff check .
..\..\.venv\Scripts\python.exe -m pytest tests -q
```

Expected: Ruff 无错误，pytest 全部通过。

- [ ] **Step 2: 前端全量验证**

Run:

```powershell
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vite/bin/vite.js build
```

Expected: 全部退出码 0。

- [ ] **Step 3: 检查提交范围**

Run:

```powershell
git diff --check
git status --short
```

Expected: 仅保留用户原有的未跟踪 `apps/api/data/`，不提交该目录或包含真实密码的交付文档。

- [ ] **Step 4: 推送分支**

Run: `git push origin codex/project-handoff`

Expected: 远端分支指向本地 HEAD。

- [ ] **Step 5: 原子部署**

构建包含 `apps/api/app`、Alembic、前端 `dist` 和 Compose 配置的精确提交归档；上传服务器，基于当前预构建镜像创建新版本，复用现有 `deploy/.env`，运行 `alembic upgrade head` 并等待健康检查。

- [ ] **Step 6: 线上原文档冒烟验证**

使用 `xiaoyi` 账号执行：

1. 数字 `org_id` 登录。
2. 创建文档格式测试计划并取得数字 `plan_id`。
3. 不传自定义 `task_id` 回传日志、资产、漏洞和 URL 报告。
4. 验证所有响应为文档顶层结构。
5. 查询平台资源确认均归属对应计划和任务。
6. 重复同一请求确认幂等。

- [ ] **Step 7: 清理临时含密脚本**

删除本地 `.run`、服务器 `/tmp` 和容器 `/tmp` 中用于线上验证且包含账号密码的脚本。

- [ ] **Step 8: 最终报告**

报告提交 ID、部署版本、测试数量、线上映射证据和交付文档绝对路径；明确任何仍存在的界面限制。
