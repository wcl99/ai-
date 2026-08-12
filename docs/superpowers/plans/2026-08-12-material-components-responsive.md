# Material Components Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将非渗透功能页严格映射到最新组件素材，并修复 1366 至 4K 桌面分辨率适配。

**Architecture:** 保留现有 React/Ant Design 页面和 API 数据流，在已有共享组件与样式层做最小修改。整页 SVG 决定布局，组件 SVG 决定控件外观；CSS Grid 与流式尺寸承担响应式，不引入缩放脚本。

**Tech Stack:** React 18、TypeScript、Ant Design、CSS、Vitest、Playwright

---

### Task 1: 固化组件语义和响应式边界

**Files:**
- Modify: `apps/web/src/pages/ManagementPages.test.tsx`
- Modify: `apps/web/src/pages/ListPages.test.tsx`
- Create: `apps/web/src/materialResponsive.test.ts`

- [ ] 写组件结构与禁止固定 1920px 画布的失败测试。
- [ ] 单独运行这些测试，确认因现有结构或固定宽度失败。
- [ ] 保留失败输出作为修复依据。

### Task 2: 对齐共享组件与页面结构

**Files:**
- Modify: `apps/web/src/components/Ui.tsx`
- Modify: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/pages/OverviewPages.tsx`
- Modify: `apps/web/src/pages/ListPages.tsx`
- Modify: `apps/web/src/pages/LoginPage.tsx`
- Modify: `apps/web/src/pages/SystemSettingsPage.tsx`
- Modify: `apps/web/src/pages/TeamPage.tsx`
- Modify: `apps/web/src/pages/AuthorizationPage.tsx`

- [ ] 复用现有接口数据，按组件素材补齐缺失的控件组合和语义类名。
- [ ] 不修改 `PentestPage.tsx`、任务执行页或小易数据流。
- [ ] 运行目标 Vitest，确认组件测试通过。

### Task 3: 建立统一的桌面流式布局

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] 删除登录页 1920px 固定最小宽度与离散的大屏放大规则。
- [ ] 用 `clamp()`、`minmax()`、自动换行和局部表格滚动实现 1366 至 4K 布局。
- [ ] 运行响应式规则测试，确认通过。

### Task 4: 全量验证和发布

**Files:**
- Modify: `.run/visual-audit.mjs`（仅本地审计，不提交）

- [ ] 运行 `npm run test`、`npm run lint`、`npm run build`。
- [ ] 在五个目标视口审计登录、总览、任务、漏洞、报告和管理页，确认无根节点横向溢出或组件遮挡。
- [ ] 提交项目文件，推送当前分支并更新服务器。
- [ ] 对上线页面执行桌面视口抽检。

