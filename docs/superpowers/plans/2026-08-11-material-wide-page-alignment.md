# Material-wide Page Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有非渗透测试页面对齐 `素材/AI安服平台` 的页面和组件设计，并完成自动化、视觉与线上验证。

**Architecture:** 保留 React、Ant Design、TanStack Query 和现有 API 边界；页面结构在现有组件内直接调整，共享视觉规则集中在 `styles.css`。渗透测试路由通过既有类名和页面选择器保持隔离，不改其组件。

**Tech Stack:** React 18, TypeScript, Ant Design, TanStack Query, Vitest, Testing Library, Playwright, CSS/SVG

---

### Task 1: Lock the material contract in tests

**Files:**
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/pages/ListPages.test.tsx`
- Modify: `apps/web/src/pages/ManagementPages.test.tsx`
- Create: `apps/web/src/pages/MaterialPages.test.tsx`

- [ ] Add assertions for material page headings, metric groups, filter controls, vulnerability drawer sections, settings tabs and login fields.
- [ ] Run `pnpm --dir apps/web test` and confirm the new assertions fail because the material structure is missing.

### Task 2: Align shell, login and dashboard

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/pages/LoginPage.tsx`
- Modify: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Match the material navigation hierarchy, fixed desktop dimensions and page title/search header without changing pentest routing.
- [ ] Rebuild login and dashboard composition using existing authentication and resource queries.
- [ ] Run `pnpm --dir apps/web test -- MaterialPages App` and confirm passing results.

### Task 3: Align task, asset and vulnerability pages

**Files:**
- Modify: `apps/web/src/pages/ListPages.tsx`
- Modify: `apps/web/src/pages/ManagementPages.tsx`
- Modify: `apps/web/src/pages/OverviewPages.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Add material-aligned metric rows, filters, toolbars and table density without inventing unsupported API fields.
- [ ] Expand the vulnerability drawer to the material information hierarchy using existing record fields and truthful empty values.
- [ ] Run `pnpm --dir apps/web test -- ListPages ManagementPages MaterialPages` and confirm passing results.

### Task 4: Align reports and management pages

**Files:**
- Modify: `apps/web/src/pages/ListPages.tsx`
- Modify: `apps/web/src/pages/OverviewPages.tsx`
- Modify: `apps/web/src/pages/SystemSettingsPage.tsx`
- Modify: `apps/web/src/pages/TeamPage.tsx`
- Modify: `apps/web/src/pages/AuthorizationPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Match report overview/list, settings, team and authorization page composition to their named SVG references.
- [ ] Keep report analytics connected to the existing endpoint and keep authorization actions visual-only.
- [ ] Run the related Vitest suites and confirm passing results.

### Task 5: Regression and deployment

**Files:**
- Modify: `apps/web/e2e/responsive-layout.spec.ts`
- Create: `apps/web/e2e/material-pages.spec.ts`

- [ ] Add 1920×1080 and 2560×1440 checks for missing assets, page overflow and protected pentest layout.
- [ ] Run `pnpm --dir apps/web test`, `pnpm --dir apps/web lint`, `pnpm --dir apps/web build`, and targeted Playwright checks.
- [ ] Review `git diff` to confirm no pentest production files changed.
- [ ] Commit, push, deploy the resulting revision, then verify server health, login and representative page/API routes.
