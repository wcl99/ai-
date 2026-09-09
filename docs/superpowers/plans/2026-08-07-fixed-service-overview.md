# Fixed Service Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reference report's second chapter a fixed, verbatim section in every generated report.

**Architecture:** Keep the existing canonical Markdown template and offline converters. Replace only the dynamic service-overview placeholders with the approved reference text, then remove their now-unused render-time construction.

**Tech Stack:** Python 3.12, pytest, Markdown, Pandoc, LibreOffice, FastAPI

---

### Task 1: Lock the fixed chapter with a regression test

**Files:**
- Modify: `apps/api/tests/test_reporting.py`

- [ ] Add a test that supplies sentinel child/tool names and asserts the exact fixed service-overview content is present while the sentinels are absent.
- [ ] Run `python -m pytest apps/api/tests/test_reporting.py -q` and confirm the new assertion fails because the current template still emits dynamic values.

### Task 2: Replace the dynamic chapter

**Files:**
- Modify: `apps/api/app/reporting/template.md`
- Modify: `apps/api/app/reporting/render.py`

- [ ] Replace the service-overview block with reference lines 109-223.
- [ ] Remove `child_summary` and `tool_summary` construction/substitution while preserving the public renderer signature.
- [ ] Run the targeted test and confirm it passes.

### Task 3: Verify formats and API delivery

**Files:**
- Create outside source tree: test report `.md`, `.docx`, and `.pdf`

- [ ] Run `python -m ruff check apps/api` and `python -m pytest apps/api/tests`.
- [ ] Build/deploy the current API image without changing proxy configuration.
- [ ] Generate a synthetic authorized test report through the platform report workflow and retrieve it through the report API.
- [ ] Render every DOCX/PDF page to PNG and inspect every page for clipping, overlap, missing glyphs, and chapter fidelity.
