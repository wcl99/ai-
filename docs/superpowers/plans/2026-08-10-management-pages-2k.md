# Management Pages and 2K Desktop Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the new login, system settings, team management, and authorization/audit designs while making the existing desktop application stable at 2K and larger resolutions.

**Architecture:** Keep the React SPA and FastAPI contracts unchanged. Add a focused management API client and focused management pages, reuse the current authenticated shell, and centralize large-desktop sizing in CSS custom properties and media queries instead of scaling the DOM.

**Tech Stack:** React 18, TypeScript, Ant Design, TanStack Query, React Hook Form, Zod, Vitest, Testing Library, CSS.

---

### Task 1: Management API client

**Files:**
- Modify: `apps/web/src/api/schemas.ts`
- Modify: `apps/web/src/api/resources.ts`
- Modify: `apps/web/src/api/resources.test.ts`

- [ ] Add failing tests for organization, runtime settings, users, user creation/update, and audit-log requests, including envelope parsing and query parameters.
- [ ] Run `npm --prefix apps/web run test -- src/api/resources.test.ts` and confirm the new cases fail because the functions are missing.
- [ ] Add strict Zod schemas and typed request functions using the existing `apiRequest` helper; do not add a second HTTP client.
- [ ] Run the focused test and confirm all resource client cases pass.

### Task 2: Management page behavior

**Files:**
- Create: `apps/web/src/pages/TeamPage.tsx`
- Create: `apps/web/src/pages/AuthorizationPage.tsx`
- Modify: `apps/web/src/pages/ManagementPages.tsx`
- Modify: `apps/web/src/pages/ManagementPages.test.tsx`

- [ ] Add failing tests that verify system settings render live organization/runtime data, team members render from the API, administrators can submit a new member, and audit logs render with filters.
- [ ] Run `npm --prefix apps/web run test -- src/pages/ManagementPages.test.tsx` and confirm the new page cases fail.
- [ ] Implement a shared management-page heading, real query/mutation flows, visible loading/error/retry states, and role-aware actions.
- [ ] Keep organization updates and user changes on the existing endpoints; unsupported license upload/download controls must not be presented as functional.
- [ ] Run the focused management tests and confirm they pass.

### Task 3: Routes and navigation

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/App.test.tsx`

- [ ] Add failing route assertions for `/settings`, `/settings/team`, and `/settings/authorization` and navigation labels under the platform-settings parent menu.
- [ ] Run `npm --prefix apps/web run test -- src/App.test.tsx` and confirm the new assertions fail.
- [ ] Register the two new pages, convert platform settings to an expandable navigation group, and preserve all existing selected/open menu behavior.
- [ ] Run the focused route tests and confirm they pass.

### Task 4: Login design

**Files:**
- Modify: `apps/web/src/pages/LoginPage.tsx`
- Modify: `apps/web/src/AuthRoutes.test.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] Add assertions for the branded login panel, username/password controls, submit behavior, server error visibility, and requested-route restoration.
- [ ] Confirm the focused auth tests fail only for the new structural expectations.
- [ ] Rebuild the login visual from semantic React controls and CSS based on the supplied slices; keep loading, errors, password visibility, and redirect behavior intact.
- [ ] Run `npm --prefix apps/web run test -- src/AuthRoutes.test.tsx` and confirm it passes.

### Task 5: Shared 2K and 4K desktop sizing

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/App.test.tsx`

- [ ] Add a structural regression assertion that the shell exposes the shared content frame class used by every authenticated route.
- [ ] Introduce desktop sizing variables for sidebar, header, page gutter, content maximum, card gap, and readable text width.
- [ ] Add a `min-width: 2400px` media query that increases the content maximum and spacing without using `zoom` or `transform: scale()`.
- [ ] Constrain list, overview, task-session, pentest, report, and management layouts so cards expand by grid columns and not by squeezed text or uncontrolled line length.
- [ ] Run the focused app and page tests.

### Task 6: Full verification and delivery

**Files:**
- Modify only files required by fixes discovered during verification.

- [ ] Run `npm --prefix apps/web run test` and require all Vitest suites to pass.
- [ ] Run `npm --prefix apps/web run lint` and require zero ESLint errors.
- [ ] Run `npm --prefix apps/web run build` and require a successful TypeScript/Vite production build.
- [ ] Inspect `git diff --check` and `git status --short` to ensure runtime data, extracted macOS metadata, report files, and output directories are not staged.
- [ ] Commit the implementation with a Conventional Commit and push `codex/project-handoff`.

