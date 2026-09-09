# Security Centers Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver material-aligned task, vulnerability, and report centers with real filtering, detail workflows, and persistent pentest session replay links.

**Architecture:** Keep the existing React/Ant Design shell and pentest pages. Extend resource API schemas and FastAPI routes for server-side filters and workflow mutations, then compose overview/list/detail surfaces from the existing page primitives.

**Tech Stack:** React 18, TypeScript, Ant Design, TanStack Query, React Router, FastAPI, SQLAlchemy, Pydantic, pytest, Vitest.

---

### Task 1: Lock regression expectations

**Files:**
- Modify: `apps/web/src/pages/ListPages.test.tsx`
- Modify: `apps/web/src/pages/PentestSessionPage.test.tsx`
- Test: `apps/api/tests/test_tasks.py`, `apps/api/tests/test_vulnerabilities.py`, `apps/api/tests/test_reports.py`

- [ ] Add failing tests for task row navigation, terminal session replay, multi-filter query parameters, vulnerability detail rendering, and report confirmation/export actions.
- [ ] Run the focused web and API tests and confirm failures are caused by missing behavior.

### Task 2: Extend backend query and workflow contracts

**Files:**
- Modify: `apps/api/app/tasks/routes.py`
- Modify: `apps/api/app/vulnerabilities/routes.py`
- Modify: `apps/api/app/reports/routes.py`
- Modify: related schemas/services/models and tests as required

- [ ] Add validated query parameters for task type/creator/date/team, vulnerability source/asset/business/date/AI/report flags, and report source/format/status/date.
- [ ] Add vulnerability detail response with evidence, remediation, retest state, and timeline fields.
- [ ] Add report confirmation/export endpoints and export record response without changing existing download behavior.
- [ ] Run focused backend tests until green.

### Task 3: Add frontend API mappings and navigation

**Files:**
- Modify: `apps/web/src/api/resources.ts`
- Modify: `apps/web/src/api/pentest.ts`
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] Map new filter inputs to URLSearchParams and server query contracts.
- [ ] Add vulnerability detail and report workflow client functions.
- [ ] Add `/vulnerabilities/:vulnerabilityId` route and task-session navigation helpers.
- [ ] Re-run focused API and routing tests.

### Task 4: Rebuild task center interactions

**Files:**
- Modify: `apps/web/src/pages/ListPages.tsx`
- Modify: `apps/web/src/components/Ui.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Match task material layout with six metric cards, filter groups, table actions, pagination, and responsive states.
- [ ] Add type/creator/date/team filters and reset behavior.
- [ ] Make task name, ID, summary, detail, and status actions navigate to `/pentest/session/:taskId` where appropriate.
- [ ] Keep pentest page visuals unchanged and run task tests.

### Task 5: Rebuild vulnerability center and detail page

**Files:**
- Modify: `apps/web/src/pages/OverviewPages.tsx`
- Modify: `apps/web/src/pages/ListPages.tsx`
- Create: `apps/web/src/pages/VulnerabilityDetailPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Align overview charts/cards and shared range filters to material hierarchy.
- [ ] Add list filters, selection toolbar, bulk mutations, and row navigation.
- [ ] Implement the standalone detail page with evidence, AI summary, remediation, retest, and timeline sections.
- [ ] Run vulnerability component and route tests.

### Task 6: Rebuild report center workflow

**Files:**
- Modify: `apps/web/src/pages/OverviewPages.tsx`
- Modify: `apps/web/src/pages/ListPages.tsx`
- Modify: `apps/web/src/api/resources.ts`
- Modify: `apps/web/src/styles.css`

- [ ] Match report overview cards/charts/latest reports/insight surfaces.
- [ ] Add list filters, confirmation, export, preview, download, and export-history states.
- [ ] Run report component tests and API contract tests.

### Task 7: Full verification and scope audit

**Files:**
- No unrelated files

- [ ] Run `npm run build`, `npm run lint`, `npm run test`, and relevant Playwright tests.
- [ ] Run `python -m ruff check apps/api` and targeted `pytest`.
- [ ] Verify the diff excludes pentest visual components except additive navigation-safe changes.
