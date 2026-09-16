# HTTP-Compatible Analysis Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Start Analysis continue from draft creation to DeepSeek consultation on the deployed plain-HTTP origin.

**Architecture:** Add a dependency-free request-ID helper in the existing penetration-test page module and expose plan-creation failures outside the modal. Preserve the current API sequence and all scan safety gates.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, Vite

---

### Task 1: Reproduce the insecure-origin failure

**Files:**
- Modify: `apps/web/src/pages/PentestPage.test.tsx`

- [ ] Add a test that removes `crypto.randomUUID`, supplies
  `crypto.getRandomValues`, clicks `开始分析`, and expects the draft and
  consultation requests plus the analysis modal.
- [ ] Run `npm test -- PentestPage.test.tsx` and verify RED because the current
  component calls the missing method.

### Task 2: Implement the minimal compatibility fix

**Files:**
- Modify: `apps/web/src/pages/PentestPage.tsx`

- [ ] Add `createRequestId()` using native `randomUUID` when available and a
  `getRandomValues` UUID-v4 fallback otherwise.
- [ ] Generate the ID before `createScanPlan`, store it after the draft returns,
  and leave the API sequence unchanged.
- [ ] Render `planMutation.error` below the form when the modal is closed.
- [ ] Run the focused component test and verify GREEN.

### Task 3: Verify and deploy

**Files:**
- Verify: `apps/web/src/pages/PentestPage.tsx`
- Verify: `apps/web/src/pages/PentestPage.test.tsx`

- [ ] Run `npm test`, `npm run lint`, and `npm run build` from `apps/web`.
- [ ] Commit and push to `codex/project-handoff`.
- [ ] Synchronize the two frontend files, rebuild the API image that embeds the
  web bundle, recreate the API container, and confirm it is healthy.
- [ ] On `http://101.43.119.26:8000/pentest`, verify one click produces both
  `POST /api/v1/scan-plans` and
  `POST /api/v1/scan-plans/{id}/consultation/messages` without starting a scan.
