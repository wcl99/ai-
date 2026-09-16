# Phase 5 Authorized Golden Path Implementation Plan

> **For agentic workers:** Use test-driven development and execute this plan task by task.

**Goal:** Replace the penetration-test demo path with a real, authorized platform flow from
draft plan creation through precheck, authorization, task creation, monitoring, stop/retry,
vulnerability lookup, and report lookup without ever triggering a real Xiaoyi scan in tests.

**Architecture:** Keep the React/FastAPI/PostgreSQL modular monolith. Add typed functions to the
existing native-fetch frontend boundary, use the existing platform WebSocket for precheck, and use
TanStack Query for task state polling and related platform resources. The backend contracts and
mock engine remain authoritative. No browser-to-Xiaoyi connection, new dependency, service, or
settings UI is introduced.

**Tech Stack:** React 18, TypeScript, TanStack Query, React Hook Form, Zod, native Fetch/WebSocket,
FastAPI, SQLAlchemy, Vitest, Playwright, Pytest.

**Status:** Completed on 2026-07-23. All automated gates and independent Critical/Important review
passed; the Playwright golden path passed 10 consecutive runs.

---

### Task 1: Add typed plan and task API contracts

**Files:**
- Create: `apps/web/src/api/pentest.ts`
- Create: `apps/web/src/api/pentest.test.ts`
- Modify: `apps/web/src/api/schemas.ts`

- [ ] Write failing tests for draft plan creation, plan confirmation, task creation with a stable
  request ID, task detail/events/children polling, stop, retry, and related vulnerability/report
  filters.
- [ ] Add strict Zod schemas for plans, tasks, task events, child tasks, and precheck results.
- [ ] Implement only same-origin `/api/v1/*` calls through the existing API client.
- [ ] Keep request IDs client-generated and stable for a single submission; do not persist them in
  browser storage.
- [ ] Run focused Vitest, TypeScript, and ESLint.

### Task 2: Replace the welcome-page demo with explicit authorization

**Files:**
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Create: `apps/web/src/pages/PentestPage.test.tsx`

- [ ] Write failing page tests proving analyze creates a DRAFT plan and never creates a task.
- [ ] Connect domain and port prechecks only to `/api/v1/prechecks/ws`; show connection,
  authorization, payload, and protocol errors distinctly.
- [ ] Add an unchecked, explicit authorization confirmation control. Only admin/security-expert
  users can call plan confirmation; operators receive a clear handoff message.
- [ ] Remove every direct-scan/demo navigation path. Task creation is enabled only after the
  confirmed plan response is `READY`.
- [ ] On task creation, navigate to `/pentest/session/{real_task_id}`.
- [ ] Preserve current page structure, CSS classes, icons, and supplied visual assets.

### Task 3: Replace the session demo with real platform state

**Files:**
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Create: `apps/web/src/pages/PentestSessionPage.test.tsx`

- [ ] Write failing tests for loading, running, completed, failed, and cancelled task states.
- [ ] Poll task detail while non-terminal; load task events, child tasks, vulnerabilities, and
  reports from platform APIs only.
- [ ] Render backend phase, progress, recoverable error, event history, and real related-result
  counts. Never display hard-coded hosts, tools, emails, metrics, or raw Xiaoyi payloads.
- [ ] Wire stop and retry to the existing endpoints with role/state guards and visible failures.
- [ ] Preserve history after terminal states and stop polling terminal tasks.

### Task 4: Lock the backend recovery and authorization path

**Files:**
- Modify: `apps/api/tests/test_api.py`
- Modify: `apps/api/tests/test_sync.py`

- [ ] Add regression tests proving a DRAFT plan cannot create a task, confirmation is separately
  audited, and request ID retries return the same task rather than creating duplicates.
- [ ] Add restart-style tests proving queued/running/cancelling tasks are rediscovered by a fresh
  sync iteration and status/progress never move backward.
- [ ] Verify stop, retry, sync exhaustion, and result history remain organization scoped.
- [ ] Use the mock engine only; no test may select `ENGINE_MODE=xiaoyi`.

### Task 5: Make the browser golden path deterministic

**Files:**
- Modify: `apps/web/e2e/golden-path.spec.ts`
- Modify: `apps/web/playwright.config.ts` only if deterministic startup requires it

- [ ] Route/mock `/auth/me`, plan, precheck, task, event, vulnerability, and report boundaries in
  Playwright without contacting Xiaoyi.
- [ ] Verify DRAFT creation, independent authorization, READY confirmation, idempotent task
  creation, real task-ID navigation, monitoring, stop, and retained history.
- [ ] Run the same golden-path test 10 consecutive times and record zero intermittent failures.

### Task 6: Verify and commit Phase 5

- [ ] Run frontend Vitest, TypeScript, ESLint, and production build.
- [ ] Run backend Ruff and all Pytest tests.
- [ ] Run Playwright golden path 10 times when Chromium is available.
- [ ] Run `git diff --check` and request independent review focused on authorization bypass,
  idempotency, stale polling, organization isolation, and accidental real-engine access.
- [ ] Resolve every Critical/Important finding.
- [ ] Commit only the authorized golden-path changes as
  `feat(pentest): connect authorized golden path`.

## Exit Criteria

- No production route in the penetration-test pages reads hard-coded business data.
- A plan remains DRAFT until a separately authorized confirmation succeeds.
- No task can be created before confirmation, and repeated submission does not duplicate a task.
- Browser precheck uses the platform WebSocket only.
- The session URL and all monitoring data use real platform identifiers and responses.
- Automated tests never contact a real Xiaoyi engine.
