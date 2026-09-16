# Native Browser Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve one desktop layout while the browser scales the entire application, using a 1920px minimum canvas and horizontal scrolling below that width.

**Architecture:** Keep the existing React tree unchanged. Express the behavior entirely in the global stylesheet by restoring a desktop minimum width and removing viewport-driven layout rewrites. Update Playwright assertions first so the current responsive implementation fails before production CSS changes.

**Tech Stack:** React 18, TypeScript, Ant Design 5, CSS, Playwright, Vitest, Vite

---

### Task 1: Define the fixed desktop canvas contract

**Files:**
- Modify: `apps/web/e2e/responsive-layout.spec.ts`

- [ ] Change the 1280px assertions to require a document width of at least 1920px, a 260px sidebar, 352px consultation panel, and visible hero visual.
- [ ] Add a 1024px test that requires `document.documentElement.scrollWidth >= 1920`, `scrollWidth > innerWidth`, and the same fixed component widths.
- [ ] Add an overview test that requires feature cards to remain at least 350px wide with at least 100px available for copy.
- [ ] Run `npm run test:e2e -- responsive-layout.spec.ts` and confirm failure because the current 1439px breakpoint compresses the layout.
- [ ] Commit with `test(web): define native browser zoom layout`.

### Task 2: Restore fixed desktop layout behavior

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] Set `html, body, #root { min-width: 1920px; min-height: 100%; margin: 0; }`.
- [ ] Delete the 1600px, 1440px, 1439px, and 1050px media-query blocks.
- [ ] Keep existing `min-width: 0`, `overflow-wrap: anywhere`, and modal action wrapping rules for content safety.
- [ ] Give overview feature cards a minimum 380px track and a three-column internal grid with a minimum 140px copy area; keep feature titles and descriptions on one line.
- [ ] Run the focused Playwright file and confirm all fixed-layout cases pass.
- [ ] Commit with `fix(web): preserve layout during browser zoom`.

### Task 3: Verify and publish

**Files:**
- No production files beyond Task 2.

- [ ] Run all 46 Vitest tests.
- [ ] Run the complete Playwright suite.
- [ ] Run ESLint, TypeScript checking, and the Vite production build.
- [ ] Capture and inspect 1024px, 1280px, and 1920px screenshots.
- [ ] Push `codex/project-handoff` and verify the local Vite page and API tunnel remain available.
