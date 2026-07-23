import { expect, test } from '@playwright/test';

const planId = '11111111-1111-4111-8111-111111111111';
const taskId = '22222222-2222-4222-8222-222222222222';
const retriedTaskId = '66666666-6666-4666-8666-666666666666';

test('runs the authorized platform golden path without contacting the engine', async ({ page }) => {
  let planCreates = 0;
  let confirmations = 0;
  let taskCreates = 0;
  let taskStatus = 'RUNNING';
  let requestId = '';
  let stopRequested = false;

  await page.addInitScript(() => {
    class MockPrecheckWebSocket {
      static readonly OPEN = 1;
      readonly readyState = MockPrecheckWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;

      constructor(readonly url: string) {
        if (!url.endsWith('/api/v1/prechecks/ws')) {
          throw new Error(`Unexpected WebSocket URL: ${url}`);
        }
        queueMicrotask(() => this.onopen?.());
      }

      send(raw: string) {
        const request = JSON.parse(raw);
        const response = request.action === 'can_subdomain'
          ? {
              action: 'can_subdomain_result',
              success: true,
              hasResult: true,
              domains: [{ domain: 'admin.example.test', type: 'parent' }],
              subdomainCount: 1,
            }
          : {
              action: 'can_port_result',
              success: true,
              hasResult: true,
              hosts: [{ host: 'admin.example.test', alive: true, ports: [] }],
              portCount: 0,
            };
        queueMicrotask(() => this.onmessage?.(
          new MessageEvent('message', { data: JSON.stringify(response) }),
        ));
      }

      close() {
        this.onclose?.();
      }
    }

    Object.defineProperty(window, 'WebSocket', {
      configurable: true,
      value: MockPrecheckWebSocket,
    });
  });

  const plan = {
    id: planId,
    name: 'admin.example.test authorized validation',
    test_type: 'standard',
    status: 'DRAFT',
    targets: ['admin.example.test'],
    asset_list: [],
    templates: [],
    description: null,
    time_limit: null,
    snapshot: { authorization_confirmed: false },
    created_at: '2026-07-23T08:00:00Z',
  };
  const task = () => ({
    id: taskId,
    plan_id: planId,
    parent_id: null,
    external_task_id: 'mock-platform-task',
    name: 'Authorized platform task',
    status: taskStatus,
    phase: taskStatus === 'CANCELLING' ? 'SCANNING' : 'SCANNING',
    progress: 60,
    sync_failures: 0,
    error_code: null,
    error_message: null,
    created_at: '2026-07-23T08:01:00Z',
    updated_at: '2026-07-23T08:02:00Z',
  });
  const pageEnvelope = (items: unknown[]) => ({
    success: true,
    message: 'ok',
    data: { items, total: items.length, page: 1, page_size: 20 },
  });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const fulfill = (json: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(json),
    });

    if (pathname === '/api/v1/auth/me') {
      return fulfill({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        org_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        username: 'admin',
        name: 'Administrator',
        role: 'admin',
        is_active: true,
        is_digital_human: false,
      });
    }
    if (pathname === '/api/v1/scan-plans' && request.method() === 'POST') {
      planCreates += 1;
      expect(request.postDataJSON()).toMatchObject({
        targets: ['admin.example.test'],
        authorization_confirmed: false,
      });
      return fulfill(plan, 201);
    }
    if (pathname === `/api/v1/scan-plans/${planId}/confirm`) {
      confirmations += 1;
      return fulfill({
        ...plan,
        status: 'READY',
        snapshot: { authorization_confirmed: true },
      });
    }
    if (pathname === '/api/v1/tasks' && request.method() === 'POST') {
      taskCreates += 1;
      requestId = request.postDataJSON().request_id;
      return fulfill(task(), 201);
    }
    if (pathname === `/api/v1/tasks/${taskId}` && request.method() === 'GET') {
      if (stopRequested) taskStatus = 'CANCELLED';
      return fulfill(task());
    }
    if (pathname === `/api/v1/tasks/${taskId}/stop`) {
      taskStatus = 'CANCELLING';
      stopRequested = true;
      return fulfill(task());
    }
    if (pathname === `/api/v1/tasks/${taskId}/retry`) {
      return fulfill({
        ...task(),
        id: retriedTaskId,
        status: 'QUEUED',
        external_task_id: null,
        progress: 0,
      }, 201);
    }
    if (pathname === `/api/v1/tasks/${taskId}/events`) {
      return fulfill({
        success: true,
        message: 'ok',
        data: [{
          id: '33333333-3333-4333-8333-333333333333',
          event_type: 'created',
          message: 'Platform task created',
          data_json: {},
          created_at: '2026-07-23T08:01:00Z',
        }, ...(taskStatus === 'CANCELLED' ? [{
          id: '77777777-7777-4777-8777-777777777777',
          event_type: 'status_changed',
          message: 'Platform task cancelled',
          data_json: { status: 'CANCELLED' },
          created_at: '2026-07-23T08:03:00Z',
        }] : [])],
      });
    }
    if (pathname === `/api/v1/tasks/${taskId}/children`) {
      return fulfill({ success: true, message: 'ok', data: [] });
    }
    if (pathname === '/api/v1/vulnerabilities') {
      expect(url.searchParams.get('task_id')).toBe(taskId);
      return fulfill(pageEnvelope([{
        id: '44444444-4444-4444-8444-444444444444',
        plan_id: planId,
        task_id: taskId,
        asset_key: 'admin.example.test',
        title: 'Validated finding',
        severity: 'high',
        status: 'OPEN',
        description: null,
        created_at: '2026-07-23T08:01:30Z',
        updated_at: '2026-07-23T08:01:30Z',
        task_name: 'Authorized platform task',
        tags: [],
      }]));
    }
    if (pathname === '/api/v1/reports') {
      expect(url.searchParams.get('task_id')).toBe(taskId);
      return fulfill(pageEnvelope([{
        id: '55555555-5555-4555-8555-555555555555',
        plan_id: planId,
        task_id: taskId,
        filename: 'authorized-report.md',
        format: 'md',
        report_level: null,
        external_url: null,
        status: 'READY',
        created_at: '2026-07-23T08:02:00Z',
        plan_name: 'Authorized validation',
        task_name: 'Authorized platform task',
      }]));
    }
    return fulfill({ success: false, code: 'UNMOCKED', message: pathname }, 500);
  });

  await page.goto('/pentest');
  await page.locator('textarea[name="target"]').fill('admin.example.test');
  await page.locator('form button[type="submit"]').click();

  await expect(page.locator('.analysis-result')).toContainText('DRAFT');
  expect(planCreates).toBe(1);
  expect(confirmations).toBe(0);
  expect(taskCreates).toBe(0);

  await page.locator('.modal-actions button').click();
  await page.locator('.modal-actions button').click();
  await page.locator('.authorization-confirmation input[type="checkbox"]').check();
  await page.locator('.modal-actions button').click();

  await expect(page.locator('.analysis-result')).toContainText('READY');
  expect(confirmations).toBe(1);
  expect(taskCreates).toBe(0);

  await page.locator('.modal-actions button').click();
  await expect(page).toHaveURL(`/pentest/session/${taskId}`);
  expect(taskCreates).toBe(1);
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/);

  await expect(page.getByText('Authorized platform task')).toBeVisible();
  await expect(page.getByText('Platform task created')).toBeVisible();
  await expect(page.getByText('Validated finding')).toBeVisible();
  await expect(page.getByText('authorized-report.md')).toBeVisible();
  await expect(page.getByText(taskId)).toBeVisible();

  const repeatedTaskId = await page.evaluate(async ({ planId: id, requestId: key }) => {
    const response = await fetch('/api/v1/tasks', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan_id: id, request_id: key }),
    });
    return (await response.json()).id;
  }, { planId, requestId });
  expect(repeatedTaskId).toBe(taskId);
  expect(taskCreates).toBe(2);

  await page.locator('.execution-monitor button.ant-btn-dangerous').click();
  await expect(page.getByText('Platform task cancelled')).toBeVisible();
  await expect(page.getByText('Platform task created')).toBeVisible();
  expect(taskStatus).toBe('CANCELLED');

  await page.locator('.execution-monitor button.ant-btn-primary').click();
  await expect(page).toHaveURL(`/pentest/session/${retriedTaskId}`);
});
