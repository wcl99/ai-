# Overview Scroll Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/overview` scroll vertically so its Figma-sized cards and risk chart are no longer compressed into one viewport.

**Architecture:** Keep the existing React component hierarchy and data flow. Establish one final, route-scoped CSS contract that overrides legacy viewport-fit rules, then verify the fixed `471 x 226` chart geometry through component and browser tests.

**Tech Stack:** React 18, TypeScript, CSS Grid, SVG, Vitest, Playwright

---

### Task 1: Lock the new layout contract with tests

**Files:**
- Modify: `apps/web/src/materialResponsive.test.ts`
- Modify: `apps/web/src/pages/DashboardPage.test.tsx`

- [ ] Replace the one-viewport assertion with assertions for `overflow-y:auto`, natural dashboard height, and fixed desktop row heights.
- [ ] Assert that the risk chart renders `viewBox="0 0 471 226"` and all five fixed Y-axis labels.
- [ ] Run the focused Vitest files and confirm the CSS contract fails before implementation.

### Task 2: Apply the scroll layout and fixed chart sizing

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] Add a final desktop rule scoped to `.app-content:has(.dashboard-page.material-dashboard)`.
- [ ] Reset the content frame and dashboard from viewport-bound height to natural height.
- [ ] Restore desktop row heights to `122px 90px 340px 340px` and allow vertical overflow.
- [ ] Give the trend content a stable `471 / 226` aspect ratio and make the SVG fill it without overflow.
- [ ] Add narrower desktop grid reflow rules without changing card heights.

### Task 3: Verify behavior

**Files:**
- Test: `apps/web/src/materialResponsive.test.ts`
- Test: `apps/web/src/pages/DashboardPage.test.tsx`

- [ ] Run the focused Vitest tests and confirm they pass.
- [ ] Run TypeScript and Vite build verification.
- [ ] Inspect `/overview` at `1569 x 912`; confirm vertical scrolling, card heights, and chart bounds.
- [ ] Confirm `/pentest` selectors and files were not changed by this task.
