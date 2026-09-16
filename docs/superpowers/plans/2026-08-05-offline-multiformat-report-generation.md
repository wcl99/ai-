# Offline Multi-format Pentest Report Implementation Plan

> **For Codex:** Execute this plan task by task with test-first changes and verification after every task.

**Goal:** Generate one sanitized penetration-test report snapshot as Markdown, DOCX and PDF, store each successful format in the existing report table, and expose grouped format downloads in the report center.

**Architecture:** Keep report orchestration inside the existing FastAPI service. A small `app.reporting` package renders canonical Markdown and invokes local Pandoc/LibreOffice processes. `result_aggregation.ensure_local_report` owns idempotent persistence and task events. No schema or proxy changes.

**Tech Stack:** Python 3.12, SQLAlchemy async, FastAPI, Pandoc, LibreOffice Writer, React, TypeScript, Vitest.

---

## Task 1: Canonical Markdown template and renderer

**Files:**
- Create: `apps/api/app/reporting/__init__.py`
- Create: `apps/api/app/reporting/template.md`
- Create: `apps/api/app/reporting/render.py`
- Create: `apps/api/tests/test_reporting.py`

1. Add failing tests for the required reference-document sections, task metadata, vulnerability fields, empty-field wording, and sensitive-value redaction.
2. Run `pytest apps/api/tests/test_reporting.py -q` and confirm the tests fail for the missing module.
3. Add a sanitized static Markdown template containing the reference document's section order. Do not copy sample IPs, credentials or evidence.
4. Implement typed report snapshot structures and a renderer that escapes table cells, redacts secrets recursively, and never infers findings.
5. Re-run the targeted tests and commit.

## Task 2: Safe offline conversion

**Files:**
- Create: `apps/api/app/reporting/convert.py`
- Modify: `apps/api/tests/test_reporting.py`
- Create: `apps/api/app/reporting/reference.docx`

1. Add failing tests using mocked subprocess calls for exact argument arrays, no shell invocation, timeouts, isolated LibreOffice profiles, successful artifacts, and actionable conversion failures.
2. Implement `ReportConverter` with `subprocess.run(..., shell=False)`, trusted resource paths, task-scoped temporary directories, and atomic output replacement.
3. Generate a style-only `reference.docx` with Chinese body and heading styles. It must contain no customer content.
4. Re-run targeted tests and commit.

## Task 3: Idempotent report bundle persistence

**Files:**
- Modify: `apps/api/app/result_aggregation.py`
- Modify: `apps/api/tests/test_results.py`
- Modify: `apps/api/tests/test_sync.py`

1. Add failing tests proving that one task creates MD/DOCX/PDF records, repeated synchronization creates no duplicate format, and a converter failure preserves prior formats and records a `report_generation_failed` event.
2. Replace the legacy inline renderer with the canonical renderer and converter.
3. Query existing local reports by task and format, generate only missing formats, and write files beneath the current organization report directory.
4. Emit one availability event per successful format and one bounded failure event per failed format.
5. Re-run report and sync tests and commit.

## Task 4: Grouped report-center downloads

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/api/resources.ts`
- Modify: `apps/web/src/pages/ListPages.tsx`
- Create or modify: `apps/web/src/pages/ListPages.test.tsx`

1. Add a failing UI test with three report rows sharing a task and assert that the page renders one task row with MD/DOCX/PDF actions.
2. Group the current flat API response by `taskId` in the client; retain Markdown preview and direct downloads for all available formats.
3. Render unavailable formats disabled rather than hiding them.
4. Run the targeted Vitest suite and commit.

## Task 5: Offline image dependencies and integration verification

**Files:**
- Modify: `apps/api/Dockerfile`
- Modify: `README.md` if operational documentation needs the new image requirements.

1. Install `pandoc`, `libreoffice-writer`, `fonts-noto-cjk`, and `poppler-utils` in the existing API image, cleaning package lists in the same layer.
2. Build the API image and verify `pandoc --version`, `libreoffice --version`, and `pdftoppm -v` without network access at runtime.
3. Generate a representative Chinese sample bundle in the container.
4. Inspect DOCX structure and render DOCX/PDF pages to PNG; visually verify cover, tables, page breaks, Chinese glyphs, vulnerability sections, and absence of clipped content.
5. Run backend tests, frontend tests/build, `git diff --check`, and ensure only intended files are tracked.
6. Commit, push `codex/project-handoff`, deploy the existing compose service, and perform authenticated list/download smoke tests for all three formats.

## Rollback

Revert the report-generation commits and rebuild the existing image. Existing report rows and files remain readable; no database migration or proxy rollback is required.
