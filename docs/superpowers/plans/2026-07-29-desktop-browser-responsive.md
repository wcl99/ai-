# Desktop Browser Responsive Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing desktop navigation, primary pentest workspace, and expert consultation panel usable without page-level horizontal overflow at 1280–1920px and browser zoom equivalents.

**Architecture:** Use CSS media queries as the sole layout mechanism. Preserve the existing React component tree and API behavior; add only a responsive modal width value in `PentestPage.tsx`. Prove the behavior with Playwright viewport assertions before changing production styles.

**Tech Stack:** React 18, TypeScript, Ant Design 5, CSS media queries, Playwright, Vitest, Vite

---

### Task 1: Lock the desktop viewport contract

**Files:**
- Create: `apps/web/e2e/responsive-layout.spec.ts`

- [ ] **Step 1: Write the failing responsive layout test**

Create a Playwright test that mocks only the authenticated user endpoint and measures the actual rendered layout:

```ts
import { expect, test } from '@playwright/test';

const user = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  org_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  username: 'admin',
  name: 'Administrator',
  role: 'admin',
  is_active: true,
  is_digital_human: false,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(user),
  }));
});

test('keeps the pentest workspace and consultation panel visible at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/pentest');

  const layout = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      siderWidth: box('.app-sider')?.width,
      consultationWidth: box('.expert-consultation')?.width,
      visualDisplay: getComputedStyle(document.querySelector('.hero-visual')!).display,
    };
  });

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.siderWidth).toBeLessThanOrEqual(224);
  expect(layout.consultationWidth).toBeGreaterThanOrEqual(280);
  expect(layout.consultationWidth).toBeLessThanOrEqual(300);
  expect(layout.visualDisplay).toBe('none');
  await expect(page.locator('.target-form')).toBeVisible();
  await expect(page.locator('.expert-consultation')).toBeVisible();
});

test('preserves the spacious desktop layout at 1920px', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/pentest');

  await expect(page.locator('.hero-visual')).toBeVisible();
  await expect(page.locator('.expert-consultation')).toHaveCSS('width', '352px');
  await expect(page.locator('.app-sider')).toHaveCSS('width', '260px');
});
```

- [ ] **Step 2: Run the new test and confirm the expected failure**

Run: `npm run test:e2e -- responsive-layout.spec.ts`

Expected: the 1280px case fails because the sidebar remains 260px, the consultation panel remains 352px, and the decorative hero remains visible.

- [ ] **Step 3: Commit the failing test**

```bash
git add apps/web/e2e/responsive-layout.spec.ts
git commit -m "test(web): define desktop responsive layout"
```

### Task 2: Implement responsive desktop compression

**Files:**
- Modify: `apps/web/src/styles.css:12-58,129-140,156-158`
- Modify: `apps/web/src/pages/PentestPage.tsx:341-350`

- [ ] **Step 1: Remove the global overflow source**

Replace the global minimum width with a safe fluid root:

```css
html, body, #root { min-width: 0; min-height: 100%; margin: 0; }
```

- [ ] **Step 2: Make long content shrink inside existing grid columns**

Add the following rules near the pentest layout styles:

```css
.pentest-welcome,
.hero-copy,
.target-form,
.analysis-result,
.candidate-card { min-width: 0; }
.asset-tags,
.candidate-card p,
.consultation-message p { overflow-wrap: anywhere; }
.modal-actions { flex-wrap: wrap; }
```

- [ ] **Step 3: Make the authorization modal viewport-safe**

Change the modal width prop without changing its behavior:

```tsx
<Modal
  open={analysisOpen}
  title="授权扫描方案确认"
  width="min(720px, calc(100vw - 32px))"
```

- [ ] **Step 4: Add the 1600px compression band**

Add a medium-desktop breakpoint before the existing 1440px rules:

```css
@media (max-width: 1600px) {
  .pentest-consultation-layout { grid-template-columns: minmax(0, 1fr) 320px; }
  .hero-copy { width: 74%; }
  .consultation-message > div { max-width: 232px; }
  .app-header { gap: 20px; padding-inline: 18px; }
  .global-search { width: 260px; }
}
```

- [ ] **Step 5: Add the narrow-desktop/high-zoom compression band**

Add a new desktop breakpoint:

```css
@media (max-width: 1439px) {
  .app-sider {
    width: 220px !important;
    min-width: 220px !important;
    max-width: 220px !important;
    flex-basis: 220px !important;
  }
  .app-sider + .ant-layout { margin-left: 220px; }
  .brand { padding-inline: 16px; }
  .brand h4 { font-size: 18px !important; }
  .app-header { gap: 14px; padding-inline: 14px; }
  .app-header h2 { min-width: 136px; font-size: 23px !important; }
  .global-search { width: 210px; }
  .header-actions { gap: 12px !important; }
  .profile { gap: 8px; padding-left: 12px; }
  .pentest-consultation-layout { grid-template-columns: minmax(0, 1fr) 290px; }
  .pentest-welcome { padding-inline: 5%; }
  .hero-copy { width: 100%; margin-block: 24px; }
  .hero-copy h1 { font-size: 30px; }
  .hero-copy > p { margin-bottom: 28px; }
  .hero-visual { display: none; }
  .target-form { border-radius: 22px; padding-inline: 20px; }
  .expert-consultation > header { padding-inline: 16px; }
  .consultation-message > div { max-width: 202px; }
  .metric-grid-five,
  .metric-grid-six { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dashboard-main-grid,
  .dashboard-bottom-grid,
  .overview-grid-three,
  .report-chart-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .recent-report-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .login-card { width: min(480px, calc(100vw - 48px)); }
}
```

- [ ] **Step 6: Preserve the existing sub-desktop fallback**

Keep the existing `@media (max-width: 1050px)` stacking rule unchanged. It remains a defensive fallback outside the requested 1280–1920px desktop scope and does not affect the approved desktop behavior.

- [ ] **Step 7: Run the responsive test and confirm it passes**

Run: `npm run test:e2e -- responsive-layout.spec.ts`

Expected: 2 tests pass.

- [ ] **Step 8: Commit the implementation**

```bash
git add apps/web/src/styles.css apps/web/src/pages/PentestPage.tsx
git commit -m "fix(web): adapt desktop layouts to browser width"
```

### Task 3: Regression verification and deployment readiness

**Files:**
- Modify only if verification exposes a regression in the files listed in Task 2.

- [ ] **Step 1: Run all frontend unit tests**

Run: `npm run test`

Expected: all Vitest tests pass with no warnings introduced by this change.

- [ ] **Step 2: Run the complete browser golden path**

Run: `npm run test:e2e`

Expected: the existing authorized golden path and both responsive layout cases pass.

- [ ] **Step 3: Run static checks and production build**

Run: `npm run lint && npm run build`

Expected: ESLint exits 0; TypeScript and Vite build exit 0.

- [ ] **Step 4: Inspect generated layouts**

Use Playwright screenshots at 1280x800, 1440x900, and 1920x1080. Confirm the sidebar, target form, and expert panel do not overlap; confirm there is no page-level horizontal scrollbar.

- [ ] **Step 5: Push and deploy the verified frontend**

Push `codex/project-handoff`, rebuild the existing web image on `101.43.119.26`, and recreate only the existing web service. Do not change proxy topology or deploy new services.

- [ ] **Step 6: Verify the deployed page**

Check the live page and container health, then repeat the 1280px layout measurement against the deployed frontend.
