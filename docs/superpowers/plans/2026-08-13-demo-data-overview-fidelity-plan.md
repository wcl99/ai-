# Demo Data And Overview Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the supplied asset, completed task, 132 vulnerabilities, and DOCX report through a read-only demo data mode, while matching the four annotated overview visuals to their supplied material images.

**Architecture:** Add one FastAPI demo-data adapter that parses the supplied files into the existing response schemas with stable UUIDs and explicit configuration. Existing read endpoints merge the adapter records only when `DEMO_DATA_ENABLED=true`; write operations remain database-backed. The React dashboard keeps its material-image overlays and replaces only the inaccurate typography, curve interpolation, timeline axis, and donut drawing.

**Tech Stack:** FastAPI, Pydantic Settings, Python standard library JSON/UUID/path handling, React 18, TypeScript, SVG, CSS, pytest, Vitest.

---

### Task 1: Demo data adapter

**Files:**
- Create: `apps/api/app/demo_data.py`
- Create: `apps/api/tests/test_demo_data.py`
- Modify: `apps/api/app/config.py`

- [ ] Write tests that load 132 vulnerabilities, preserve source fields, create stable linked IDs, filter by severity and keyword, and reject report paths outside the configured directory.
- [ ] Run `python -m pytest tests/test_demo_data.py -q` from `apps/api` and confirm failure because the adapter does not exist.
- [ ] Implement the minimal cached adapter using `json`, `pathlib`, and `uuid.uuid5`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Read API integration

**Files:**
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/tests/test_demo_data.py`

- [ ] Add API tests for assets, tasks, task detail/events, vulnerability list/detail/overview, reports/download, and dashboard summary in demo mode.
- [ ] Run the focused API tests and confirm they fail before endpoint integration.
- [ ] Merge demo records into the existing organization-scoped read responses without changing write behavior or API schemas.
- [ ] Re-run the focused tests and existing result/dashboard tests.

### Task 3: Overview visual contracts

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/materialResponsive.test.ts`
- Create: `apps/web/src/pages/DashboardPage.test.tsx`

- [ ] Add tests requiring an SVG donut with rounded segment caps, a smooth monotone/catmull-style path, fixed readable summary typography, and one shared timeline axis variable.
- [ ] Run the focused Vitest files and confirm the new assertions fail.
- [ ] Implement the SVG donut, smooth curve helper, material-matched type scale, and centered timeline axis.
- [ ] Re-run focused tests and confirm they pass.

### Task 4: Verification and release

- [ ] Run all backend tests and Ruff from `apps/api`.
- [ ] Run all frontend tests, ESLint, and production build from `apps/web`.
- [ ] Compare `/overview` at 1294x912 and 1920x1080 against the four supplied material images without triggering any scan.
- [ ] Commit only source/tests/config required by this plan; exclude the user-owned `数据/`, `.superpowers/`, `output/`, and unrelated untracked documents.
- [ ] Push `codex/project-handoff`, build the exact commit, deploy through the existing server release flow, and verify health plus the affected read endpoints.
