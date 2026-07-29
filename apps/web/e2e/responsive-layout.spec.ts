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
  await expect(page.locator('.target-form')).toBeVisible();

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
  await expect(page.locator('.expert-consultation')).toBeVisible();
});

test('preserves the spacious desktop layout at 1920px', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/pentest');

  await expect(page.locator('.hero-visual')).toBeVisible();
  await expect(page.locator('.expert-consultation')).toHaveCSS('width', '352px');
  await expect(page.locator('.app-sider')).toHaveCSS('width', '260px');
});
