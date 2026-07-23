# Xiaoyi Core Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the documented Xiaoyi core scan path from local draft form through precheck, confirmation, one final chat request, and task/tool synchronization.

**Architecture:** Keep the platform as the only browser-facing and credential-holding boundary. Add a small backend adapter around Xiaoyi WebSocket session reuse, draft asset persistence, frozen snapshot validation, and tools/status normalization. Frontend changes stay inside the existing pentest flow and do not implement the deferred settings page.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic v2, httpx, websockets, pytest, React, TanStack Query, Vitest, Playwright.

---

## File Structure

- Modify `apps/api/app/schemas.py`
  Add `hostType` to `PortPrecheckHost`, add scan-plan asset update schemas, and keep task tools as `ApiEnvelope[list[dict]]` for this phase.

- Modify `apps/api/app/engine.py`
  Add reusable Xiaoyi precheck session support, documented payload forwarding, defensive tools parsing, and recursive deprecated-field guard coverage.

- Modify `apps/api/app/services.py`
  Add asset normalization and draft-only plan asset update helpers. Strengthen task creation validation against empty assets and deprecated frozen snapshots.

- Modify `apps/api/app/main.py`
  Add draft asset update route, update `/api/v1/prechecks/ws` to reuse one upstream Xiaoyi socket per browser socket, and expose task tools through the current task API surface.

- Modify `apps/api/tests/test_engine.py`
  Cover Xiaoyi payload contracts, WebSocket reuse helper behavior, deprecated field rejection, and tools/status parsing.

- Modify `apps/api/tests/test_api.py`
  Cover draft-only asset updates, confirmation snapshot freeze, empty asset rejection, and final task boundary.

- Modify `apps/api/tests/test_sync.py`
  Cover tools/children/status normalization where engine sync behavior is shared.

- Modify `apps/web/src/api/pentest.ts`
  Add draft asset update API, make `hostType` typed, and provide a reusable precheck session helper.

- Modify `apps/web/src/pages/PentestPage.tsx`
  Save accepted precheck results to the draft before confirmation. Keep the existing layout and controls.

- Modify `apps/web/src/api/pentest.test.ts`
  Cover draft asset update and reusable precheck session behavior.

- Modify `apps/web/src/pages/PentestPage.test.tsx`
  Cover accepted precheck results being persisted before confirmation.

- Modify `apps/web/e2e/golden-path.spec.ts`
  Update mocked precheck/task flow expectations to match one session and saved asset list.

## Task 1: Backend Contract Tests

**Files:**
- Modify: `apps/api/tests/test_engine.py`
- Modify: `apps/api/tests/test_api.py`

- [ ] **Step 1: Add failing engine tests**

Add tests with these names and assertions:

```python
async def test_xiaoyi_precheck_session_reuses_one_socket(monkeypatch):
    sent_messages = []
    connect_calls = []
    # Fake socket stores both can_subdomain and can_port sends.
    # Assert one connect call, two sent JSON messages, and documented actions only.
    assert connect_calls == ["/api/osCore/ws/asset-can"]
    assert sent_messages == [
        {"action": "can_subdomain", "domains": ["example.test"]},
        {"action": "can_port", "hosts": [{"host": "example.test", "hostType": "domain"}]},
    ]

def test_port_precheck_requires_host_type():
    valid = PortPrecheckRequest.model_validate({
        "action": "can_port",
        "hosts": [{"host": "example.test", "hostType": "domain"}],
    })
    assert valid.hosts[0].hostType == "domain"
    with pytest.raises(ValidationError):
        PortPrecheckRequest.model_validate({"action": "can_port", "hosts": [{"host": "example.test"}]})
```

- [ ] **Step 2: Add failing API boundary tests**

Add tests with these names and assertions:

```python
async def test_draft_asset_list_can_update_before_confirmation(authenticated_client):
    plan = await authenticated_client.post("/api/v1/scan-plans", json={"name": "Draft assets", "targets": ["example.test"]})
    updated = await authenticated_client.patch(
        f"/api/v1/scan-plans/{plan.json()['id']}/assets",
        json={"asset_list": [{"host": "www.example.test", "hostType": "domain", "ports": [443]}]},
    )
    assert updated.status_code == 200
    assert updated.json()["asset_list"] == [{"host": "www.example.test", "hostType": "domain", "ports": [443]}]
    assert updated.json()["snapshot"]["asset_list"] == updated.json()["asset_list"]

async def test_confirmed_plan_asset_list_is_frozen(authenticated_client):
    plan = await authenticated_client.post("/api/v1/scan-plans", json={"name": "Frozen assets", "targets": ["example.test"]})
    await authenticated_client.patch(f"/api/v1/scan-plans/{plan.json()['id']}/assets", json={"asset_list": [{"host": "example.test", "hostType": "domain"}]})
    confirmed = await authenticated_client.post(f"/api/v1/scan-plans/{plan.json()['id']}/confirm")
    assert confirmed.json()["status"] == "READY"
    rejected = await authenticated_client.patch(f"/api/v1/scan-plans/{plan.json()['id']}/assets", json={"asset_list": [{"host": "other.test", "hostType": "domain"}]})
    assert rejected.status_code == 409
```

- [ ] **Step 3: Run the targeted failing tests**

Run:

```bash
cd apps/api
pytest tests/test_engine.py tests/test_api.py -q
```

Expected: new tests fail because `hostType`, draft asset update, and reusable precheck session are not implemented yet.

## Task 2: Backend Schemas And Asset Normalization

**Files:**
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/services.py`

- [ ] **Step 1: Add schema support**

Implement these schema changes:

```python
HostType = Literal["domain", "ip"]

class PortPrecheckHost(BaseModel):
    model_config = ConfigDict(extra="forbid")

    host: str = Field(min_length=1, max_length=512)
    hostType: HostType
```

Add:

```python
class ScanPlanAssetUpdate(BaseModel):
    asset_list: list[dict] = Field(min_length=1, max_length=128)
```

- [ ] **Step 2: Add normalization helper**

Add to `apps/api/app/services.py`:

```python
def normalize_asset_list(asset_list: list[dict]) -> list[dict]:
    normalized = []
    seen = set()
    for item in asset_list:
        if not isinstance(item, dict):
            raise AppError(422, "INVALID_ASSET_LIST", "Asset list item must be an object")
        host = str(item.get("host") or item.get("domain") or item.get("address") or "").strip().lower()
        if not host:
            raise AppError(422, "INVALID_ASSET_LIST", "Asset host is required")
        host_type = str(item.get("hostType") or item.get("asset_type") or "domain").strip()
        if host_type not in {"domain", "ip"}:
            raise AppError(422, "INVALID_ASSET_LIST", "Asset hostType must be domain or ip")
        ports = item.get("ports", [])
        key = (host, host_type, json.dumps(ports, sort_keys=True, default=str))
        if key in seen:
            continue
        seen.add(key)
        normalized.append({**item, "host": host, "hostType": host_type})
    if not normalized:
        raise AppError(422, "INVALID_ASSET_LIST", "Asset list cannot be empty")
    return normalized
```

Use `import json`.

- [ ] **Step 3: Apply normalization in plan creation and task creation**

In `create_plan`, normalize `payload.asset_list` when provided, otherwise keep `[]` for DRAFT.

In `create_task`, before creating a task:

```python
asset_list = normalize_asset_list(plan.snapshot.get("asset_list") or plan.asset_list or [])
if _contains_deprecated_fields(plan.snapshot):
    raise AppError(400, "INVALID_ENGINE_PAYLOAD", "Scan plan snapshot contains deprecated Xiaoyi fields")
plan.snapshot = {**plan.snapshot, "asset_list": asset_list}
plan.asset_list = asset_list
```

Import `_contains_deprecated_fields` from `app.engine`.

- [ ] **Step 4: Run targeted tests**

Run:

```bash
cd apps/api
pytest tests/test_api.py::test_draft_asset_list_can_update_before_confirmation tests/test_api.py::test_confirmed_plan_asset_list_is_frozen -q
```

Expected: still fail until route is added in Task 3.

## Task 3: Backend Routes And Xiaoyi Precheck Session

**Files:**
- Modify: `apps/api/app/engine.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/tests/test_engine.py`
- Modify: `apps/api/tests/test_api.py`

- [ ] **Step 1: Add Xiaoyi precheck session class**

Add a focused class in `apps/api/app/engine.py`:

```python
class XiaoyiPrecheckSession:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.socket = None

    async def __aenter__(self):
        base = self.settings.xiaoyi_base_url.rstrip("/")
        ws_url = base.replace("https://", "wss://").replace("http://", "ws://")
        self.socket = await websockets.connect(
            f"{ws_url}/api/osCore/ws/asset-can",
            additional_headers=XiaoyiEngineClient(self.settings).headers,
            open_timeout=self.settings.engine_timeout_seconds,
            ping_interval=20,
        )
        return self

    async def __aexit__(self, *_):
        if self.socket is not None:
            await self.socket.close()

    async def send(self, message: dict) -> dict:
        if self.socket is None:
            raise AppError(502, "ENGINE_UNAVAILABLE", "Xiaoyi precheck is not connected")
        async with asyncio.timeout(self.settings.engine_timeout_seconds):
            await self.socket.send(json.dumps(message, ensure_ascii=False))
            while True:
                data = httpx.Response(200, content=await self.socket.recv()).json()
                if data.get("action") in {"can_subdomain_result", "can_port_result", "can_error"}:
                    return data
```

Update `XiaoyiEngineClient.precheck` to use this class for one-shot compatibility.

- [ ] **Step 2: Update WebSocket bridge**

In `/api/v1/prechecks/ws`, create one precheck session outside the receive loop for Xiaoyi mode:

```python
precheck_session = client.precheck_session() if hasattr(client, "precheck_session") else None
async with precheck_session if precheck_session is not None else nullcontext():
    while True:
        message = await websocket.receive_json()
        validated = validate_precheck_message(message)
        if precheck_session is not None:
            result = await precheck_session.send(validated.model_dump())
        else:
            result = await client.precheck(validated.model_dump())
        await websocket.send_json(result)
```

Use `contextlib.AsyncExitStack` to keep one async receive loop while supporting both Xiaoyi reusable sessions and the mock client's one-shot `precheck` method.

- [ ] **Step 3: Add draft asset route**

Add route:

```python
@app.patch("/api/v1/scan-plans/{plan_id}/assets", response_model=ScanPlanRead)
async def update_plan_assets(plan_id: uuid.UUID, payload: ScanPlanAssetUpdate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    plan = await get_plan(session, plan_id, user)
    if plan.status != "DRAFT":
        raise AppError(409, "PLAN_NOT_DRAFT", "Scan plan assets can only be changed before confirmation")
    asset_list = normalize_asset_list(payload.asset_list)
    plan.asset_list = asset_list
    plan.snapshot = {**plan.snapshot, "asset_list": asset_list}
    await add_audit(session, user, "plan.assets.update", "scan_plan", plan.id)
    await session.commit()
    await session.refresh(plan)
    return plan
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
cd apps/api
pytest tests/test_engine.py tests/test_api.py -q
```

Expected: all targeted backend tests pass.

- [ ] **Step 5: Commit backend boundary**

Run:

```bash
git add apps/api/app/schemas.py apps/api/app/services.py apps/api/app/engine.py apps/api/app/main.py apps/api/tests/test_engine.py apps/api/tests/test_api.py
git commit -m "feat(api): align xiaoyi core path contract"
```

## Task 4: Backend Task Tools And Sync Normalization

**Files:**
- Modify: `apps/api/app/engine.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/tests/test_sync.py`

- [ ] **Step 1: Add failing tools test**

Add:

```python
async def test_task_tools_are_normalized(authenticated_client, monkeypatch):
    class ToolEngine:
        async def get_tools(self, external_task_id: str):
            return [{"id": "nmap", "name": "Nmap", "status": "COMPLETED"}]

    monkeypatch.setattr("app.main.get_engine_client", lambda settings: ToolEngine())
    plan = await authenticated_client.post("/api/v1/scan-plans", json={"name": "Tool plan", "targets": ["example.test"], "asset_list": [{"host": "example.test", "hostType": "domain"}]})
    await authenticated_client.post(f"/api/v1/scan-plans/{plan.json()['id']}/confirm")
    task = await authenticated_client.post("/api/v1/tasks", json={"plan_id": plan.json()["id"], "request_id": "tool-normalization"})
    response = await authenticated_client.get(f"/api/v1/tasks/{task.json()['id']}/tools")
    assert response.status_code == 200
    assert response.json()["data"][0]["id"] == "nmap"
```

- [ ] **Step 2: Implement engine method**

Add `get_tools(self, external_task_id: str) -> list[dict]` on Xiaoyi and mock clients. Xiaoyi calls the documented tools endpoint from the reference docs and accepts either:

```python
payload.get("data", payload)
payload["tools"]
payload["items"]
```

Reject non-list results with `AppError(502, "INVALID_ENGINE_PAYLOAD", ...)`.

- [ ] **Step 3: Add platform route**

Add:

```python
@app.get("/api/v1/tasks/{task_id}/tools")
async def task_tools(task_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    task = await scoped_task(session, task_id, user)
    if not task.external_task_id:
        return envelope([])
    client = get_engine_client(get_settings())
    return envelope(await client.get_tools(task.external_task_id))
```

- [ ] **Step 4: Run targeted tests**

Run:

```bash
cd apps/api
pytest tests/test_sync.py -q
```

Expected: pass.

- [ ] **Step 5: Commit tools route**

Run:

```bash
git add apps/api/app/engine.py apps/api/app/main.py apps/api/tests/test_sync.py
git commit -m "feat(api): expose xiaoyi task tools"
```

## Task 5: Frontend Core Flow

**Files:**
- Modify: `apps/web/src/api/pentest.ts`
- Modify: `apps/web/src/api/pentest.test.ts`
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Modify: `apps/web/src/pages/PentestPage.test.tsx`
- Modify: `apps/web/e2e/golden-path.spec.ts`

- [ ] **Step 1: Add failing frontend API tests**

Add tests that assert:

```ts
await updateScanPlanAssets(planId, [{ host: 'www.example.test', hostType: 'domain', ports: [443] }]);
expect(fetch).toHaveBeenCalledWith('/api/v1/scan-plans/<id>/assets', expect.objectContaining({ method: 'PATCH' }));

const session = createPrecheckSession();
await session.send({ action: 'can_subdomain', domains: ['example.test'] });
await session.send({ action: 'can_port', hosts: [{ host: 'example.test', hostType: 'domain' }] });
session.close();
expect(MockWebSocket.instances).toHaveLength(1);
```

- [ ] **Step 2: Implement API helper**

In `pentest.ts`, add:

```ts
export type PrecheckHost = { host: string; hostType: 'domain' | 'ip'; [key: string]: unknown };

export function updateScanPlanAssets(planId: string, assetList: Array<Record<string, unknown>>) {
  return apiRequest(`/api/v1/scan-plans/${uuid.parse(planId)}/assets`, scanPlanSchema, {
    method: 'PATCH',
    body: { asset_list: assetList },
  });
}
```

Replace one-shot `runPrecheck` internals with a reusable session helper while preserving `runPrecheck` as a compatibility wrapper.

- [ ] **Step 3: Persist accepted precheck results**

In `PentestPage.tsx`, after successful port precheck, derive assets like:

```ts
const assets = result.hosts.map((host) => ({
  ...host,
  host: String(host.host ?? ''),
  hostType: host.hostType === 'ip' ? 'ip' : 'domain',
}));
setPlan(await updateScanPlanAssets(plan.id, assets));
```

Keep direct/no-precheck flow by sending the manually entered target as:

```ts
[{ host: values.target, hostType: 'domain' }]
```

- [ ] **Step 4: Run frontend targeted tests**

Run:

```bash
cd apps/web
npm test -- --run src/api/pentest.test.ts src/pages/PentestPage.test.tsx
```

Expected: pass.

- [ ] **Step 5: Run Playwright golden path**

Run:

```bash
cd apps/web
npm run test:e2e -- golden-path.spec.ts
```

Expected: pass. If the local dev server requirement fails, start the repo's documented web dev server and rerun.

- [ ] **Step 6: Commit frontend flow**

Run:

```bash
git add apps/web/src/api/pentest.ts apps/web/src/api/pentest.test.ts apps/web/src/pages/PentestPage.tsx apps/web/src/pages/PentestPage.test.tsx apps/web/e2e/golden-path.spec.ts
git commit -m "feat(web): persist xiaoyi precheck assets"
```

## Task 6: Full Verification And Live Smoke

**Files:**
- Modify only if tests expose defects in touched files.

- [ ] **Step 1: Run backend suite**

Run:

```bash
cd apps/api
pytest -q
```

Expected: all backend tests pass.

- [ ] **Step 2: Run frontend suite**

Run:

```bash
cd apps/web
npm test -- --run
```

Expected: all frontend unit tests pass.

- [ ] **Step 3: Run E2E suite**

Run:

```bash
cd apps/web
npm run test:e2e
```

Expected: Playwright golden path passes.

- [ ] **Step 4: Run non-destructive live smoke**

Use configured Xiaoyi environment variables only in the local shell/session, never in committed files. Check:

```bash
curl -i https://yundun.test.cqxy-ai.com
```

Then run the non-destructive DeepSeek model check through the repo's existing smoke script if present. If no smoke script exists, run only a GET/HEAD connectivity check against Xiaoyi and a model list/completion check against the model provider. Do not start an unauthorized scan. If the Xiaoyi host returns 502 again, record the upstream status and keep local tests as the release gate.

- [ ] **Step 5: Final status**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected: working tree clean except intentional uncommitted verification artifacts, with commits for spec, plan, backend, tools, and frontend if all implementation tasks are completed.
