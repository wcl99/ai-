import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { rememberPentestSession } from './pentestSessionRoute';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  org_id: '22222222-2222-4222-8222-222222222222',
  username: 'admin',
  name: 'Test Admin',
  role: 'admin',
  is_active: true,
  is_digital_human: false,
};

const task = {
  id: '33333333-3333-4333-8333-333333333333', plan_id: '44444444-4444-4444-8444-444444444444', parent_id: null,
  external_task_id: null, name: 'API 近期任务', status: 'RUNNING', phase: 'scanning', progress: 42,
  sync_failures: 0, error_code: null, error_message: null, created_at: '2026-07-23T08:00:00Z',
  updated_at: '2026-07-23T08:01:00Z', plan_name: '授权计划', test_type: 'standard', targets: ['example.com'],
  created_by_name: '管理员',
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function appFetch(input: RequestInfo | URL) {
  const path = String(input);
  if (path === '/api/v1/auth/me') return Promise.resolve(json(user));
  const url = new URL(path, 'http://localhost');
  const page = Number(url.searchParams.get('page') ?? 1);
  const pageSize = Number(url.searchParams.get('page_size') ?? 20);
  const envelope = (items: unknown[], total: number) => json({ success: true, message: 'ok', data: { items, total, page, page_size: pageSize } });
  if (url.pathname === '/api/v1/tasks') {
    const running = url.searchParams.get('status') === 'RUNNING';
    return Promise.resolve(envelope(pageSize === 3 ? [task] : [], running ? 2 : 7));
  }
  if (url.pathname === '/api/v1/assets') return Promise.resolve(envelope([], 4));
  if (url.pathname === '/api/v1/vulnerabilities') {
    const filtered = url.searchParams.has('severity') || url.searchParams.has('status');
    return Promise.resolve(envelope([], filtered ? 1 : 5));
  }
  if (url.pathname === '/api/v1/vulnerabilities/overview') return Promise.resolve(json({ success: true, message: 'ok', data: {
    range: url.searchParams.get('range') ?? '7d', timezone: 'Asia/Shanghai', granularity: 'day',
    metrics: { total: 5, critical: 1, high: 1, medium: 1, low: 1, unknown: 1, open: 3, retesting: 1, fixed: 1 },
    risk_distribution: [{ key: 'critical', label: '严重', count: 1 }, { key: 'high', label: '高危', count: 1 }],
    source_distribution: [{ key: 'xiaoyi', label: '小易回传', count: 5 }],
    trend: [{ start: '2026-08-11T00:00:00+08:00', count: 2 }],
    recommendations: ['优先修复严重和高危漏洞'],
  } }));
  if (url.pathname === '/api/v1/reports') return Promise.resolve(envelope([], 6));
  if (url.pathname === '/api/v1/reports/overview') return Promise.resolve(json({ success: true, message: 'ok', data: {
    range: url.searchParams.get('range') ?? '7d', timezone: 'Asia/Shanghai', granularity: 'day',
    metrics: { total: 6, ready: 5, partial: 1, recent_7d: 2, latest_at: '2026-08-11T00:00:00Z' },
    source_distribution: [{ key: 'platform', label: '平台生成', count: 5 }, { key: 'xiaoyi', label: '小易回传', count: 1 }],
    level_distribution: [{ key: 'standard', label: '标准报告', count: 5 }, { key: 'partial', label: '部分报告', count: 1 }],
    trend: [{ start: '2026-08-11T00:00:00+08:00', count: 2 }],
    insights: ['近 7 天生成 2 份报告'],
  } }));
  if (url.pathname === '/api/v1/settings/organization') return Promise.resolve(json({
    id: user.org_id, name: 'Cloud Shield Lab', created_at: '2026-08-10T08:00:00Z', updated_at: '2026-08-10T08:00:00Z',
  }));
  if (url.pathname === '/api/v1/settings/runtime') return Promise.resolve(json({ success: true, message: 'ok', data: {
    app_name: 'AI Security Platform', engine_mode: 'xiaoyi', engine_configured: true,
    engine_retry_limit: 3, sync_interval_seconds: 5, report_storage: 'local',
  } }));
  if (url.pathname === '/api/v1/users') return Promise.resolve(envelope([user], 1));
  if (url.pathname === '/api/v1/audit-logs') return Promise.resolve(envelope([], 0));
  return Promise.resolve(json({ success: false, code: 'NOT_FOUND', message: 'Not found', details: null }));
}

describe('App', () => {
  function renderRoute(path: string, fetchImplementation = appFetch) {
    vi.stubGlobal('fetch', vi.fn(fetchImplementation));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter
            initialEntries={[path]}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <App />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('places penetration testing under the workbench and the active session under task center', async () => {
    const interaction = userEvent.setup();
    rememberPentestSession(user.id, task.id);
    renderRoute(`/pentest/session/${task.id}`);

    await screen.findByText('Test Admin');
    const workbench = screen.getByText('工作台').closest('li');
    const taskCenter = screen.getByText('任务中心').closest('li');
    expect(workbench).not.toBeNull();
    expect(taskCenter).not.toBeNull();
    await interaction.click(screen.getByText('工作台'));
    expect(within(workbench!).getByText('渗透测试')).toBeInTheDocument();
    expect(within(workbench!).queryByText('当前任务')).not.toBeInTheDocument();
    expect(within(taskCenter!).getByText('当前任务')).toBeInTheDocument();
    expect(taskCenter).toHaveClass('ant-menu-submenu-open');
  });

  it('removes a terminal penetration session from current tasks', async () => {
    rememberPentestSession(user.id, task.id);
    const finishedFetch = (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === `/api/v1/tasks/${task.id}`) {
        return Promise.resolve(json({ ...task, status: 'SUCCEEDED', progress: 100 }));
      }
      return appFetch(input);
    };
    renderRoute(`/pentest/session/${task.id}`, finishedFetch);

    await screen.findByText('Test Admin');
    await waitFor(() => expect(screen.queryByText('当前任务')).not.toBeInTheDocument());
    expect(localStorage.getItem(`aisec:pentest-session:${user.id}`)).toBeNull();
    const taskCenter = screen.getByText('任务中心').closest('li');
    expect(within(taskCenter!).getByText('已完成').closest('li'))
      .not.toHaveClass('ant-menu-item-disabled');
  });

  it('renders the platform overview', async () => {
    const { container } = renderRoute('/overview');
    expect(await screen.findByRole('heading', { name: '平台总览' })).toBeInTheDocument();
    expect(screen.getByText('AI 今日摘要')).toBeInTheDocument();
    expect(await screen.findAllByText('API 近期任务')).not.toHaveLength(0);
    expect(screen.getByText('暂无历史趋势数据')).toBeInTheDocument();
    expect(
      [...container.querySelectorAll<HTMLImageElement>('.metric-card img')].map((image) => image.src),
    ).toEqual([
      expect.stringContaining('/ui-icons/metric-task.png'),
      expect.stringContaining('/ui-icons/metric-task-clock.png'),
      expect.stringContaining('/ui-icons/metric-warning.png'),
      expect.stringContaining('/ui-icons/metric-database.png'),
      expect.stringContaining('/ui-icons/metric-vulnerability-total.png'),
    ]);
  });

  it('does not present loading overview metrics as authoritative zeros', async () => {
    const pendingFetch = (input: RequestInfo | URL) => {
      if (String(input) === '/api/v1/auth/me') return Promise.resolve(json(user));
      return new Promise<Response>(() => undefined);
    };
    const { container } = renderRoute('/overview', pendingFetch);

    expect(await screen.findByRole('heading', { name: '平台总览' })).toBeInTheDocument();
    expect(
      [...container.querySelectorAll<HTMLElement>('.metric-card .ant-card-body > strong')].map((node) => node.textContent),
    ).toEqual(['—', '—', '—', '—', '—']);
    expect(screen.getByText('正在加载任务...')).toBeInTheDocument();
  });

  it.each([
    ['/tasks', ['metric-task-all', 'metric-task-queued', 'metric-task-running', 'metric-task-completed', 'metric-task-abnormal']],
    ['/vulnerabilities', ['metric-vulnerability-total', 'metric-vulnerability-high', 'metric-vulnerability-medium', 'metric-vulnerability-pending', 'metric-vulnerability-retest', 'metric-vulnerability-fixed']],
    ['/reports', ['metric-report-total']],
  ])('uses the exported metric icons on %s', async (path, icons) => {
    const { container } = renderRoute(path);
    await screen.findByRole('button', { name: '用户菜单' });
    const sources = [...container.querySelectorAll<HTMLImageElement>('.metric-card img')].map((image) => image.src);
    expect(sources).toEqual(icons.map((icon) => expect.stringContaining(`/ui-icons/${icon}.png`)));
  });

  it('renders the new overview routes', async () => {
    renderRoute('/vulnerabilities/overview');
    expect(await screen.findByText('AI 风险一览')).toBeInTheDocument();
    expect(screen.getAllByText('整体修复进度')).not.toHaveLength(0);
    expect(screen.getByRole('radio', { name: '当日' })).toBeInTheDocument();
    expect(await screen.findByText('小易回传')).toBeInTheDocument();
    expect(await screen.findByText('优先修复严重和高危漏洞')).toBeInTheDocument();
  });

  it('renders report trend, distributions, and insights', async () => {
    renderRoute('/reports/overview');
    expect(await screen.findByText('报告生成趋势')).toBeInTheDocument();
    expect(await screen.findByText('平台生成')).toBeInTheDocument();
    expect(await screen.findByText('标准报告')).toBeInTheDocument();
    expect(await screen.findByText('近 7 天生成 2 份报告')).toBeInTheDocument();
  });

  it.each([
    ['/settings', '系统设置'],
    ['/settings/team', '团队管理'],
    ['/settings/authorization', '授权管理'],
  ])('renders the management route %s', async (path, heading) => {
    renderRoute(path);
    expect(await screen.findAllByRole('heading', { name: heading })).not.toHaveLength(0);
  });

  it('renders the login page without the app shell', async () => {
    const unauthenticatedFetch = () => Promise.resolve(new Response(JSON.stringify({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      details: null,
    }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    const { container } = renderRoute('/login', unauthenticatedFetch);
    expect(await screen.findByRole('heading', { name: '系统登录' })).toBeInTheDocument();
    expect(screen.queryByText('平台总览')).not.toBeInTheDocument();
    expect(container.querySelector('.login-visual-panel')).toBeInTheDocument();
    expect(container.querySelector('.login-form-panel')).toBeInTheDocument();
  });
});
