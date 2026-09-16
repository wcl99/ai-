# Xiaoyi Message Narrative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert nested Xiaoyi `message` records into plain-language orchestration timeline steps while keeping raw output collapsed.

**Architecture:** Extend the existing pure `pentestToolFeed.ts` normalization boundary with recursive message extraction and deterministic role explanations. Render the resulting narrative steps in `PentestPage.tsx`; keep the already-redacted result preview behind native `<details>`.

**Tech Stack:** TypeScript, React, Vitest, existing Ant Design components.

---

### Task 1: Normalize nested Xiaoyi messages

**Files:**
- Modify: `apps/web/src/pages/pentestToolFeed.ts`
- Test: `apps/web/src/pages/pentestToolFeed.test.ts`

- [ ] Add a failing test whose result contains nested WebRE and APIFuzzerAgent records and expects ordered, deduplicated narratives.
- [ ] Run `node node_modules/vitest/vitest.mjs run src/pages/pentestToolFeed.test.ts` and verify the narrative assertion fails.
- [ ] Add a `PentestToolNarrative` type, recursive object/array traversal, status normalization, and deterministic role descriptions.
- [ ] Preserve existing sensitive-key redaction and cap displayed text.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Render customer explanations before technical details

**Files:**
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/pages/PentestSessionPage.test.tsx`

- [ ] Add a failing session test that expects WebRE's purpose and the dependency message to appear, and raw JSON to be closed by default.
- [ ] Render narrative cards containing actor, action, explanation, status, and timestamp.
- [ ] Move `resultPreview` into a native details element labeled “查看技术详情”.
- [ ] Add compact responsive styles without changing the existing three-column workbench.
- [ ] Run the session and tool-feed tests until they pass.

### Task 3: Verify and publish

**Files:**
- No new production files.

- [ ] Run the complete frontend test suite, TypeScript check, ESLint, and production build.
- [ ] Run backend regression tests because deployment packages both applications.
- [ ] Commit and push `codex/project-handoff`.
- [ ] Build the prebuilt server image, switch only the API container, and verify health, login, Xiaoyi WebSocket, platform bridge, and new static text.
