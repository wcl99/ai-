# Phase 2 Web Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake frontend login flow with a typed same-origin API client and recoverable HttpOnly-cookie authentication state.

**Architecture:** A single native-fetch client validates API responses with Zod. AuthProvider owns `/auth/me`, login, and logout through TanStack Query; ProtectedRoute gates the existing shell without changing page design or touching settings UI.

**Tech Stack:** React 18, TypeScript strict, TanStack Query, Zod, React Hook Form, Ant Design, Vitest, Testing Library.

---

### Task 1: Build the typed API boundary

**Files:**
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/api/schemas.ts`
- Test: `apps/web/src/api/client.test.ts`

- [ ] Write failing tests for JSON success, platform error conversion, invalid response rejection, and `credentials: include`.
- [ ] Run `npm --prefix apps/web run test -- src/api/client.test.ts` and confirm RED.
- [ ] Implement `ApiError` and `apiRequest` with native fetch and Zod; do not add Axios or another dependency.
- [ ] Add `userSchema`, `loginResponseSchema`, and `emptyEnvelopeSchema`.
- [ ] Rerun the focused test and confirm GREEN.

### Task 2: Add the authentication provider

**Files:**
- Create: `apps/web/src/auth/AuthProvider.tsx`
- Test: `apps/web/src/auth/AuthProvider.test.tsx`
- Modify: `apps/web/src/main.tsx`

- [ ] Write failing provider tests for restoring `/auth/me`, accepting login, rejecting 401 as signed-out, and clearing state on logout.
- [ ] Confirm RED with the focused Vitest command.
- [ ] Implement `getCurrentUser`, `login`, and `logout` on top of `apiRequest`.
- [ ] Implement AuthProvider with TanStack Query and mutation state; expose `user`, `isLoading`, `login`, `logout`, and `error` through `useAuth`.
- [ ] Mount AuthProvider under QueryClientProvider in `main.tsx` and confirm GREEN.

### Task 3: Protect routes and connect the login page

**Files:**
- Create: `apps/web/src/auth/ProtectedRoute.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/pages/LoginPage.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/test/setup.ts`

- [ ] Write failing tests: unauthenticated business route redirects to login, authenticated route renders, invalid credentials display the API message.
- [ ] Confirm RED.
- [ ] Gate the existing AppShell with ProtectedRoute and preserve the requested destination in router state.
- [ ] Submit username/password to the real login mutation; remove the fake fixed captcha from the request flow.
- [ ] Show loading and API error states without logging credentials.
- [ ] Confirm GREEN.

### Task 4: Show the real user and logout action

**Files:**
- Modify: `apps/web/src/components/AppShell.tsx`
- Test: `apps/web/src/App.test.tsx`

- [ ] Write a failing test that the authenticated user's name/role appear and logout calls the API then redirects.
- [ ] Confirm RED.
- [ ] Reuse the existing profile layout and avatar; add an Ant Design dropdown logout action without new assets.
- [ ] Confirm GREEN.

### Task 5: Verify and commit Phase 2

**Files:**
- Verify all Phase 2 files

- [ ] Run:

```powershell
npm --prefix apps/web run build
npm --prefix apps/web run lint
npm --prefix apps/web run test
python -m ruff check apps/api
python -m pytest apps/api/tests
```

- [ ] Run `git diff --check`, inspect `git status --short` and `git diff --stat`.
- [ ] Request independent code review and resolve Critical/Important findings.
- [ ] Commit only Phase 2 as `feat(web): add authenticated API session`.
