import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { AuthorizationPage } from './AuthorizationPage';
import { SettingsPage } from './ManagementPages';
import { TeamPage } from './TeamPage';

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function renderPage(page: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

describe('material page contracts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('matches the exported authentication settings modules', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(response({ id: '22222222-2222-4222-8222-222222222222', name: '云盾智意', created_at: '2026-08-12T00:00:00Z', updated_at: '2026-08-12T00:00:00Z' }))
      .mockResolvedValueOnce(response({ success: true, message: 'ok', data: { engine_configured: true } })));

    renderPage(<SettingsPage />);

    expect(await screen.findByText('登录尝试次数限制')).toBeInTheDocument();
    expect(screen.getByText('自动登出时间')).toBeInTheDocument();
    expect(screen.getByText('记录权限变更操作')).toBeInTheDocument();
    expect(screen.getByText('启用RBAC权限检查')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导出审计日志' })).toBeInTheDocument();
  });

  it('matches the exported team table columns and row actions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      success: true,
      message: 'ok',
      data: { items: [{ id: '11111111-1111-4111-8111-111111111111', org_id: '22222222-2222-4222-8222-222222222222', username: 'admin', name: 'Platform Admin', role: 'admin', is_active: true, is_digital_human: false }], total: 1, page: 1, page_size: 20 },
    })));

    renderPage(<TeamPage />);

    expect(await screen.findByText('Platform Admin')).toBeInTheDocument();
    expect(screen.getByText('当前部门')).toBeInTheDocument();
    expect(screen.getByText('部门成员')).toBeInTheDocument();
    for (const column of ['用户名', '姓名', '邮箱', '角色', '状态', '最后登录', '创建时间', '操作']) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: '编辑 Platform Admin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '详情 Platform Admin' })).toBeInTheDocument();
  });

  it('matches the exported authorization actions and upload module', () => {
    renderPage(<AuthorizationPage />);

    expect(screen.getByText('更新授权')).toBeInTheDocument();
    expect(screen.getByText('指纹信息 (Encoded)')).toBeInTheDocument();
    expect(screen.getByText('用于申请授权')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载 Request 文件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上传并验证' })).toBeDisabled();
  });
});
