# Xiaoyi Child Failure Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and display Xiaoyi child-task failures returned through `childTaskId`, `currentPhase`, and `errorMessage`.

**Architecture:** Extend the existing Xiaoyi normalization boundary rather than adding a new integration layer. Carry the normalized error on `EngineTask`, persist it on the existing child `Task`, and render existing `/children` data in the session page.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, TypeScript, TanStack Query, Vitest.

---

### Task 1: Normalize the real Xiaoyi child response

**Files:**
- Modify: `apps/api/tests/test_engine.py`
- Modify: `apps/api/app/engine.py`

- [ ] Add a test that passes the observed response with `childTaskId`, `currentPhase`, `target`, and `errorMessage` to `parse_engine_task` and expects the normalized ID, failed phase, name, and error.
- [ ] Run `pytest tests/test_engine.py -q` from `apps/api` and verify the new assertion fails because the current adapter ignores those fields.
- [ ] Extend `EngineTask` and `parse_engine_task` with only the observed aliases; bound the error text and leave missing errors as `None`.
- [ ] Re-run `pytest tests/test_engine.py -q` and verify it passes.

### Task 2: Persist and expose the child error

**Files:**
- Modify: `apps/api/tests/test_sync.py`
- Modify: `apps/api/app/sync.py`

- [ ] Change the child-sync fixture to return a failed `EngineTask` with `error_message="子任务扫描失败或超时"`, then assert `/children` exposes that value.
- [ ] Run the focused sync test and verify it fails because `sync_children` does not copy engine errors.
- [ ] Copy the normalized error into the existing child task's `error_message`; set a stable `XIAOYI_TASK_FAILED` code only when an error exists and clear both fields when a later state has no error.
- [ ] Re-run `pytest tests/test_sync.py -q` and verify it passes.

### Task 3: Show failed child details in the execution page

**Files:**
- Modify: `apps/web/src/pages/PentestSessionPage.test.tsx`
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Modify: `apps/web/src/styles.css` only if the existing task card styles cannot present the content legibly.

- [ ] Add a session-page test whose `/children` response contains a failed child and assert its target/status and `子任务扫描失败或超时` are visible.
- [ ] Run the focused Vitest file and verify the new assertion fails because children are currently only counted.
- [ ] Render a compact child-task section using the already-fetched children, with status, phase, target/name, and an error alert when present.
- [ ] Re-run the focused Vitest file and verify it passes.

### Task 4: Verify, commit, deploy, and recheck

**Files:**
- No additional production files expected.

- [ ] Run the full API test suite.
- [ ] Run Web lint, unit tests, and production build.
- [ ] Review `git diff --check` and confirm `apps/api/data/experience.db` remains untracked.
- [ ] Commit the tested implementation and push `codex/project-handoff`.
- [ ] Deploy the existing API/Web services without changing topology or dependencies.
- [ ] Query the deployed task children endpoint and open the task page to verify the failure reason is visible.

