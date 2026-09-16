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

const organization = {
  id: '22222222-2222-4222-8222-222222222222', name: 'Cloud Shield Lab',
  created_at: '2026-08-10T08:00:00Z', updated_at: '2026-08-10T08:00:00Z',
};

const runtime = {
  app_name: 'AI Security Platform', engine_mode: 'xiaoyi', engine_configured: true,
  engine_retry_limit: 3, sync_interval_seconds: 5, report_storage: 'local',
};

describe('management pages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

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
    expect(screen.getByText('资产列表')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '资产类型筛选' })).toBeInTheDocument();
    await interaction.click(screen.getByRole('button', { name: /新增资产/ }));
    await interaction.type(screen.getByPlaceholderText(/admin.example.com/), 'new.example.com');
    await interaction.type(screen.getByPlaceholderText('例如电商业务线'), '验证业务线');
    await interaction.click(screen.getByRole('button', { name: /确认添加/ }));

    expect(await screen.findByText('new.example.com')).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      asset_type: 'domain', address: 'new.example.com', owner: '验证业务线', authorized: true,
    });
  });

  it('switches all system settings tabs and persists local model settings', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(organization))
      .mockResolvedValueOnce(response({ success: true, message: 'ok', data: runtime }));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderPage(<SettingsPage />);

    expect(await screen.findByText('登录与退出设置')).toBeInTheDocument();
    for (const tab of ['认证与安全', 'AI 模型', '场景配置', '规则配置', '模块管理']) {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument();
    }

    expect(screen.getByText('审计日志设置')).toBeInTheDocument();
    expect(screen.getByText('访问控制设置')).toBeInTheDocument();

    await interaction.click(screen.getByRole('tab', { name: 'AI 模型' }));
    expect(screen.getAllByText('AI模型设置').length).toBeGreaterThanOrEqual(2);
    const modelName = screen.getByLabelText('模型名称');
    await interaction.clear(modelName);
    await interaction.type(modelName, 'deepseek-v4-flash');
    await interaction.click(screen.getByRole('button', { name: '保存设置' }));

    expect(localStorage.getItem('ai-security-management-settings-v1')).toContain('deepseek-v4-flash');

    await interaction.click(screen.getByRole('tab', { name: '场景配置' }));
    expect(screen.getByText('任务执行配置')).toBeInTheDocument();
    expect(screen.getByText('弱口令默认密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /添\s*加/ })).toBeInTheDocument();

    await interaction.click(screen.getByRole('tab', { name: '规则配置' }));
    expect(screen.getByText('R001 未解除账号')).toBeInTheDocument();
    expect(screen.getByText('规则配置（JSON）')).toBeInTheDocument();

    await interaction.click(screen.getByRole('tab', { name: '模块管理' }));
    expect(screen.getByText('工作台模块展示授权')).toBeInTheDocument();
    expect(screen.getByText('应急响应')).toBeInTheDocument();
  });

  it('lists team members and creates a member through the real API contract', async () => {
    const member = {
      id: '11111111-1111-4111-8111-111111111111', org_id: organization.id,
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
    expect(screen.getByText('组织架构')).toBeInTheDocument();
    expect(screen.getByText('成员列表')).toBeInTheDocument();
    expect(screen.getByText('研发中心')).toBeInTheDocument();
    expect(screen.getByText('安全实验室')).toBeInTheDocument();
    expect(screen.getByText('架构组')).toBeInTheDocument();
    expect(screen.getByText('市场部')).toBeInTheDocument();
    expect(screen.getByText('人力资源')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /添加成员/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /批量导入/ })).toBeDisabled();

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

  it('renders authorization as a disabled visual-only license surface', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    renderPage(<AuthorizationPage />);

    expect(screen.getByText('系统指纹')).toBeInTheDocument();
    expect(screen.getByText('授权状态')).toBeInTheDocument();
    expect(screen.getByText('授权产品')).toBeInTheDocument();
    expect(screen.getByText('授权对象')).toBeInTheDocument();
    expect(screen.getByText('有效期至')).toBeInTheDocument();
    expect(screen.getByText('剩余天数')).toBeInTheDocument();
    expect(screen.getByText('测试次数')).toBeInTheDocument();
    expect(screen.getByText('上传授权文件')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新状态' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '选择授权文件' })).toBeDisabled();
    expect(screen.getAllByText('授权管理功能暂未开放').length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
