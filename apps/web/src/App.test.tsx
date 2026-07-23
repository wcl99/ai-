import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';

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
  if (url.pathname === '/api/v1/reports') return Promise.resolve(envelope([], 6));
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

  afterEach(() => vi.unstubAllGlobals());

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
  });

  it('renders the login page without the app shell', async () => {
    const unauthenticatedFetch = () => Promise.resolve(new Response(JSON.stringify({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
      details: null,
    }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    renderRoute('/login', unauthenticatedFetch);
    expect(await screen.findByRole('heading', { name: '系统登录' })).toBeInTheDocument();
    expect(screen.queryByText('平台总览')).not.toBeInTheDocument();
  });
});
