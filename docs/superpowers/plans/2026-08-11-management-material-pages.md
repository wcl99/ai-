# Management Material Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild system settings, team management, and authorization management from the latest SVG materials while retaining supported real operations and leaving authorization actions disabled.

**Architecture:** Keep the existing routes, React pages, Ant Design controls, TanStack Query resources, and global stylesheet. System settings own a small versioned local-storage model for settings without a backend contract; team management continues to use the current user API; authorization management is a visual-only page with explicitly disabled actions.

**Tech Stack:** React 18, TypeScript, Ant Design 5, TanStack Query, Vitest, Testing Library, CSS.

---

### Task 1: Specify the new management-page behavior

**Files:**
- Modify: `apps/web/src/pages/ManagementPages.test.tsx`

- [ ] **Step 1: Replace the settings test with failing material-page tests**

Add assertions that the default page shows `认证与安全`, that clicking `AI 模型` reveals `模型平台`, and that saving then remounting restores a changed model name from local storage.

- [ ] **Step 2: Replace the authorization API test with a failing visual-only test**

Assert that the page contains `系统指纹`, `授权状态`, and `上传授权文件`, that the upload/refresh buttons are disabled, and that no audit-log request is sent.

- [ ] **Step 3: Extend the team test with the material layout**

Keep the existing list/create API assertions and add assertions for `组织架构`, `成员列表`, `批量导入`, and disabled batch import behavior.

- [ ] **Step 4: Run the focused test and verify RED**

Run: `npm test -- src/pages/ManagementPages.test.tsx`

Expected: FAIL because the new tabs, material labels, and disabled authorization surface do not exist.

- [ ] **Step 5: Commit the failing tests**

```bash
git add apps/web/src/pages/ManagementPages.test.tsx
git commit -m "test(management): specify material-driven pages"
```

### Task 2: Implement the five-tab system settings page

**Files:**
- Modify: `apps/web/src/pages/SystemSettingsPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Define the minimal local settings model**

Inside `SystemSettingsPage.tsx`, add a `LocalSettings` type, one `DEFAULT_LOCAL_SETTINGS` object, one versioned storage key, and guarded load/save helpers. The model contains only fields visible in the five SVG tabs; malformed storage falls back to defaults.

- [ ] **Step 2: Build the tabbed material structure**

Render the page title/action row, five Ant Design tabs, the matching cards/forms/tables/toggles, and a fixed card-level action strip. Keep `getOrganization`, `getRuntimeSettings`, and `updateOrganization` where their values naturally fit. Store unsupported settings locally and label them `本地配置`.

- [ ] **Step 3: Add settings-specific CSS**

Add scoped `.material-settings-*` rules for the 1920 reference layout, 2K spacing, cards, form grids, JSON preview, module rows, and bottom action bar. Do not use page-level zoom or transforms.

- [ ] **Step 4: Run the focused tests and verify GREEN for settings**

Run: `npm test -- src/pages/ManagementPages.test.tsx -t "system settings"`

Expected: PASS.

- [ ] **Step 5: Commit system settings**

```bash
git add apps/web/src/pages/SystemSettingsPage.tsx apps/web/src/styles.css
git commit -m "feat(settings): restore material configuration tabs"
```

### Task 3: Rebuild team management without changing its API contract

**Files:**
- Modify: `apps/web/src/pages/TeamPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Build the organization and member split layout**

Add a left organization panel with search and stable display groups. Add the right summary cards, filters, table header, and pagination while keeping the current `listUsers`, `createUser`, and `updateUser` calls.

- [ ] **Step 2: Preserve supported member operations**

Retain the add-member modal and active switch. Add client-side keyword/status filtering over the loaded page. Render batch import as disabled with a visible `暂未开放` explanation.

- [ ] **Step 3: Add team-specific CSS**

Add scoped `.material-team-*` rules matching the SVG proportions, with a fixed organization column and a flexible table region that remains readable at 1920, 2560, and 3840 widths.

- [ ] **Step 4: Run the focused tests and verify GREEN for team**

Run: `npm test -- src/pages/ManagementPages.test.tsx -t "team"`

Expected: PASS, including the existing create-user request-body assertion.

- [ ] **Step 5: Commit team management**

```bash
git add apps/web/src/pages/TeamPage.tsx apps/web/src/styles.css
git commit -m "feat(team): restore material member management"
```

### Task 4: Replace authorization audit UI with the visual-only license page

**Files:**
- Modify: `apps/web/src/pages/AuthorizationPage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Remove unsupported authorization data behavior**

Remove organization/runtime/audit queries and their table because the new authorization material represents a license surface, not audit activity. Do not add replacement API calls.

- [ ] **Step 2: Build the disabled material surface**

Render the system fingerprint card, license-status card, and upload dropzone. Use deterministic placeholder labels and disabled buttons with `授权管理功能暂未开放` help text.

- [ ] **Step 3: Add authorization-specific CSS**

Add scoped `.material-authorization-*` rules for the two summary cards, fingerprint rows, license badge, and upload area.

- [ ] **Step 4: Run the focused tests and verify GREEN for authorization**

Run: `npm test -- src/pages/ManagementPages.test.tsx -t "authorization"`

Expected: PASS and no `/audit-logs` fetch.

- [ ] **Step 5: Commit authorization management**

```bash
git add apps/web/src/pages/AuthorizationPage.tsx apps/web/src/styles.css
git commit -m "feat(authorization): add material license placeholder"
```

### Task 5: Verify the integrated frontend

**Files:**
- Verify: `apps/web/src/pages/ManagementPages.test.tsx`
- Verify: `apps/web/src/pages/SystemSettingsPage.tsx`
- Verify: `apps/web/src/pages/TeamPage.tsx`
- Verify: `apps/web/src/pages/AuthorizationPage.tsx`
- Verify: `apps/web/src/styles.css`

- [ ] **Step 1: Run the complete management-page test file**

Run: `npm test -- src/pages/ManagementPages.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite build complete without errors.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only intended source/test/plan changes plus the user's pre-existing untracked assets and data.

- [ ] **Step 4: Commit any final integration-only correction**

```bash
git add apps/web/src/pages/ManagementPages.test.tsx apps/web/src/pages/SystemSettingsPage.tsx apps/web/src/pages/TeamPage.tsx apps/web/src/pages/AuthorizationPage.tsx apps/web/src/styles.css
git commit -m "fix(management): finalize desktop material layout"
```
