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
  await page.route('**/api/v1/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(pathname === '/api/v1/auth/me'
        ? user
        : { success: true, message: 'ok', data: { items: [], total: 0, page: 1, page_size: 20 } }),
    });
  });
});

test('keeps the full desktop canvas at 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/pentest');
  await expect(page.locator('.target-form')).toBeVisible();

  const layout = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      siderWidth: box('.app-sider')?.width,
      consultationCount: document.querySelectorAll('.expert-consultation').length,
      visualDisplay: getComputedStyle(document.querySelector('.hero-visual')!).display,
    };
  });

  expect(layout.documentWidth).toBeGreaterThanOrEqual(1920);
  expect(layout.documentWidth).toBeGreaterThan(layout.viewportWidth);
  expect(layout.siderWidth).toBe(260);
  expect(layout.consultationCount).toBe(0);
  expect(layout.visualDisplay).not.toBe('none');
});

test('uses horizontal scrolling instead of rearranging below the desktop canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/pentest');
  await expect(page.locator('.target-form')).toBeVisible();

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    siderWidth: document.querySelector('.app-sider')?.getBoundingClientRect().width,
    consultationCount: document.querySelectorAll('.expert-consultation').length,
    visualDisplay: getComputedStyle(document.querySelector('.hero-visual')!).display,
  }));

  expect(layout.documentWidth).toBeGreaterThanOrEqual(1920);
  expect(layout.documentWidth).toBeGreaterThan(layout.viewportWidth);
  expect(layout.siderWidth).toBe(260);
  expect(layout.consultationCount).toBe(0);
  expect(layout.visualDisplay).not.toBe('none');
});

test('preserves the spacious desktop layout at 1920px', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.goto('/pentest');

  await expect(page.locator('.hero-visual')).toBeVisible();
  await expect(page.locator('.expert-consultation')).toHaveCount(0);
  await expect(page.locator('.app-sider')).toHaveCSS('width', '260px');
});

test('keeps overview feature cards at their desktop proportions while zoomed', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/overview');
  await expect(page.locator('.feature-card').first()).toBeVisible();

  const layout = await page.evaluate(() => {
    const card = document.querySelector('.feature-card')!;
    const copy = card.querySelector('.ant-card-body > div')!;
    return {
      documentWidth: document.documentElement.scrollWidth,
      cardWidth: card.getBoundingClientRect().width,
      copyWidth: copy.getBoundingClientRect().width,
      titleWhiteSpace: getComputedStyle(copy.querySelector('strong')!).whiteSpace,
      descriptionWhiteSpace: getComputedStyle(copy.querySelector('p')!).whiteSpace,
    };
  });

  expect(layout.documentWidth).toBeGreaterThanOrEqual(1920);
  expect(layout.cardWidth).toBeGreaterThanOrEqual(380);
  expect(layout.copyWidth).toBeGreaterThanOrEqual(140);
  expect(layout.titleWhiteSpace).toBe('nowrap');
  expect(layout.descriptionWhiteSpace).toBe('nowrap');
});
