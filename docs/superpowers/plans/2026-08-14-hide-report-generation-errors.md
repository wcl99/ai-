# Hide Report Generation Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide report generation and packaging error text from every frontend task display while retaining all backend state and other task errors.

**Architecture:** Add one pure display predicate in `vendorDisplay.ts`, then reuse it at the task session, task summary, and generated feedback boundaries. API payloads and persisted errors remain unchanged.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library.

---

### Task 1: Shared report-error display policy

**Files:**
- Modify: `apps/web/src/vendorDisplay.ts`
- Test: `apps/web/src/vendorDisplay.test.ts`

- [ ] Add failing cases for Chinese report generation/packaging errors and English ZIP entry size errors, plus a control case for a network error.
- [ ] Run `pnpm -C apps/web test -- vendorDisplay.test.ts` and confirm the new import or assertions fail.
- [ ] Implement `visibleTaskError(value)` returning `null` only for report-generation/packaging errors.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Apply the policy to every task display

**Files:**
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Modify: `apps/web/src/pages/pentestFeedback.ts`
- Modify: `apps/web/src/pages/ListPages.tsx`
- Test: `apps/web/src/pages/PentestSessionPage.test.tsx`
- Test: `apps/web/src/pages/pentestFeedback.test.ts`
- Test: `apps/web/src/pages/ListPages.test.tsx`

- [ ] Change existing tests so report-generation error text must be absent from the child card, main monitor, conversation feedback, and task summary drawer, while a non-report error remains visible.
- [ ] Run the three focused test files and confirm they fail for the report-error assertions.
- [ ] Reuse `visibleTaskError` at all four display boundaries.
- [ ] Re-run focused tests and confirm they pass.

### Task 3: Verify and release

**Files:**
- No production files beyond Tasks 1-2.

- [ ] Run the complete frontend tests, lint, and production build.
- [ ] Inspect `git diff --check` and ensure unrelated untracked data remains untouched.
- [ ] Commit and push the frontend-only change.
- [ ] Overlay the new `dist` on the current server image, retain rollback, and verify the public session page no longer contains the ZIP error text.
