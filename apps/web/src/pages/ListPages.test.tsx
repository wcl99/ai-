import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ReportsPage, TasksPage, VulnerabilitiesPage } from './ListPages';

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return {
    ...actual,
    Popconfirm: ({ children, onConfirm }: { children: React.ReactNode; onConfirm?: () => void }) => (
      <span onClick={() => onConfirm?.()}>{children}</span>
    ),
  };
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function envelope(items: unknown[], total = items.length, page = 1) {
  return {
    success: true,
    message: 'ok',
    data: {
      items,
      total,
      page,
      page_size: 10,
      metrics: { total: 21, queued: 4, running: 8, completed: 17, failed: 3, cancelled: 2 },
    },
  };
}

const task = {
  id: '11111111-1111-4111-8111-111111111111', plan_id: '22222222-2222-4222-8222-222222222222', parent_id: null,
  external_task_id: null, name: 'API 真实任务', status: 'RUNNING', phase: 'scanning', progress: 42,
  sync_failures: 0, error_code: null, error_message: null, created_at: '2026-07-23T08:00:00Z',
  updated_at: '2026-07-23T08:01:00Z', plan_name: '授权计划', test_type: 'standard', targets: ['example.com'],
  created_by_name: '管理员',
};

  const vulnerability = {
  id: '33333333-3333-4333-8333-333333333333', plan_id: '22222222-2222-4222-8222-222222222222', task_id: null,
  asset_key: 'example.com', title: 'API 真实漏洞', severity: 'high', status: 'OPEN', description: '真实描述',
  created_at: '2026-07-23T08:00:00Z', updated_at: '2026-07-23T08:01:00Z', task_name: null, tags: ['Web'],
};

const report = {
  id: '44444444-4444-4444-8444-444444444444', plan_id: '22222222-2222-4222-8222-222222222222', task_id: null,
  filename: 'API 真实报告.md', format: 'md', report_level: null, external_url: null, status: 'READY',
  created_at: '2026-07-23T08:00:00Z', plan_name: '授权计划', task_name: null,
  first_viewed_at: null, first_viewed_by: null, first_exported_at: null, first_exported_by: null,
};

function LocationProbe() {
  return <span data-testid="location-path">{useLocation().pathname}</span>;
}

function renderPage(page: React.ReactNode, path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('resource list pages', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads tasks and requests the selected server page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(envelope([task], 21, 1)))
      .mockResolvedValueOnce(json(envelope([{ ...task, id: '55555555-5555-4555-8555-555555555555', name: '第二页任务' }], 21, 2)));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderPage(<TasksPage />);

    expect(await screen.findByText('API 真实任务')).toBeInTheDocument();
    expect(screen.getByText('管理员')).toHaveClass('table-nowrap');
    expect(screen.getByText('进行中', { selector: '.metric-top span' })).toBeInTheDocument();
    expect(screen.queryByText('本页进行中')).not.toBeInTheDocument();
    expect(screen.getByText('异常', { selector: '.metric-top span' }).closest('.metric-card')?.querySelector('strong')).toHaveTextContent('3');
    await interaction.click(screen.getByTitle('2'));
    expect(await screen.findByText('第二页任务')).toBeInTheDocument();
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('page=2');
  });

  it('opens running and completed tasks in the persisted execution page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(envelope([task]))));
    renderPage(<><TasksPage /><LocationProbe /></>, '/tasks?status=RUNNING');
    expect(await screen.findByRole('button', { name: '打开执行页' })).toBeEnabled();
    await userEvent.setup().click(screen.getByRole('button', { name: '打开执行页' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent(`/pentest/session/${task.id}`);
  });

  it('shows a task summary and submits a pause request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(envelope([task])))
      .mockResolvedValueOnce(json({
        task_id: task.id,
        vulnerabilities: [{
          id: vulnerability.id,
          title: '任务中的认证绕过',
          severity: 'high',
          status: 'OPEN',
          asset_key: 'example.com',
          description: '缺少前置验证',
          cvss_score: 8.6,
        }],
        score: 8.6,
        level: '高危',
        rationale: '漏洞可远程利用且影响认证流程。',
        source: 'deepseek',
        message: null,
      }))
      .mockResolvedValueOnce(json({ ...task, status: 'CANCELLING' }))
      .mockResolvedValueOnce(json(envelope([{ ...task, status: 'CANCELLING' }])));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderPage(<TasksPage />);
    await screen.findByText('API 真实任务');

    await interaction.click(screen.getByRole('button', { name: '摘要' }));
    expect(await screen.findByText(/执行进度 42%/)).toBeInTheDocument();
    expect(await screen.findByText('任务中的认证绕过')).toBeInTheDocument();
    expect(screen.getByText('8.6')).toBeInTheDocument();
    expect(screen.getAllByText('高危', { selector: '.task-risk-summary .ant-tag' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '暂停' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[2][0]).toBe(`/api/v1/tasks/${task.id}/stop`);
  });

  it('deletes a terminal task after confirmation', async () => {
    const terminal = { ...task, status: 'SUCCEEDED', progress: 100 };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(envelope([terminal])))
      .mockResolvedValueOnce(json({ success: true, message: 'Task deleted', data: null }))
      .mockResolvedValueOnce(json(envelope([])));
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<TasksPage />);
    await screen.findByText('API 真实任务');

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/v1/tasks/${task.id}`);
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('DELETE');
  });

  it('loads the completed task collection from the navigation filter', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(envelope([{ ...task, status: 'SUCCEEDED' }])));
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<TasksPage />, '/tasks?status=SUCCEEDED');

    await screen.findByText('API 真实任务');
    expect(fetchMock.mock.calls[0][0]).toContain('status=SUCCEEDED');
  });

  it('shows a real empty state and a retryable API error', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ success: false, code: 'UPSTREAM', message: '资源暂不可用', details: null }, 503))
      .mockResolvedValueOnce(json(envelope([])));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderPage(<><VulnerabilitiesPage /><LocationProbe /></>);

    expect(await screen.findByText('资源暂不可用')).toBeInTheDocument();
    expect(screen.getByText('本页高危')).toBeInTheDocument();
    await interaction.click(screen.getByRole('button', { name: /重\s*试/ }));
    expect(await screen.findByText('暂无漏洞数据')).toBeInTheDocument();
  });

  it('hides cached totals when a refresh fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(envelope([task], 7)))
      .mockResolvedValueOnce(json({ success: false, code: 'UPSTREAM', message: '刷新失败', details: null }, 503));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderPage(<TasksPage />);
    await screen.findByText('API 真实任务');

    await interaction.click(screen.getByRole('button', { name: /刷\s*新/ }));
    expect(await screen.findByText('刷新失败')).toBeInTheDocument();
    expect(
      screen.getByText('全部任务').closest('.metric-card')?.querySelector('strong'),
    ).toHaveTextContent('—');
  });

  it('updates vulnerability status through the API', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(envelope([vulnerability])))
      .mockResolvedValueOnce(json({ ...vulnerability, data_json: { source_tool: 'scanner', http_url: 'https://example.com', vuln_suggestions: '限制输入并完成复测' } }))
      .mockResolvedValueOnce(json({ ...vulnerability, status: 'FIXING', data_json: {} }))
      .mockResolvedValueOnce(json(envelope([{ ...vulnerability, status: 'FIXING' }])));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderPage(<><VulnerabilitiesPage /><LocationProbe /></>);
    await screen.findByText('API 真实漏洞');

    await interaction.click(screen.getByRole('button', { name: '查看漏洞详情' }));
    expect(await screen.findByTestId('material-vulnerability-drawer')).toHaveClass('detail-drawer');
    expect(screen.getByTestId('material-vulnerability-drawer')).not.toHaveStyle({
      backgroundImage: 'url(/material/vulnerabilities/drawer.png)',
    });
    expect(screen.getByTestId('material-vulnerability-drawer-content')).toBeInTheDocument();
    expect(screen.getByTestId('material-vulnerability-drawer-footer')).toBeInTheDocument();
    expect(await screen.findByText('真实描述')).toBeInTheDocument();
    expect(screen.getByText('限制输入并完成复测')).toBeInTheDocument();
    expect(screen.getByText('暂无评分')).toBeInTheDocument();
    await interaction.click(screen.getByRole('button', { name: '查看详情' }));
    expect(screen.getByTestId('location-path')).toHaveTextContent(`/vulnerabilities/${vulnerability.id}`);

    await interaction.click(screen.getByRole('button', { name: '处置漏洞' }));
    await interaction.click(await screen.findByText('标记修复中'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(JSON.parse((fetchMock.mock.calls[2][1] as RequestInit).body as string)).toEqual({ status: 'FIXING' });
  });

  it('deletes a vulnerability after confirmation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(envelope([vulnerability])))
      .mockResolvedValueOnce(json({ success: true, message: 'Vulnerability deleted', data: null }))
      .mockResolvedValueOnce(json(envelope([])));
    vi.stubGlobal('fetch', fetchMock);
    renderPage(<VulnerabilitiesPage />);
    await screen.findByText('API 真实漏洞');

    fireEvent.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][0]).toBe(`/api/v1/vulnerabilities/${vulnerability.id}`);
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('DELETE');
  });

  it('previews report as plain text and exposes an authenticated download URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(envelope([report])))
      .mockResolvedValueOnce(new Response('# 安全报告\n正文', { status: 200 }))
      .mockResolvedValueOnce(json(envelope([{
        ...report,
        first_viewed_at: '2026-07-23T08:05:00Z',
      }])));
    vi.stubGlobal('fetch', fetchMock);
    const interaction = userEvent.setup();
    renderPage(<ReportsPage />);
    expect(await screen.findByRole('link', { name: '下载 MD' })).toHaveAttribute(
      'href', '/api/v1/reports/44444444-4444-4444-8444-444444444444/download',
    );
    await interaction.click(screen.getByRole('button', { name: '预览' }));
    expect(await screen.findByText(/# 安全报告/)).toBeInTheDocument();
    expect(await screen.findByText('待导出', { selector: '.ant-tag' })).toBeInTheDocument();
  });

  it('groups three generated formats under one task row', async () => {
    const taskId = '66666666-6666-4666-8666-666666666666';
    const reports = [
      { ...report, task_id: taskId, task_name: '三格式任务', filename: 'bundle.md', format: 'md' },
      { ...report, id: '77777777-7777-4777-8777-777777777777', task_id: taskId, task_name: '三格式任务', filename: 'bundle.docx', format: 'docx' },
      { ...report, id: '88888888-8888-4888-8888-888888888888', task_id: taskId, task_name: '三格式任务', filename: 'bundle.pdf', format: 'pdf' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json(envelope(reports))));

    renderPage(<ReportsPage />);

    expect(await screen.findAllByText('三格式任务')).toHaveLength(1);
    expect(screen.getByRole('link', { name: '下载 MD' })).toHaveAttribute(
      'href', '/api/v1/reports/44444444-4444-4444-8444-444444444444/download',
    );
    expect(screen.getByRole('link', { name: '下载 DOCX' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '下载 PDF' })).toBeInTheDocument();
  });

  it('loads export history from the URL and shows the report lifecycle', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(envelope([{
      ...report,
      first_viewed_at: '2026-07-23T08:05:00Z',
      first_exported_at: '2026-07-23T08:10:00Z',
    }])));
    vi.stubGlobal('fetch', fetchMock);

    renderPage(<ReportsPage />, '/reports?status=EXPORTED');

    expect(await screen.findByText('已导出', { selector: '.ant-tag' })).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toContain('status=EXPORTED');
  });
});
