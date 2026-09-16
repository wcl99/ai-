# Xiaoyi Authoritative Contract Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make confirmed platform tasks send the exact documented Xiaoyi chat contract, then deploy and validate one authorized scan limited to `139.198.31.136:81`.

**Architecture:** Keep the platform snapshot and task scheduler unchanged. Freeze Xiaoyi identity/scan context at confirmation and add a pure builder in the existing engine adapter that converts frozen internal assets into documented Xiaoyi assets. The Xiaoyi client sends only that builder result; local `request_id` remains local.

**Tech Stack:** Python 3.13, FastAPI, SQLAlchemy async, Pydantic, HTTPX, pytest.

---

### Task 1: Build the documented Xiaoyi payload

**Files:**
- Modify: `apps/api/app/engine.py`
- Test: `apps/api/tests/test_engine.py`

- [ ] **Step 1: Write the failing IP-port conversion test**

```python
def test_builds_documented_xiaoyi_ip_port_payload():
    snapshot = {
        "xiaoyi_context": {
            "org_id": "org-1",
            "user_id": "admin",
            "plan_id": "plan-1",
            "scan_mode": "standard",
            "scan_speed": "quick",
            "download_intermediate_results": True,
        },
        "asset_list": [{
            "host": "139.198.31.136",
            "hostType": "ip",
            "ports": [{"port": 81, "state": "open", "service": "http", "protocol": "tcp"}],
        }],
    }
    assert build_xiaoyi_chat_payload(snapshot) == {
        **snapshot["xiaoyi_context"],
        "asset_list": [{
            "asset_type": "ip_port",
            "asset_address": [{"address": "139.198.31.136", "port": 81, "service": "http"}],
            "whitebox_context": "",
        }],
    }
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pytest tests/test_engine.py::test_builds_documented_xiaoyi_ip_port_payload -q`

Expected: collection failure because `build_xiaoyi_chat_payload` does not exist.

- [ ] **Step 3: Implement the smallest pure builder**

```python
def build_xiaoyi_chat_payload(snapshot: dict) -> dict:
    context = snapshot.get("xiaoyi_context")
    if not isinstance(context, dict):
        raise AppError(400, "INVALID_ENGINE_PAYLOAD", "扫描计划缺少小易任务上下文")
    assets = []
    for item in snapshot.get("asset_list") or []:
        host = str(item.get("host") or "").strip()
        ports = item.get("ports") or []
        whitebox = str(item.get("whitebox_context") or "")
        if ports:
            addresses = []
            seen = set()
            for port in ports:
                number = int(port.get("port"))
                key = (host, number)
                if key in seen:
                    continue
                seen.add(key)
                addresses.append({"address": host, "port": number, "service": str(port.get("service") or "")})
            assets.append({"asset_type": "ip_port", "asset_address": addresses, "whitebox_context": whitebox})
        else:
            assets.append({"asset_type": item.get("hostType", "domain"), "asset_address": [host], "whitebox_context": whitebox})
    if not assets or any(not item["asset_address"] for item in assets):
        raise AppError(400, "INVALID_ENGINE_PAYLOAD", "小易任务资产不能为空")
    body = {**context, "asset_list": assets}
    if _contains_deprecated_fields(body):
        raise AppError(400, "INVALID_ENGINE_PAYLOAD", "任务参数包含已废弃的预查字段")
    return body
```

- [ ] **Step 4: Run builder tests and verify GREEN**

Run: `pytest tests/test_engine.py -q`

Expected: all engine tests pass.

- [ ] **Step 5: Commit**

Run: `git add apps/api/app/engine.py apps/api/tests/test_engine.py && git commit -m "fix(api): build documented xiaoyi chat payload"`

### Task 2: Freeze Xiaoyi context at confirmation

**Files:**
- Modify: `apps/api/app/main.py:438-447`
- Test: `apps/api/tests/test_api.py`

- [ ] **Step 1: Write the failing confirmation snapshot test**

```python
async def test_confirmation_freezes_xiaoyi_context(authenticated_client):
    plan = await authenticated_client.post(
        "/api/v1/scan-plans",
        json={"name": "Context", "test_type": "standard", "targets": ["example.test"]},
    )
    confirmed = await authenticated_client.post(f"/api/v1/scan-plans/{plan.json()['id']}/confirm")
    context = confirmed.json()["snapshot"]["xiaoyi_context"]
    assert context["user_id"] == "admin"
    assert context["plan_id"] == plan.json()["id"]
    assert context["org_id"]
    assert context["scan_mode"] == "standard"
    assert context["scan_speed"] == "quick"
    assert context["download_intermediate_results"] is True
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pytest tests/test_api.py::test_confirmation_freezes_xiaoyi_context -q`

Expected: failure because `xiaoyi_context` is absent.

- [ ] **Step 3: Freeze the context in the existing confirmation transaction**

```python
plan.snapshot = {
    **plan.snapshot,
    "authorization_confirmed": True,
    "confirmed_by": str(user.id),
    "xiaoyi_context": {
        "org_id": str(user.org_id),
        "user_id": user.username,
        "plan_id": str(plan.id),
        "scan_mode": plan.test_type,
        "scan_speed": "quick",
        "download_intermediate_results": True,
    },
}
```

- [ ] **Step 4: Run API tests and verify GREEN**

Run: `pytest tests/test_api.py -q`

Expected: all API tests pass.

- [ ] **Step 5: Commit**

Run: `git add apps/api/app/main.py apps/api/tests/test_api.py && git commit -m "fix(api): freeze xiaoyi dispatch context"`

### Task 3: Send only documented fields to Xiaoyi

**Files:**
- Modify: `apps/api/app/engine.py:216-236`
- Test: `apps/api/tests/test_engine.py`

- [ ] **Step 1: Write a failing client body test**

```python
async def test_xiaoyi_create_task_sends_documented_body_without_request_id(monkeypatch):
    sent = {}
    async def handler(request):
        sent.update(json.loads(request.content))
        return httpx.Response(200, json={"taskId": "real-1", "status": "PENDING"})
    settings = Settings(jwt_secret="x" * 32, engine_mode="xiaoyi", xiaoyi_base_url="https://xiaoyi.test")
    monkeypatch.setattr("app.engine.httpx.AsyncClient", lambda **kwargs: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    snapshot = {
        "xiaoyi_context": {
            "org_id": "org-1", "user_id": "admin", "plan_id": "plan-1",
            "scan_mode": "standard", "scan_speed": "quick",
            "download_intermediate_results": True,
        },
        "asset_list": [{"host": "139.198.31.136", "hostType": "ip", "ports": [{"port": 81, "service": "http"}]}],
    }
    await XiaoyiEngineClient(settings).create_task(snapshot, "local-request")
    assert "request_id" not in sent
    assert set(sent) == {"org_id", "user_id", "plan_id", "scan_mode", "scan_speed", "download_intermediate_results", "asset_list"}
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pytest tests/test_engine.py::test_xiaoyi_create_task_sends_documented_body_without_request_id -q`

Expected: failure because the current client forwards the snapshot and `request_id`.

- [ ] **Step 3: Use the pure builder in `create_task`**

```python
async def create_task(self, payload: dict, request_id: str) -> EngineTask:
    body = build_xiaoyi_chat_payload(payload)
    # request_id intentionally remains local; Xiaoyi's authoritative contract omits it.
```

- [ ] **Step 4: Run engine and sync tests**

Run: `pytest tests/test_engine.py tests/test_sync.py -q`

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

Run: `git add apps/api/app/engine.py apps/api/tests/test_engine.py && git commit -m "fix(api): send exact xiaoyi chat contract"`

### Task 4: Normalize verified upstream error behavior

**Files:**
- Modify: `apps/api/app/engine.py:42-55`
- Test: `apps/api/tests/test_engine.py`

- [ ] **Step 1: Write failing bounded-redaction tests**

```python
def test_engine_rejection_details_are_bounded_and_redacted():
    request = httpx.Request("POST", "https://xiaoyi.test/api/osCore/chat")
    response = httpx.Response(400, request=request, json={"error": "token=secret asset_list 不能为空"})
    error = engine_error(httpx.HTTPStatusError("failed", request=request, response=response), "创建任务")
    assert error.details == {"upstream_error": "token=*** asset_list 不能为空"}
```

- [ ] **Step 2: Run and verify RED**

Run: `pytest tests/test_engine.py::test_engine_rejection_details_are_bounded_and_redacted -q`

Expected: failure because rejected responses currently have no details.

- [ ] **Step 3: Add a 500-character redacted upstream summary for 400/422 only**

```python
summary = redact_sensitive_text(str(exc.response.json().get("error") or ""))[:500]
details = {"upstream_error": summary} if summary else None
return AppError(400, "ENGINE_REJECTED", f"小易拒绝{action}请求", details)
```

- [ ] **Step 4: Run engine tests and verify GREEN**

Run: `pytest tests/test_engine.py -q`

Expected: all engine tests pass and no secret appears in messages.

- [ ] **Step 5: Commit**

Run: `git add apps/api/app/engine.py apps/api/tests/test_engine.py && git commit -m "fix(api): retain redacted xiaoyi rejection reason"`

### Task 5: Regression, deployment, and scoped live verification

**Files:**
- Verify: `apps/api`
- Deploy: existing `/opt/ai-security-platform` compose deployment

- [ ] **Step 1: Run the full backend suite**

Run: `pytest -q`

Expected: all tests pass.

- [ ] **Step 2: Check the working tree**

Run: `git diff --check && git status --short`

Expected: only the pre-existing ignored runtime database may remain untracked.

- [ ] **Step 3: Build and deploy with the existing cached-image path**

Copy only `apps/api/app`, Alembic files, and the already-built frontend into the existing prebuilt image recipe. Preserve the current `.env` and rollback image. Restart the API container and require `/health/ready` to return 200.

- [ ] **Step 4: Create one new confirmed plan**

Use the platform API and a unique local `request_id`. Freeze exactly one asset: `139.198.31.136`, TCP port `81`, service `http`.

- [ ] **Step 5: Verify Xiaoyi task creation and synchronization**

Require a non-empty external task ID. Poll platform task, children, tools, vulnerabilities, reports, and events without expanding scope. Stop on an identity-contract rejection and report its redacted detail instead of guessing external tenant identifiers.

- [ ] **Step 6: Record final evidence**

Report platform task ID, Xiaoyi task ID, terminal/current state, synchronized outputs, exact test count, and any verified upstream defect such as the missing-task stop 500.
