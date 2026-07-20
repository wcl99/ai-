import { expect, test } from '@playwright/test';

test('starts a penetration test from the welcome page', async ({ page }) => {
  await page.goto('/pentest');
  await page.getByPlaceholder(/请输入测试目标/).fill('admin.example.com');
  await page.getByRole('button', { name: /开始分析/ }).click();
  await expect(page.getByText('扫描方案确认')).toBeVisible();
  await page.getByRole('button', { name: '跳过预查直接扫描' }).click();
  await expect(page.getByText('anshun12345.com 渗透测试')).toBeVisible();
});
