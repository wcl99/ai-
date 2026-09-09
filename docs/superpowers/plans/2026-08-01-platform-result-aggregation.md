# Platform Result Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Xiaoyi tool results into persisted platform vulnerabilities, meaningful terminal status, and a downloadable local report without changing Xiaoyi.

**Architecture:** Add a focused result-aggregation module used by the existing single-process synchronizer. Reuse the current `Vulnerability`, `Report`, task raw JSON, report directory, and API endpoints; no schema or dependency changes.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy, pytest, Markdown files.

---

### Task 1: Normalize tool failures

**Files:**
- Modify: `apps/api/app/engine.py`
- Test: `apps/api/tests/test_engine.py`

- [ ] Add a failing test where a failed tool places nested JSON in top-level `errorMessage`.
- [ ] Run the focused test and verify it fails because no message is extracted.
- [ ] Extend `summarize_tool_failures` to inspect `errorMessage`, `remark`, and nested result errors with bounded redacted output.
- [ ] Run the focused test and verify it passes.

### Task 2: Extract and persist verified results

**Files:**
- Create: `apps/api/app/result_aggregation.py`
- Modify: `apps/api/app/sync.py`
- Test: `apps/api/tests/test_result_aggregation.py`

- [ ] Add failing tests for nested tool payload decoding, `vuln_info` extraction, severity mapping, deduplication keys, and bounded summaries.
- [ ] Run the new test file and verify failures are caused by missing aggregation functions.
- [ ] Implement pure parsing functions and an async persistence function using existing `Vulnerability` rows.
- [ ] Call aggregation from child synchronization and preserve sanitized summaries in `raw_external`.
- [ ] Run the new tests and sync tests until green.

### Task 3: Generate the platform fallback report

**Files:**
- Modify: `apps/api/app/result_aggregation.py`
- Modify: `apps/api/app/sync.py`
- Test: `apps/api/tests/test_result_aggregation.py`
- Test: `apps/api/tests/test_sync.py`

- [ ] Add a failing integration test for a terminal task with tool evidence and no upstream `reportUrl`.
- [ ] Verify the task has no report before implementation.
- [ ] Render a deterministic Markdown report, write it under `settings.report_dir`, and create one idempotent local `Report` row.
- [ ] Preserve upstream external reports and callback reports without replacement.
- [ ] Verify preview/download behavior through existing report APIs.

### Task 4: Correct terminal status and failure propagation

**Files:**
- Modify: `apps/api/app/sync.py`
- Test: `apps/api/tests/test_sync.py`

- [ ] Add failing tests proving root error messages are not cleared and evidence-bearing failures become `PARTIAL_SUCCEEDED`.
- [ ] Implement parent error aggregation and partial-success mapping after children/tools have been synchronized.
- [ ] Keep `FAILED` when no successful evidence exists.
- [ ] Run focused sync tests.

### Task 5: Verify contracts and document behavior

**Files:**
- Modify: `apps/api/README.md`

- [ ] Document local fallback report and partial-success rules.
- [ ] Run `python -m ruff check apps/api`.
- [ ] Run `python -m pytest apps/api/tests`.
- [ ] Confirm the web build still succeeds because response contracts and routes are unchanged.

