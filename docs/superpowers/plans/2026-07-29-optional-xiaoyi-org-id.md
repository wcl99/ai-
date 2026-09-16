# Optional Xiaoyi Organization ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let confirmed plans create Xiaoyi tasks without `org_id`, while preserving and validating it when configured.

**Architecture:** Keep deployment configuration unchanged and make the existing identity mapping conditional. The frozen plan snapshot and outbound Xiaoyi payload omit `org_id` when it is absent; all other required task fields and safety gates remain unchanged.

**Tech Stack:** Python 3.12, FastAPI, Pydantic Settings, pytest, Ruff

---

### Task 1: Make the frozen Xiaoyi context omit an unconfigured organization

**Files:**
- Modify: `apps/api/tests/test_engine.py`
- Modify: `apps/api/tests/test_api.py`
- Modify: `apps/api/app/engine.py`
- Modify: `apps/api/app/main.py`

- [ ] **Step 1: Write the failing identity and confirmation tests**

Replace the old explicit-mapping test with:

```python
def test_xiaoyi_org_mapping_is_optional():
    settings = Settings(
        jwt_secret="test-secret-that-is-at-least-32-characters",
        engine_mode="xiaoyi",
        xiaoyi_org_id=None,
    )
    assert resolve_xiaoyi_org_id(settings) is None
```

Update `test_confirmation_freezes_xiaoyi_context` to assert:

```python
assert "org_id" not in context
assert context["user_id"] == "admin"
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
..\..\.venv\Scripts\python.exe -m pytest tests/test_engine.py::test_xiaoyi_org_mapping_is_optional tests/test_api.py::test_confirmation_freezes_xiaoyi_context -q
```

Expected: failures because `resolve_xiaoyi_org_id` raises in Xiaoyi mode and confirmation currently writes `org_id`.

- [ ] **Step 3: Implement the minimal optional mapping**

Change `resolve_xiaoyi_org_id` to return `settings.xiaoyi_org_id` without inventing a fallback. In the confirmation route, build the existing `xiaoyi_context` fields and conditionally merge:

```python
org_id = resolve_xiaoyi_org_id(settings)
xiaoyi_context = {
    "user_id": settings.xiaoyi_user_id or user.username,
    "plan_id": mapping.id,
    "scan_mode": plan.test_type,
    "scan_speed": "quick",
    "download_intermediate_results": True,
}
if org_id is not None:
    xiaoyi_context["org_id"] = org_id
```

Store `xiaoyi_context` in the snapshot without changing other confirmation behavior.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the command from Step 2. Expected: both tests pass.

### Task 2: Make the outbound Xiaoyi body conditionally include organization

**Files:**
- Modify: `apps/api/tests/test_engine.py`
- Modify: `apps/api/app/engine.py`

- [ ] **Step 1: Write failing payload tests**

Add a snapshot with every required context field except `org_id`, then assert:

```python
payload = build_xiaoyi_chat_payload(snapshot)
assert "org_id" not in payload
assert payload["user_id"] == "admin"
assert payload["plan_id"] == 999
```

Keep the existing configured-organization test and invalid configured-value tests.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
..\..\.venv\Scripts\python.exe -m pytest tests/test_engine.py -q
```

Expected: the new test fails because the payload builder currently requires `org_id`.

- [ ] **Step 3: Implement conditional payload validation**

Remove `org_id` from `required_context`. Validate it only when the key exists:

```python
org_id = context.get("org_id")
if org_id is not None:
    if isinstance(org_id, bool) or not isinstance(org_id, int):
        raise AppError(400, "INVALID_ENGINE_PAYLOAD", "小易组织 ID 必须为整数")
    if not 1 <= org_id <= 2_147_483_647:
        raise AppError(400, "INVALID_ENGINE_PAYLOAD", "小易组织 ID 超出正整数范围")
```

Build the result from required fields and conditionally add `org_id` when present.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run `tests/test_engine.py -q`. Expected: all engine tests pass.

### Task 3: Regression, publish, and deploy

**Files:**
- Verify: `apps/api/app/engine.py`
- Verify: `apps/api/app/main.py`
- Verify: `apps/api/tests/test_engine.py`
- Verify: `apps/api/tests/test_api.py`

- [ ] **Step 1: Run complete verification**

From `apps/api`, run:

```powershell
..\..\.venv\Scripts\python.exe -m pytest tests -q
..\..\.venv\Scripts\python.exe -m ruff check app tests
```

Expected: all tests pass and Ruff reports no errors.

- [ ] **Step 2: Commit and push the implementation**

```powershell
git add apps/api/app/engine.py apps/api/app/main.py apps/api/tests/test_engine.py apps/api/tests/test_api.py docs/superpowers/plans/2026-07-29-optional-xiaoyi-org-id.md
git commit -m "fix(engine): make Xiaoyi organization optional"
git push origin codex/project-handoff
```

- [ ] **Step 3: Deploy the changed API files**

Synchronize the four changed API files to `/opt/ai-security-platform`, rebuild the `api` image with the existing Compose configuration, and recreate only the API container. Verify the container reports `healthy`.

- [ ] **Step 4: Verify the website-to-Xiaoyi path**

Log in through the platform API, create and confirm a plan for the authorized target `http://139.198.31.136:81`, verify CDN status is safe, create the task, and immediately stop it. Confirm that the platform no longer returns `ENGINE_IDENTITY_NOT_CONFIGURED` and that no task remains running.
