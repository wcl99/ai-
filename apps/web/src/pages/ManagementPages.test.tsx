import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetsPage, SettingsPage } from './ManagementPages';

describe('management pages', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds an authorized asset', async () => {
    const asset = {
      id: '11111111-1111-4111-8111-111111111111', plan_id: null, asset_key: 'existing.example.com',
      asset_type: 'domain', address: 'existing.example.com', service: null, owner: '现有业务线', authorized: true,
      data_json: {}, created_at: '2026-07-23T08:00:00Z', updated_at: '2026-07-23T08:00:00Z',
    };
    const created = { ...asset, id: '22222222-2222-4222-8222-222222222222', asset_key: 'new.example.com', address: 'new.example.com', owner: '验证业务线' };
    const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ success: true, message: 'ok', data: { items: [asset], total: 1, page: 1, page_size: 10 } }))
      .mockResolvedValueOnce(response(created, 201))
      .mockResolvedValueOnce(response({ success: true, message: 'ok', data: { items: [created, asset], total: 2, page: 1, page_size: 10 } }));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><AssetsPage /></QueryClientProvider>);

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

  it('shows validation integration settings', () => {
    render(<SettingsPage />);
    expect(screen.getByText('小易渗透引擎')).toBeInTheDocument();
    expect(screen.getByText('智能数字人')).toBeInTheDocument();
  });
});
