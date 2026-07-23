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

describe('App', () => {
  function renderRoute(path: string) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(user), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
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
    expect(screen.getByLabelText('风险趋势折线图').querySelectorAll('path')).toHaveLength(4);
    expect(
      [...container.querySelectorAll<HTMLImageElement>('.metric-card img')].map((image) => image.src),
    ).toEqual([
      expect.stringContaining('/ui-icons/metric-task.png'),
      expect.stringContaining('/ui-icons/metric-task-clock.png'),
      expect.stringContaining('/ui-icons/metric-warning.png'),
      expect.stringContaining('/ui-icons/metric-database.png'),
      expect.stringContaining('/ui-icons/metric-danger.png'),
    ]);
  });

  it.each([
    ['/tasks', ['metric-task-all', 'metric-task-queued', 'metric-task-running', 'metric-task-completed', 'metric-task-abnormal', 'metric-task-today']],
    ['/vulnerabilities', ['metric-vulnerability-total', 'metric-vulnerability-high', 'metric-vulnerability-medium', 'metric-vulnerability-pending', 'metric-vulnerability-retest', 'metric-vulnerability-fixed']],
    ['/reports', ['metric-report-total', 'metric-report-weekly', 'metric-report-pending-export', 'metric-report-exported', 'metric-report-pending-confirm', 'metric-report-delivered']],
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
    renderRoute('/login');
    expect(await screen.findByRole('heading', { name: '系统登录' })).toBeInTheDocument();
    expect(screen.queryByText('平台总览')).not.toBeInTheDocument();
  });
});
