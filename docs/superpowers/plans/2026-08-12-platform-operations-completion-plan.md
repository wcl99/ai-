# Platform Operations Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete captcha login, AI overview intelligence, task operations, and two-stage vulnerability workflows from the supplied material designs.

**Architecture:** Extend the existing FastAPI monolith and React SPA contracts without new services. Reuse signed tokens, DeepSeek-compatible configuration, SQLAlchemy aggregates, TanStack Query, Ant Design, and existing task/vulnerability state models.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, React 18, TypeScript, TanStack Query, Ant Design, Vitest, pytest, Playwright.

---

### Task 1: Captcha login

- [ ] Add failing API tests for issuing, expiring, and consuming a signed captcha challenge.
- [ ] Add failing frontend tests for rendering, submitting, and refreshing the challenge.
- [ ] Implement the minimal API schema/endpoints and login validation.
- [ ] Implement the material-aligned login control and refresh behavior.
- [ ] Run focused backend and frontend tests.

### Task 2: AI summary and risk trend

- [ ] Add failing API tests for real severity trend aggregation and deterministic AI fallback.
- [ ] Add failing dashboard tests for populated summary sections and trend series.
- [ ] Implement bounded DeepSeek summary generation using the existing model configuration.
- [ ] Implement the dashboard overview contract and material-matched rendering.
- [ ] Run focused API and dashboard tests.

### Task 3: Task summaries and operations

- [ ] Add failing API tests for task summary, detail payload, pause constraints, and terminal deletion.
- [ ] Add failing task-center tests for summary/detail/pause/delete interactions.
- [ ] Implement organization-scoped endpoints and dependent-record deletion.
- [ ] Implement row actions, summary/detail presentation, confirmations, and cache refresh.
- [ ] Run focused task tests.

### Task 4: Vulnerability drawer and operations

- [ ] Add failing API tests for vulnerability deletion and disposition constraints.
- [ ] Add failing list tests for drawer preview, full-detail navigation, disposition, and deletion.
- [ ] Implement the scoped delete endpoint and client methods.
- [ ] Rebuild the drawer and full page against the two supplied detail materials.
- [ ] Run focused vulnerability tests.

### Task 5: Release

- [ ] Run all backend tests and Ruff.
- [ ] Run all frontend tests, ESLint, and production build.
- [ ] Run responsive visual verification without triggering scans.
- [ ] Commit only planned files and push `codex/project-handoff`.
- [ ] Deploy the exact commit through the existing rollback-capable release flow.
- [ ] Verify public health and the new production asset markers.
