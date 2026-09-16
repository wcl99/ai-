# Live Findings and Report Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist confirmed Xiaoyi findings while tasks are running, show them in the execution monitor, and treat the known ZIP report-packaging failure as recovered when the platform report is ready.

**Architecture:** Reuse the existing Xiaoyi tool polling and vulnerability extractor in the synchronizer instead of adding a second ingestion path. Keep the existing REST polling in React and render the returned task vulnerabilities inside the execution monitor. Add one narrowly scoped error classifier so only the known report-packaging failure can be recovered after local report creation.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, TypeScript, TanStack Query, Ant Design, Vitest.

---

### Task 1: Persist findings from active child tasks

**Files:**
- Modify: `apps/api/app/sync.py`
- Test: `apps/api/tests/test_sync.py`

- [ ] **Step 1: Write the failing test**

Add an engine fixture whose parent and child remain `RUNNING`, whose `get_tools` returns one explicit `vuln_info`, and assert after the second `sync_once` that the vulnerability exists for the parent task. Run a third iteration and assert the row count remains one.

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest apps/api/tests/test_sync.py::test_active_child_tools_persist_findings_without_duplicates -q`

Expected: FAIL because `get_tools` is only called for terminal children.

- [ ] **Step 3: Write minimal implementation**

In `sync_children`, call the optional `get_tools` method for active and terminal children. Continue swallowing only the existing controlled `AppError`, reuse `persist_vulnerabilities`, and leave raw tool data out of the database.

- [ ] **Step 4: Run test to verify it passes**

Run the focused pytest command and expect PASS.

- [ ] **Step 5: Commit**

Commit `apps/api/app/sync.py` and `apps/api/tests/test_sync.py` with `feat(api): persist live Xiaoyi findings`.

### Task 2: Recover the known ZIP report failure

**Files:**
- Modify: `apps/api/app/sync.py`
- Test: `apps/api/tests/test_sync.py`

- [ ] **Step 1: Change the existing fallback test first**

Update `test_terminal_tool_evidence_creates_partial_result_and_local_report` to expect `SUCCEEDED`, no customer-facing error, a `READY` local report, and a `report_fallback_used` event. Add a second test with a non-ZIP tool error and assert it remains `PARTIAL_SUCCEEDED`.

- [ ] **Step 2: Run tests to verify failure**

Run both focused tests and expect the ZIP case to fail on the old partial status.

- [ ] **Step 3: Implement the classifier and state recovery**

Add a pure `is_report_packaging_error(message)` helper that recognizes only `ZIP entry size is too large or invalid` in a report-generation message. After `ensure_local_report` returns a report, recover the parent to `SUCCEEDED` only when execution evidence exists and every collected task error matches this classifier. Clear `error_code` and `error_message`, and add a `report_fallback_used` task event with the original reason in bounded event data.

- [ ] **Step 4: Run focused and backend tests**

Run the two tests, then `python -m pytest apps/api/tests -q` and `python -m ruff check apps/api`.

- [ ] **Step 5: Commit**

Commit with `fix(api): recover from Xiaoyi ZIP report failure`.

### Task 3: Render live findings in the execution monitor

**Files:**
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/pages/PentestSessionPage.test.tsx`

- [ ] **Step 1: Write the failing component integration assertion**

Extend the task-page response fixture with a vulnerability and assert the `执行监测` card contains a `实时漏洞` region showing the localized severity, title, asset, formatted discovery time, and a closed details disclosure containing the description.

- [ ] **Step 2: Run test to verify it fails**

Run: `node node_modules/vitest/vitest.mjs run src/pages/PentestSessionPage.test.tsx`

Expected: FAIL because findings currently render only in the left result rail.

- [ ] **Step 3: Implement the minimal UI**

Inside the existing execution monitor card, render a compact live-finding section after the metrics. Use the already-polled `vulnerabilities` array, show total count and the latest twenty items, and keep descriptions in closed native `details` elements. Add responsive styles matching the current monitor card.

- [ ] **Step 4: Run focused and frontend verification**

Run the focused test, ESLint, TypeScript, all Vitest tests, and the Vite production build.

- [ ] **Step 5: Commit**

Commit with `feat(web): show live task findings`.

### Task 4: Release verification

**Files:**
- No source files expected.

- [ ] **Step 1: Verify repository scope**

Run `git diff --check`, inspect `git status --short`, and confirm `apps/api/data/` remains untracked and uncommitted.

- [ ] **Step 2: Push and deploy**

Push `codex/project-handoff`, build the prebuilt release archive using the existing `.run/Dockerfile.prebuilt` flow, deploy to `101.43.119.26:8000`, and preserve the previous release directory.

- [ ] **Step 3: Verify online behavior**

Check `/health/ready`, confirm the deployed JavaScript contains the live-findings marker, and perform a read-only database check proving the known ZIP task has a ready local report and its task state is recovered by the updated synchronizer.
