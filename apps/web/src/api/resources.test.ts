import {
  createUser,
  createAsset,
  getVulnerability,
  getReportOverview,
  getVulnerabilityOverview,
  getOrganization,
  getRuntimeSettings,
  listAuditLogs,
  listAssets,
  listReports,
  listTasks,
  listUsers,
  listVulnerabilities,
  previewReport,
  reportDownloadUrl,
  updateOrganization,
  updateUser,
  updateVulnerability,
} from './resources';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function page(items: unknown[]) {
  return { success: true, message: 'ok', data: { items, total: items.length, page: 1, page_size: 20 } };
}

describe('resource API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('maps backend AI risk summary and remediation into vulnerability detail', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      id,
      plan_id: '22222222-2222-4222-8222-222222222222',
      task_id: null,
      asset_key: 'demo.example.com',
      title: 'SQL 注入漏洞',
      severity: 'critical',
      status: 'OPEN',
      description: '基础漏洞描述',
      created_at: '2026-08-24T09:12:00Z',
      updated_at: '2026-08-24T09:12:00Z',
      data_json: { ai_risk_summary: 'AI 分析确认存在数据库越权风险', vuln_suggestions: '使用参数化查询并限制数据库权限' },
    })));

    const detail = await getVulnerability(id);

    expect(detail.aiRiskSummary).toBe('AI 分析确认存在数据库越权风险');
    expect(detail.remediation).toBe('使用参数化查询并限制数据库权限');
  });

  it('maps overview analytics and sends the selected range and timezone', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, message: 'ok', data: {
        range: 'today', timezone: 'Asia/Shanghai', granularity: 'hour',
        metrics: { total: 3, critical: 1, high: 1, medium: 1, low: 0, unknown: 0, open: 2, retesting: 1, fixed: 0 },
        risk_distribution: [{ key: 'high', label: '高危', count: 1 }],
        source_distribution: [{ key: 'xiaoyi', label: '小易回传', count: 3 }],
        trend: [{ start: '2026-08-11T09:00:00+08:00', count: 2 }],
        recommendations: ['优先修复高危漏洞'],
      }}))
      .mockResolvedValueOnce(jsonResponse({ success: true, message: 'ok', data: {
        range: '7d', timezone: 'Asia/Shanghai', granularity: 'day',
        metrics: {
          total: { value: 5, change_percent: null },
          monthly_new: { value: 3, change_percent: 50 },
          pending_export: { value: 1, change_percent: null },
          exported: { value: 4, change_percent: null },
          pending_confirmation: { value: 2, change_percent: null },
          monthly_delivered: { value: 2, change_percent: 100 },
        },
        source_distribution: [{ key: 'penetration', label: '渗透测试', count: 5 }],
        risk_distribution: [{ key: 'high', label: '高危', count: 2 }],
        trend: [{ start: '2026-08-11T00:00:00+08:00', count: 2 }],
        latest_reports: [{
          id: '11111111-1111-4111-8111-111111111111', filename: 'report.pdf',
          source: 'penetration', source_label: '渗透测试', creator_name: '张安全',
          created_at: '2026-08-11T01:00:00Z',
        }],
        recent_exports: [{
          id: '11111111-1111-4111-8111-111111111111', filename: 'report.pdf',
          source: 'penetration', source_label: '渗透测试', format: 'pdf',
          exporter_name: '张安全', status: 'DELIVERED', exported_at: '2026-08-11T02:00:00Z',
        }],
        insights: ['本月新增 3 份报告'],
      }}));
    vi.stubGlobal('fetch', fetchMock);

    const vulnerabilities = await getVulnerabilityOverview({ range: 'today', timezone: 'Asia/Shanghai' });
    const reports = await getReportOverview({ range: '7d', timezone: 'Asia/Shanghai' });

    expect(vulnerabilities).toMatchObject({
      range: 'today', riskDistribution: [{ key: 'high', label: '高危', count: 1 }],
      sourceDistribution: [{ key: 'xiaoyi', label: '小易回传', count: 3 }],
    });
    expect(reports).toMatchObject({
      metrics: { monthlyNew: { value: 3, changePercent: 50 }, pendingConfirmation: { value: 2 } },
      riskDistribution: [{ key: 'high', label: '高危', count: 2 }],
      latestReports: [{ filename: 'report.pdf', creatorName: '张安全' }],
      recentExports: [{ filename: 'report.pdf', exporterName: '张安全' }],
    });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/vulnerabilities/overview?range=today&timezone=Asia%2FShanghai');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/reports/overview?range=7d&timezone=Asia%2FShanghai');
  });

  it('maps confirmed task fields without inventing display data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(page([{
      id: '11111111-1111-4111-8111-111111111111',
      plan_id: '22222222-2222-4222-8222-222222222222',
      parent_id: null,
      external_task_id: null,
      name: '真实任务',
      status: 'RUNNING',
      phase: 'scanning',
      progress: 42,
      sync_failures: 0,
      error_code: null,
      error_message: null,
      created_at: '2026-07-23T08:00:00Z',
      updated_at: '2026-07-23T08:01:00Z',
      plan_name: '授权计划',
      test_type: 'standard',
      targets: ['example.com'],
      created_by_name: '管理员',
    }]))));

    const result = await listTasks({ status: 'RUNNING', keyword: '真实', testType: 'standard', creator: '管理员', createdFrom: '2026-07-01T00:00:00Z', createdTo: '2026-07-31T23:59:59Z', page: 1, pageSize: 20 });

    expect(result.items[0]).toEqual(expect.objectContaining({
      name: '真实任务', status: '进行中', statusCode: 'RUNNING', target: 'example.com', creator: '管理员',
      updatedAt: '2026-07-23T08:01:00Z',
    }));
    expect(result.items[0]).not.toHaveProperty('priority');
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/tasks?status=RUNNING&keyword=%E7%9C%9F%E5%AE%9E&test_type=standard&creator=%E7%AE%A1%E7%90%86%E5%91%98&created_from=2026-07-01T00%3A00%3A00Z&created_to=2026-07-31T23%3A59%3A59Z&page=1&page_size=20',
      expect.any(Object),
    );
  });

  it('does not classify an unknown task status as a confirmed failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(page([{
      id: '11111111-1111-4111-8111-111111111111',
      plan_id: '22222222-2222-4222-8222-222222222222',
      parent_id: null,
      external_task_id: null,
      name: '新状态任务',
      status: 'NEW_ENGINE_STATUS',
      phase: '',
      progress: 0,
      sync_failures: 0,
      error_code: null,
      error_message: null,
      created_at: '2026-07-23T08:00:00Z',
      updated_at: '2026-07-23T08:01:00Z',
      plan_name: '授权计划',
      test_type: 'standard',
      targets: [],
      created_by_name: '管理员',
    }]))));

    const result = await listTasks({ page: 1, pageSize: 20 });

    expect(result.items[0].status).toBe('未知');
  });

  it('maps asset, vulnerability, and report pages from server fields', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(page([{
        id: '33333333-3333-4333-8333-333333333333', plan_id: null, asset_key: 'example.com',
        asset_type: 'domain', address: 'example.com', service: 'HTTPS', owner: null,
        authorized: true, data_json: { tags: ['公网'] }, created_at: '2026-07-23T08:00:00Z', updated_at: '2026-07-23T08:00:00Z',
      }])))
      .mockResolvedValueOnce(jsonResponse(page([{
        id: '44444444-4444-4444-8444-444444444444', plan_id: '22222222-2222-4222-8222-222222222222', task_id: null,
        asset_key: 'example.com', title: '真实漏洞', severity: 'high', status: 'OPEN', description: null,
        created_at: '2026-07-23T08:00:00Z', updated_at: '2026-07-23T08:00:00Z', task_name: null, tags: ['Web'],
      }])))
      .mockResolvedValueOnce(jsonResponse(page([{
        id: '55555555-5555-4555-8555-555555555555', plan_id: '22222222-2222-4222-8222-222222222222', task_id: null,
        filename: '真实报告.md', format: 'md', report_level: null, external_url: null, status: 'READY',
        created_at: '2026-07-23T08:00:00Z', plan_name: '授权计划', task_name: null,
      }])));
    vi.stubGlobal('fetch', fetchMock);

    const asset = (await listAssets({ page: 1, pageSize: 20 })).items[0];
    const vulnerability = (await listVulnerabilities({ severity: 'high', page: 1, pageSize: 20 })).items[0];
    const report = (await listReports({ page: 1, pageSize: 20 })).items[0];

    expect(asset).toMatchObject({ address: 'example.com', authorized: true, tags: ['公网'] });
    expect(asset).not.toHaveProperty('risk');
    expect(vulnerability).toMatchObject({ title: '真实漏洞', severity: '高危', status: '待修复' });
    expect(report).toMatchObject({ name: '真实报告.md', format: 'md', plan: '授权计划', previewSupported: true });
    expect(report).not.toHaveProperty('risks');
  });

  it('sends exact supported mutation payloads and exposes report actions', async () => {
    const asset = {
      id: '33333333-3333-4333-8333-333333333333', plan_id: null, asset_key: 'new.example.com', asset_type: 'domain',
      address: 'new.example.com', service: null, owner: '业务线', authorized: true, data_json: {},
      created_at: '2026-07-23T08:00:00Z', updated_at: '2026-07-23T08:00:00Z',
    };
    const vulnerability = {
      id: '44444444-4444-4444-8444-444444444444', plan_id: '22222222-2222-4222-8222-222222222222', task_id: null,
      asset_key: null, title: '漏洞', severity: 'low', status: 'FIXED', description: null, data_json: {},
      created_at: '2026-07-23T08:00:00Z', updated_at: '2026-07-23T08:00:00Z',
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(asset, 201))
      .mockResolvedValueOnce(jsonResponse(vulnerability))
      .mockResolvedValueOnce(new Response('plain report', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await createAsset({ asset_type: 'domain', address: 'new.example.com', owner: '业务线', authorized: true });
    await updateVulnerability(vulnerability.id, 'FIXED');
    await expect(previewReport('55555555-5555-4555-8555-555555555555')).resolves.toBe('plain report');

    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      asset_type: 'domain', address: 'new.example.com', owner: '业务线', authorized: true,
    });
    expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({ status: 'FIXED' });
    expect(reportDownloadUrl('55555555-5555-4555-8555-555555555555')).toBe(
      '/api/v1/reports/55555555-5555-4555-8555-555555555555/download',
    );
  });

  it('uses the existing management endpoints and validates their payloads', async () => {
    const organization = {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Cloud Shield Lab',
      created_at: '2026-08-10T08:00:00Z',
      updated_at: '2026-08-10T08:00:00Z',
    };
    const runtime = {
      app_name: 'AI Security Platform', engine_mode: 'xiaoyi', engine_configured: true,
      engine_retry_limit: 3, sync_interval_seconds: 5, report_storage: 'local',
    };
    const member = {
      id: '11111111-1111-4111-8111-111111111111', org_id: organization.id,
      username: 'operator.lin', name: 'Lin Wei', role: 'operator', is_active: true,
      is_digital_human: false,
    };
    const audit = {
      id: '33333333-3333-4333-8333-333333333333', actor_id: member.id,
      action: 'user.create', resource_type: 'user', resource_id: member.id,
      outcome: 'success', details_json: {}, created_at: '2026-08-10T08:05:00Z',
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(organization))
      .mockResolvedValueOnce(jsonResponse({ success: true, message: 'ok', data: runtime }))
      .mockResolvedValueOnce(jsonResponse(page([member])))
      .mockResolvedValueOnce(jsonResponse(member, 201))
      .mockResolvedValueOnce(jsonResponse({ ...member, role: 'auditor' }))
      .mockResolvedValueOnce(jsonResponse({ ...organization, name: 'Cloud Shield Operations' }))
      .mockResolvedValueOnce(jsonResponse(page([audit])));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getOrganization()).resolves.toEqual(organization);
    await expect(getRuntimeSettings()).resolves.toEqual(runtime);
    await expect(listUsers({ page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1 });
    await createUser({ username: 'operator.lin', name: 'Lin Wei', password: 'simple-pass', role: 'operator', is_digital_human: false });
    await updateUser(member.id, { role: 'auditor' });
    await updateOrganization('Cloud Shield Operations');
    await expect(listAuditLogs({ action: 'user.create', resourceType: 'user', page: 1, pageSize: 20 })).resolves.toMatchObject({ total: 1 });

    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      '/api/v1/settings/organization',
      '/api/v1/settings/runtime',
      '/api/v1/users?page=1&page_size=20',
      '/api/v1/users',
      `/api/v1/users/${member.id}`,
      '/api/v1/settings/organization',
      '/api/v1/audit-logs?action=user.create&resource_type=user&page=1&page_size=20',
    ]);
  });
});
