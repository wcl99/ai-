import { expect, test } from '@playwright/test';

const taskId = '11111111-1111-4111-8111-111111111111';
const vulnerabilityId = '33333333-3333-4333-8333-333333333333';

const user = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  org_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  username: 'admin',
  name: 'Administrator',
  role: 'admin',
  is_active: true,
  is_digital_human: false,
};

const task = {
  id: taskId,
  plan_id: '22222222-2222-4222-8222-222222222222',
  parent_id: null,
  external_task_id: 'engine-task',
  name: 'Production API assessment',
  status: 'RUNNING',
  phase: 'scanning',
  progress: 42,
  sync_failures: 0,
  error_code: null,
  error_message: null,
  created_at: '2026-08-12T08:00:00Z',
  updated_at: '2026-08-12T08:01:00Z',
  plan_name: 'Authorized plan',
  test_type: 'standard',
  targets: ['api.example.test'],
  created_by_name: 'Administrator',
};

const vulnerability = {
  id: vulnerabilityId,
  plan_id: task.plan_id,
  task_id: taskId,
  asset_key: 'api.example.test',
  title: 'SQL injection in search endpoint',
  severity: 'high',
  status: 'OPEN',
  description: 'The search parameter reaches a database query without safe binding.',
  created_at: '2026-08-12T08:02:00Z',
  updated_at: '2026-08-12T08:02:00Z',
  task_name: task.name,
  tags: ['Web'],
  data_json: {
    source_tool: 'scanner',
    http_url: 'https://api.example.test/search',
    request_example: 'GET /search?q=test',
    response_example: 'HTTP/1.1 500 Internal Server Error',
    vuln_suggestions: 'Use parameterized queries and retest the endpoint.',
  },
};

function envelope(items: unknown[]) {
  return { success: true, message: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } };
}

test('renders and refreshes the login captcha', async ({ page }) => {
  let captchaRequests = 0;
  await page.route('**/api/v1/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/v1/auth/me') {
      return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'UNAUTHORIZED', message: 'Authentication required', details: null }) });
    }
    if (pathname === '/api/v1/auth/captcha') {
      captchaRequests += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'ok', data: { question: captchaRequests === 1 ? '4 + 3 =?' : '5 + 2 =?', token: `captcha-${captchaRequests}`, expires_in: 120 } }) });
    }
    return route.abort();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.getByText('4 + 3 =?')).toBeVisible();
  await page.getByRole('button', { name: '刷新验证码' }).click();
  await expect(page.getByText('5 + 2 =?')).toBeVisible();
  await expect(page.locator('.login-card')).toBeInViewport();
});

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.title.includes('login captcha')) return;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (pathname === '/api/v1/auth/me') return json(user);
    if (pathname === '/api/v1/dashboard/summary') return json({ success: true, message: 'ok', data: {
      metrics: { assets: 4, tasks: 7, running_tasks: 1, failed_tasks: 1, high_risk: 2, vulnerabilities: 5, open_vulnerabilities: 3, reports: 2 },
      ai_summary: { warnings: ['当前有 3 个未关闭漏洞。'], priority_findings: ['优先处置 2 个高危漏洞。'], remediation: ['完成修复后安排复测。'], source: 'deepseek' },
      risk_trend: Array.from({ length: 7 }, (_, index) => ({ start: `2026-08-${String(index + 6).padStart(2, '0')}`, critical: index === 6 ? 1 : 0, high: index % 2, medium: 1, low: 0 })),
    } });
    if (pathname === '/api/v1/tasks' && request.method() === 'GET') return json(envelope([task]));
    if (pathname === `/api/v1/tasks/${taskId}/stop`) return json({ ...task, status: 'CANCELLING' });
    if (pathname === '/api/v1/assets') return json(envelope([]));
    if (pathname === '/api/v1/reports') return json(envelope([]));
    if (pathname === '/api/v1/vulnerabilities') return json(envelope([vulnerability]));
    if (pathname === `/api/v1/vulnerabilities/${vulnerabilityId}`) return json(vulnerability);
    return json({ success: false, code: 'UNMOCKED', message: pathname, details: null });
  });
});

test('shows overview intelligence and task actions', async ({ page }) => {
  await page.setViewportSize({ width: 1196, height: 912 });
  await page.goto('/overview');
  await expect(page.getByText('AI 今日摘要')).toBeVisible();
  await expect(page.getByText('DeepSeek 分析')).toBeVisible();
  await expect(page.getByLabel('风险趋势图')).toBeVisible();
  await expect(page.locator('.dashboard-risk-chart .risk-series path')).toHaveCount(4);
  await expect(page.locator('.dashboard-summary-block')).toHaveCount(3);
  await expect(page.locator('.overview-material-panel > img')).toHaveCount(4);
  await expect(page.getByRole('progressbar', { name: `${task.name}执行进度` })).toHaveAttribute('aria-valuenow', '42');
  await expect(page.locator('.activity-timeline .activity-node')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/overview-material-1196x912.png', fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator('.overview-material-panel > img')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/overview-material-1920x1080.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.overview-material-panel').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/overview-material-mobile.png', fullPage: true });
  await page.locator('.recent-task').click();
  await expect(page).toHaveURL(`/pentest/session/${taskId}`);

  await page.goto('/tasks?status=RUNNING');
  await page.getByRole('button', { name: '摘要' }).click();
  await expect(page.getByText('执行进度 42%')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '暂停' }).click();
  await page.getByRole('tooltip').getByRole('button').last().click();
  await expect(page.getByText('暂停请求已提交')).toBeVisible();
});

test('opens the vulnerability drawer and full detail page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/vulnerabilities');
  await page.getByRole('button', { name: '查看漏洞详情' }).click();
  await expect(page.getByText('AI 风险摘要')).toBeVisible();
  await expect(page.getByText('Use parameterized queries and retest the endpoint.')).toBeVisible();
  await page.getByRole('button', { name: '查看详情' }).click();
  await expect(page).toHaveURL(`/vulnerabilities/${vulnerabilityId}`);
  await expect(page.getByText('漏洞证据')).toBeVisible();
  await expect(page.getByText('GET /search?q=test')).toBeVisible();
  await expect(page.getByText('修复建议')).toBeVisible();
});
