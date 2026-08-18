# Dashboard Proportional Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the overview dashboard from compressing vertically by proportionally scaling its desktop canvas when it remains readable.

**Architecture:** A pure scale helper converts available dashboard space into a scale between 0.78 and 1. The page renders the fixed material canvas inside a measured frame only when that helper returns a scale; narrower viewports retain the existing responsive grid.

**Tech Stack:** React 18, TypeScript, CSS custom properties, Vitest.

---

### Task 1: Define and verify the scale boundary

**Files:**
- Create: `apps/web/src/pages/dashboardScale.ts`
- Modify: `apps/web/src/pages/DashboardPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { dashboardScaleForViewport } from './dashboardScale';

expect(dashboardScaleForViewport({ width: 1569, height: 912 })).toBeCloseTo(0.856, 3);
expect(dashboardScaleForViewport({ width: 1024, height: 912 })).toBeNull();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir apps/web test -- src/pages/DashboardPage.test.tsx`
Expected: FAIL because `dashboardScaleForViewport` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export function dashboardScaleForViewport(viewport: { width: number; height: number }): number | null {
  const availableWidth = viewport.width - 220 - 36;
  const availableHeight = viewport.height - 66 - 24;
  const scale = Math.min(1, availableWidth / 1280, availableHeight / 960);
  return scale >= 0.78 ? scale : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir apps/web test -- src/pages/DashboardPage.test.tsx`
Expected: PASS.

### Task 2: Apply the scale only to desktop overview canvas

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Add responsive scale state**

Use a resize listener to obtain `dashboardScaleForViewport(window.innerWidth, window.innerHeight)`. Render the existing dashboard inside `.dashboard-scale-frame` and `.dashboard-scale-canvas` only for non-null scale values.

- [ ] **Step 2: Add the scale frame styles**

Use the inline dimensions of `.dashboard-scale-frame` for layout space and `transform: scale(...)` only on `.dashboard-scale-canvas`. Restore the design grid dimensions inside the scaled canvas; preserve existing responsive CSS for the fallback path.

- [ ] **Step 3: Verify compile and interaction contracts**

Run: `pnpm --dir apps/web test -- src/pages/DashboardPage.test.tsx` and `pnpm --dir apps/web build`.
