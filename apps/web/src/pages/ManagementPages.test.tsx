import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthorizationPage } from './AuthorizationPage';
import { AssetsPage, SettingsPage } from './ManagementPages';
import { TeamPage } from './TeamPage';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderPage(page: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

describe('management pages', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds an authorized asset', async () => {
    const asset = {
      id: '11111111-1111-4111-8111-111111111111', plan_id: null, asset_key: 'existing.example.com',
      asset_type: 'domain', address: 'existing.example.com', service: null, owner: '现有业务线', authorized: true,
      data_json: {}, created_at: '2026-07-23T08:00:00Z', updated_at: '2026-07-23T08:00:00Z',
    };
    const created = { ...asset, id: '22222222-2222-4222-8222-222222222222', asset_key: 'new.example.com', address: 'new.example.com', owner: '验证业务线' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ success: true, message: 'ok', data: { items: [asset], total: 1, page: 1, page_size: 10 } }))
      .mockResolvedValueOnce(response(created, 201))
      .mockResolvedValueOnce(response({ success: true, message: 'ok', data: { items: [created, asset], total: 2, page: 1, page_size: 10 } }));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderPage(<AssetsPage />);

    expect(await screen.findByText('existing.example.com')).toBeInTheDocument();
    await interaction.click(screen.getByRole('button', { name: /新增资产/ }));
    await interaction.type(screen.getByPlaceholderText(/admin.example.com/), 'new.example.com');
    await interaction.type(screen.getByPlaceholderText('例如电商业务线'), '验证业务线');
    await interaction.click(screen.getByRole('button', { name: /确认添加/ }));

    expect(await screen.findByText('new.example.com')).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      asset_type: 'domain', address: 'new.example.com', owner: '验证业务线', authorized: true,
    });
  });

  it('shows live organization and runtime settings', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({
        id: '22222222-2222-4222-8222-222222222222', name: 'Cloud Shield Lab',
        created_at: '2026-08-10T08:00:00Z', updated_at: '2026-08-10T08:00:00Z',
      }))
      .mockResolvedValueOnce(response({ success: true, message: 'ok', data: {
        app_name: 'AI Security Platform', engine_mode: 'xiaoyi', engine_configured: true,
        engine_retry_limit: 3, sync_interval_seconds: 5, report_storage: 'local',
      } })));

    renderPage(<SettingsPage />);

    expect(await screen.findByDisplayValue('Cloud Shield Lab')).toBeInTheDocument();
    expect(await screen.findByText('xiaoyi')).toBeInTheDocument();
    expect(screen.getByText('已配置')).toBeInTheDocument();
  });

  it('lists team members and creates a member through the real API contract', async () => {
    const member = {
      id: '11111111-1111-4111-8111-111111111111', org_id: '22222222-2222-4222-8222-222222222222',
      username: 'admin', name: 'Platform Admin', role: 'admin', is_active: true, is_digital_human: false,
    };
    const created = { ...member, id: '33333333-3333-4333-8333-333333333333', username: 'operator.lin', name: 'Lin Wei', role: 'operator' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ success: true, message: 'ok', data: { items: [member], total: 1, page: 1, page_size: 20 } }))
      .mockResolvedValueOnce(response(created, 201))
      .mockResolvedValueOnce(response({ success: true, message: 'ok', data: { items: [created, member], total: 2, page: 1, page_size: 20 } }));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();

    renderPage(<TeamPage />);
    expect(await screen.findByText('Platform Admin')).toBeInTheDocument();
    await interaction.click(screen.getByRole('button', { name: /添加成员/ }));
    await interaction.type(screen.getByLabelText('姓名'), 'Lin Wei');
    await interaction.type(screen.getByLabelText('账号'), 'operator.lin');
    await interaction.type(screen.getByLabelText('初始密码'), 'simple-pass');
    await interaction.click(screen.getByRole('button', { name: '确认添加' }));

    expect(await screen.findByText('Lin Wei')).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toMatchObject({
      username: 'operator.lin', name: 'Lin Wei', role: 'operator', is_digital_human: false,
    });
  });

  it('renders authorization context and audit activity', async () => {
    const organization = {
      id: '22222222-2222-4222-8222-222222222222', name: 'Cloud Shield Lab',
      created_at: '2026-08-10T08:00:00Z', updated_at: '2026-08-10T08:00:00Z',
    };
    const runtime = {
      app_name: 'AI Security Platform', engine_mode: 'xiaoyi', engine_configured: true,
      engine_retry_limit: 3, sync_interval_seconds: 5, report_storage: 'local',
    };
    const audit = {
      id: '44444444-4444-4444-8444-444444444444', actor_id: '11111111-1111-4111-8111-111111111111',
      action: 'user.create', resource_type: 'user', resource_id: '33333333-3333-4333-8333-333333333333',
      outcome: 'success', details_json: {}, created_at: '2026-08-10T08:05:00Z',
    };
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response(organization))
      .mockResolvedValueOnce(response({ success: true, message: 'ok', data: runtime }))
      .mockResolvedValueOnce(response({ success: true, message: 'ok', data: { items: [audit], total: 1, page: 1, page_size: 20 } })));

    renderPage(<AuthorizationPage />);

    expect(await screen.findByText('Cloud Shield Lab')).toBeInTheDocument();
    expect(await screen.findByText('user.create')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
  });
});
