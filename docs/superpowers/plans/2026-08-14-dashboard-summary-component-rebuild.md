# Dashboard Summary Component Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dashboard AI summary card from the supplied component library so live data never overlaps static artwork.

**Architecture:** Keep the existing dashboard query and summary data contract. Replace the screenshot-backed `MaterialPanel` usage with one presentational React component whose heading, status rows, and watermark are real DOM elements backed by independently extracted SVG assets from `素材/AI安服平台/平台总览/组件.svg`.

**Tech Stack:** React 18, TypeScript, Vitest, CSS, source SVG assets.

---

### Task 1: Lock the component contract

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.test.tsx`
- Test: `apps/web/src/pages/DashboardPage.test.tsx`

- [ ] Add a server-render test for the complete summary card.
- [ ] Assert the markup does not contain `ai-summary.png`, `summary-content-surface`, or character-based status symbols.
- [ ] Assert the title, three component icons, watermark asset, and live summary values render once.
- [ ] Run `vitest run src/pages/DashboardPage.test.tsx` and confirm the new test fails against the screenshot-backed implementation.

### Task 2: Extract exact component assets

**Files:**
- Create: `apps/web/public/material/overview/components/summary-title.svg`
- Create: `apps/web/public/material/overview/components/summary-danger.svg`
- Create: `apps/web/public/material/overview/components/summary-warning.svg`
- Create: `apps/web/public/material/overview/components/summary-safe.svg`
- Create: `apps/web/public/material/overview/components/summary-watermark.svg`

- [ ] Copy only the matching vector nodes from `素材/AI安服平台/平台总览/组件.svg`.
- [ ] Preserve source fills, opacity, and view boxes without copying any static text or card background.

### Task 3: Rebuild the card

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Render the summary directly as `DashboardAiSummary` instead of a screenshot-backed `MaterialPanel`.
- [ ] Keep loading and unavailable states inside the rebuilt card.
- [ ] Replace character symbols with the extracted component icons.
- [ ] Remove the summary-only mask and screenshot positioning rules.
- [ ] Match the supplied 522:340 geometry, spacing, typography, and 42.5% watermark width.
- [ ] Run the focused test and confirm it passes.

### Task 4: Verify and deploy

**Files:**
- Verify: `apps/web/src/pages/DashboardPage.test.tsx`
- Verify: `apps/web/src/pages/DashboardPage.tsx`
- Verify: `apps/web/src/styles.css`

- [ ] Run the focused Vitest file.
- [ ] Run `tsc --noEmit`.
- [ ] Run the Vite production build.
- [ ] Render `/overview` at the reported desktop viewport and inspect the summary card for overlap.
- [ ] Commit and push the focused change.
- [ ] Deploy the new image to `newuser@101.43.119.26:52222` and confirm `/health/ready` returns ready.
