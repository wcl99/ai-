# Xiaoyi Result Callback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the documented digital-human result endpoints accept Xiaoyi identities, deduplicate retries, and surface key callback information in the active task UI.

**Architecture:** Keep the four documented POST routes. Add one result-ingestion service that resolves external identities and performs transactional idempotent writes. Reuse the current task event and frontend polling path instead of adding a new service or transport.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy async, Alembic, PostgreSQL/SQLite tests, React Query, Vitest, pytest.

---

### Task 1: External identity contract

**Files:**
- Modify: `apps/api/app/schemas.py`
- Create: `apps/api/app/result_ingest.py`
- Test: `apps/api/tests/test_results.py`

- [ ] Add failing tests that POST a numeric Xiaoyi `plan_id` and external `task_id` to the vulnerability endpoint.
- [ ] Verify the test fails with request validation or plan lookup errors.
- [ ] Add `ResultPlanId = UUID | int` and `ResultTaskId = UUID | str` request types.
- [ ] Implement `resolve_result_context(session, user, plan_id, task_id)` using `XiaoyiPlanMapping.id` and `Task.external_task_id`, including organization and task-plan checks.
- [ ] Run `pytest tests/test_results.py -q` and commit.

### Task 2: Idempotent callback receipts

**Files:**
- Modify: `apps/api/app/models.py`
- Create: `apps/api/alembic/versions/0007_add_ai_callback_receipts.py`
- Modify: `apps/api/app/result_ingest.py`
- Test: `apps/api/tests/test_results.py`
- Test: `apps/api/tests/test_migrations.py`

- [ ] Add a failing test that sends the same vulnerability payload twice and expects one vulnerability with the same returned ID.
- [ ] Add `AiCallbackReceipt` with organization, result type, SHA-256 payload hash, resource type/ID, and received timestamp; enforce a unique constraint on organization, result type, and hash.
- [ ] Add and test Alembic migration `0007`.
- [ ] Implement canonical JSON hashing and receipt lookup inside the same database transaction as the result write.
- [ ] Run result and migration tests and commit.

### Task 3: Route all four document payloads through ingestion

**Files:**
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/app/result_ingest.py`
- Test: `apps/api/tests/test_results.py`

- [ ] Add failing external-ID tests for asset upsert, report upload, and log upload.
- [ ] Refactor the four route handlers to use the shared resolved context and receipt functions.
- [ ] Preserve existing sensitive-data redaction, report filename safety, report URL validation, and platform UUID compatibility.
- [ ] Return `plan_id`, `org_id`, and the resource ID in the standard response data.
- [ ] Run `pytest tests/test_results.py -q` and commit.

### Task 4: Surface key callback messages

**Files:**
- Modify: `apps/api/app/result_ingest.py`
- Modify: `apps/web/src/pages/pentestFeedback.ts`
- Modify: `apps/web/src/pages/pentestFeedback.test.ts`
- Test: `apps/api/tests/test_results.py`

- [ ] Add failing backend tests proving warning/error/completion logs generate task events while debug logs do not.
- [ ] Add failing frontend tests proving callback errors, vulnerabilities, and reports appear while routine callback noise remains hidden.
- [ ] Generate normalized event types `xiaoyi_warning`, `xiaoyi_error`, and `xiaoyi_milestone` for key logs.
- [ ] Extend the feedback filter to include these normalized callback events.
- [ ] Run focused backend and frontend tests and commit.

### Task 5: Deliver the Xiaoyi-facing contract

**Files:**
- Create: `docs/integrations/xiaoyi-result-callback-api.md`
- Modify: `README.md`

- [ ] Document login, Bearer JWT, base URL placeholders, four routes, field tables, aliases, response/error examples, retry rules, size limits, and a complete curl-free JSON integration sequence.
- [ ] Clearly distinguish Xiaoyi numeric `plan_id` and external `task_id` from platform UUIDs.
- [ ] Add a README link and review the document against `E:\ai自动渗透\数字人对接文档.md`.
- [ ] Commit the documentation.

### Task 6: Full verification and publication

**Files:**
- Test: `apps/api/tests`
- Test: `apps/web/src`

- [ ] Run all backend tests from `apps/api`.
- [ ] Run Ruff on backend source and tests.
- [ ] Run all frontend tests, TypeScript checking, ESLint, and the production build.
- [ ] Run `git diff --check` and verify `apps/api/data/` is not staged.
- [ ] Push `codex/project-handoff`, deploy the tested image, then verify login, callback authentication, one idempotent sample callback, task result queries, and the external port 8000 page.

