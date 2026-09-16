# Target-aware Precheck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route URL, IP, and domain targets through the documented precheck path without sending invalid URL values to Xiaoyi.

**Architecture:** Keep target classification in the existing penetration-test page. Domain and IP assets continue to use the current platform WebSocket proxy, while HTTP URLs use the existing plan-assets endpoint so the platform performs CDN/WAF assessment without opening a Xiaoyi precheck socket.

**Tech Stack:** React 18, TypeScript, Ant Design, TanStack Query, Vitest, Testing Library

---

### Task 1: Add the HTTP URL regression test

**Files:**
- Modify: `apps/web/src/pages/PentestPage.test.tsx`
- Test: `apps/web/src/pages/PentestPage.test.tsx`

- [ ] **Step 1: Write a failing test for an HTTP URL**

Add a test that submits `http://139.198.31.136:81/#/login`, returns a draft and consultation response from `fetch`, and stubs `WebSocket` with a constructor that records unexpected connections. Click the new asset-check action and assert that the third request is:

```ts
expect(fetchMock).toHaveBeenNthCalledWith(
  3,
  `/api/v1/scan-plans/${planId}/assets`,
  expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({
      asset_list: [{
        host: 'http://139.198.31.136:81/#/login',
        hostType: 'http',
      }],
    }),
  }),
);
expect(webSocketConnections).toBe(0);
expect(await screen.findByText('预查已完成')).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node node_modules/vitest/vitest.mjs run src/pages/PentestPage.test.tsx
```

Expected: FAIL because the page still renders the domain-precheck action and attempts to open a WebSocket for the URL.

### Task 2: Implement type-aware precheck routing

**Files:**
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Test: `apps/web/src/pages/PentestPage.test.tsx`

- [ ] **Step 1: Add one target classifier**

Add the following local type and helper beside `inferHostType`:

```ts
type AssetTargetType = PrecheckHost['hostType'] | 'http';

function inferTargetType(target: string): AssetTargetType {
  const value = target.trim();
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return 'http';
  } catch {
    // Plain hosts are classified below.
  }
  return inferHostType(value);
}
```

- [ ] **Step 2: Add the direct HTTP asset check**

Derive `targetType` from the current plan. Add an `asset_loading` precheck state and a handler that preserves the full URL:

```ts
const runDirectAssetCheck = async () => {
  if (!plan) return;
  setPrecheck('asset_loading');
  setPrecheckError(null);
  try {
    setPlan(await updateScanPlanAssets(plan.id, plan.targets.map((host) => ({
      host,
      hostType: 'http',
    }))));
    setPrecheck('ready');
  } catch (error) {
    setPrecheck('idle');
    setPrecheckError(error instanceof Error ? error.message : '资产检测失败');
  }
};
```

- [ ] **Step 3: Make actions and steps type-aware**

Render these paths without introducing another component or dependency:

```ts
// domain: 创建草稿 -> 域名预查 -> 端口预查 -> 授权执行
// ip:     创建草稿 -> 端口预查 -> 授权执行
// http:   创建草稿 -> CDN/WAF 检测 -> 授权执行
```

At `idle`, render `开始域名预查` only for `domain`, `开始端口预查` only for `ip`, and `开始资产检测` only for `http`. Show the real target type in the asset tag. If an IP port precheck fails, return to `idle`; if a domain port precheck fails, return to `domain_ready`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
node node_modules/vitest/vitest.mjs run src/pages/PentestPage.test.tsx
```

Expected: both the existing domain flow and new HTTP flow PASS.

- [ ] **Step 5: Commit the behavior change**

```powershell
git add apps/web/src/pages/PentestPage.tsx apps/web/src/pages/PentestPage.test.tsx
git commit -m "fix(web): route prechecks by target type"
```

### Task 3: Translate a WebSocket response timeout

**Files:**
- Modify: `apps/web/src/api/pentest.test.ts`
- Modify: `apps/web/src/api/pentest.ts`

- [ ] **Step 1: Write the timeout test**

Use fake timers and a WebSocket stub that opens but never responds:

```ts
const request = runPrecheck({
  action: 'can_port',
  hosts: [{ host: '139.198.31.136', hostType: 'ip' }],
});
await vi.advanceTimersByTimeAsync(30_000);
await expect(request).rejects.toThrow('小易预查响应超时，请稍后重试');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node node_modules/vitest/vitest.mjs run src/api/pentest.test.ts
```

Expected: FAIL because the current error is `Precheck request timed out`.

- [ ] **Step 3: Make the minimal message change**

Replace only the timeout error text:

```ts
() => finish(() => reject(new Error('小易预查响应超时，请稍后重试')))
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Task 3 focused command again. Expected: PASS.

- [ ] **Step 5: Commit the timeout change**

```powershell
git add apps/web/src/api/pentest.ts apps/web/src/api/pentest.test.ts
git commit -m "fix(web): explain Xiaoyi precheck timeout"
```

### Task 4: Verify, publish, and deploy

**Files:**
- Verify: `apps/web/src/**`
- Preserve: `apps/api/data/`

- [ ] **Step 1: Run all frontend verification**

Run the full Vitest suite, ESLint, `tsc --noEmit`, and Vite production build. Expected: every command exits 0.

- [ ] **Step 2: Push the branch**

Push `codex/project-handoff` to `origin` without adding the untracked runtime directory `apps/api/data/`.

- [ ] **Step 3: Deploy the changed frontend files**

Upload the changed frontend source files to `/opt/ai-security-platform`, rebuild the existing `api` image (which embeds the web build), and recreate only the API container.

- [ ] **Step 4: Verify production**

Confirm `/health` returns `{"status":"ok"}`, the API container is healthy, and the public HTML references the newly generated JavaScript asset. Inspect that deployed script for the HTTP target branch and Chinese timeout message.

### Task 5: Preserve HTTP assets through the backend CDN check

**Files:**
- Modify: `apps/api/app/services.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_api.py`

- [ ] **Step 1: Reproduce the deployed 422 response**

Patch a draft plan with `{"host": "http://139.198.31.136:81/#/login", "hostType": "http"}` and assert the request succeeds, the CDN checker receives only `139.198.31.136`, and the saved asset retains the full URL and `http` type.

- [ ] **Step 2: Accept the existing Xiaoyi HTTP asset type**

Allow `http` in `normalize_asset_list` without widening WebSocket `HostType`, which remains limited to `domain` and `ip`.

- [ ] **Step 3: Separate CDN lookup identity from scan identity**

Use `urlsplit` to extract the hostname for CDN lookup, then merge the trusted CDN result while restoring the original `host` and `hostType` fields.

- [ ] **Step 4: Verify the focused and full backend suites**

Run the HTTP regression test, then all API tests. Expected: every test passes.
