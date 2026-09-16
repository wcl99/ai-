# Xiaoyi Mode Success Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Xiaoyi scenario values and expose a durable task-start success event through the existing task event API.

**Architecture:** Keep UI scene identity separate from the outgoing Xiaoyi mode because two scenes share one value. Reuse the existing `TaskEvent` persistence and task events endpoint at the exact point where the synchronization worker receives the external task ID.

**Tech Stack:** React, TypeScript, FastAPI, SQLAlchemy, Vitest, pytest.

---

### Task 1: Add failing scenario mapping tests

**Files:**
- Modify: `apps/web/src/pages/PentestPage.test.tsx`
- Modify: `apps/api/tests/test_api.py`

- [ ] Select “两清两固” in the existing frontend flow and expect `scan_mode: two_high_one_weak`.
- [ ] Expect the API to accept and freeze `mlps_2_0`.
- [ ] Run focused Vitest and pytest commands and verify failures against the current invented values.

### Task 2: Implement the confirmed mapping

**Files:**
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Modify: `apps/web/src/api/pentest.ts`
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/main.py`
- Modify: `docs/api-contract.md`

- [ ] Use unique UI scene values and map them to `standard`, `two_high_one_weak`, or `mlps_2_0` before plan creation.
- [ ] Restrict new plan input to the confirmed Xiaoyi values and translate legacy draft aliases during confirmation.
- [ ] Run focused tests and verify they pass.

### Task 3: Add a durable Xiaoyi start-success event

**Files:**
- Modify: `apps/api/tests/test_sync.py`
- Modify: `apps/api/app/sync.py`

- [ ] Add a failing worker test expecting one `xiaoyi_task_started` event with external task ID, scan mode, status, and phase.
- [ ] Write the event after successful upstream task creation using the existing `TaskEvent` model.
- [ ] Run the focused worker test and verify it passes.

### Task 4: Verify, publish, deploy, and test

**Files:**
- No additional source files.

- [ ] Run Ruff, all API tests, all web tests, ESLint, TypeScript, and production build.
- [ ] Commit and push the current branch without adding runtime data or user materials.
- [ ] Deploy the new image and confirm `/health/ready`.
- [ ] Start the three requested non-standard scenes against the authorized target.
- [ ] Read `GET /api/v1/tasks/{task_id}/events` and Xiaoyi task status to prove the requested modes and success logs.
