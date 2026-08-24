const sessionId = 'f8da37dc-6205-4f22-a2ca-1756cc142a19';
const planId = '11111111-1111-4111-8111-111111111111';
const now = '2026-08-19T08:10:00Z';

const taskNames = [
  'anshun12345.com渗透测试',
  'chinaunicomglobal.com渗透测试',
  'example.com渗透测试',
  'test.company.com渗透测试',
  'vuln-test.com渗透测试',
  'portal.example.com渗透测试',
  'api.example.com渗透测试',
  'internal.example.com渗透测试',
];

const targets = [
  'anshun12345.com',
  'chinaunicomglobal.com',
  '198.51.100.50',
  '192.168.2.20',
  '192.168.3.30',
  'portal.example.com',
  'api.example.com',
  '10.0.0.9',
];

const tasks = taskNames.map((name, index) => {
  const status = index < 2 ? 'RUNNING' : index === 4 ? 'FAILED' : 'SUCCEEDED';
  return {
    id: index === 0 ? sessionId : `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    plan_id: planId,
    parent_id: null,
    external_task_id: `preview-task-${index + 1}`,
    name,
    status,
    phase: status === 'RUNNING' ? (index === 0 ? 'VULNERABILITY_SCANNING' : 'INFORMATION_GATHERING') : 'FINISHED',
    progress: status === 'RUNNING' ? (index === 0 ? 66 : 40) : 100,
    sync_failures: 0,
    error_code: status === 'FAILED' ? 'SCAN_INTERRUPTED' : null,
    error_message: status === 'FAILED' ? '目标连接不稳定，等待重新执行' : null,
    created_at: '2026-08-19T07:30:00Z',
    updated_at: now,
    plan_name: name,
    test_type: 'standard',
    targets: [targets[index]],
    created_by_name: '本地管理员',
  };
});

const tools = [
  {
    id: 1,
    phase: 'INFORMATION_GATHERING',
    toolName: 'list_domain_by_company',
    success: true,
    executionTime: '2026-08-19T07:42:00Z',
    duration: 1.2,
    arguments: { company: 'anshun12345.com' },
    result: { status: 'success', data: ['www.anshun12345.com', 'api.anshun12345.com'], count: 2 },
  },
  {
    id: 2,
    phase: 'INFORMATION_GATHERING',
    toolName: 'run_subfinder',
    success: true,
    executionTime: '2026-08-19T07:48:00Z',
    duration: 6.1,
    arguments: { domain: 'anshun12345.com' },
    result: { status: 'success', data: ['mail.anshun12345.com', 'admin.anshun12345.com'], count: 2 },
  },
  {
    id: 3,
    phase: 'VULNERABILITY_SCANNING',
    toolName: 'httpx_probe',
    success: true,
    executionTime: '2026-08-19T07:56:00Z',
    duration: 4.8,
    arguments: { targets: ['www.anshun12345.com', 'api.anshun12345.com'] },
    result: { status: 'success', data: [{ url: 'https://www.anshun12345.com', status_code: 200 }] },
  },
  {
    id: 4,
    phase: 'VULNERABILITY_SCANNING',
    toolName: 'get_emails',
    executionTime: '2026-08-19T08:06:00Z',
    arguments: { domain: 'anshun12345.com' },
    result: { status: 'running', data: ['admin@anshun12345.com', 'support@anshun12345.com'] },
  },
];

const vulnerabilities = [{
  id: '33333333-3333-4333-8333-333333333333',
  plan_id: planId,
  task_id: sessionId,
  asset_key: 'https://www.anshun12345.com',
  title: '后台登录接口存在弱口令风险',
  severity: 'high',
  status: 'OPEN',
  description: '登录接口缺少有效的口令强度与尝试次数限制。',
  created_at: '2026-08-19T08:02:00Z',
  updated_at: now,
  task_name: taskNames[0],
  tags: ['身份认证', '待复测'],
}];

const assets = [{
  id: '44444444-4444-4444-8444-444444444444',
  plan_id: planId,
  asset_key: 'https://www.anshun12345.com',
  asset_type: 'domain',
  address: 'anshun12345.com',
  service: 'HTTPS',
  owner: '本地管理员',
  authorized: true,
  data_json: {},
  created_at: '2026-08-19T07:30:00Z',
  updated_at: now,
}];

const reports = [{
  id: '55555555-5555-4555-8555-555555555555',
  plan_id: planId,
  task_id: sessionId,
  filename: 'anshun12345.com渗透测试报告.docx',
  format: 'docx',
  report_level: 'penetration',
  status: 'READY',
  external_url: null,
  first_viewed_at: null,
  first_viewed_by: null,
  first_exported_at: null,
  first_exported_by: null,
  created_at: now,
  plan_name: taskNames[0],
  task_name: taskNames[0],
}];

const dashboardSummary = {
  metrics: {
    assets: assets.length,
    tasks: tasks.length,
    running_tasks: 2,
    failed_tasks: 1,
    high_risk: 1,
    vulnerabilities: vulnerabilities.length,
    open_vulnerabilities: vulnerabilities.length,
    reports: reports.length,
  },
  ai_summary: {
    warnings: ['当前有 1 个未关闭漏洞。'],
    priority_findings: ['优先检查 1 个异常任务及 1 个严重或高危漏洞。'],
    remediation: ['优先处置高危漏洞，完成修复后安排复测。'],
    source: 'fallback',
  },
  risk_trend: Array.from({ length: 7 }, (_, index) => ({
    start: `2026-08-${String(13 + index).padStart(2, '0')}`,
    critical: 0,
    high: index === 6 ? 1 : 0,
    medium: 0,
    low: 0,
  })),
};

const vulnerabilityOverview = {
  range: 'all',
  timezone: 'Asia/Shanghai',
  granularity: 'day',
  metrics: {
    total: 1,
    critical: 0,
    high: 1,
    medium: 0,
    low: 0,
    unknown: 0,
    open: 1,
    retesting: 0,
    fixed: 0,
  },
  risk_distribution: [
    { key: 'critical', label: '严重', count: 0 },
    { key: 'high', label: '高危', count: 1 },
    { key: 'medium', label: '中危', count: 0 },
    { key: 'low', label: '低危', count: 0 },
  ],
  source_distribution: [{ key: 'httpx_probe', label: 'httpx_probe', count: 1 }],
  trend: dashboardSummary.risk_trend.map(({ start, high }) => ({ start, count: high })),
  recommendations: ['优先修复后台登录接口弱口令风险。'],
};

export type LocalPreviewResponse = { status: number; body: unknown };

export function getLocalPreviewResponse(rawUrl: string): LocalPreviewResponse | null {
  const url = new URL(rawUrl, 'http://localhost');
  const path = url.pathname;
  const envelope = (data: unknown): LocalPreviewResponse => ({
    status: 200,
    body: { success: true, message: 'ok', data },
  });

  if (path === `/api/v1/tasks/${sessionId}`) {
    const task: Record<string, unknown> = { ...tasks[0] };
    delete task.plan_name;
    delete task.test_type;
    delete task.targets;
    delete task.created_by_name;
    return { status: 200, body: task };
  }
  if (path === `/api/v1/tasks/${sessionId}/children`) return envelope([]);
  if (path === `/api/v1/tasks/${sessionId}/tools`) return envelope(tools);
  if (path === `/api/v1/tasks/${sessionId}/qa/messages`) return envelope([]);
  if (path === '/api/v1/tasks') {
    const keyword = (url.searchParams.get('keyword') ?? '').toLowerCase();
    const page = Number(url.searchParams.get('page') ?? 1);
    const pageSize = Number(url.searchParams.get('page_size') ?? 7);
    const filtered = tasks.filter((task) => (
      task.name.toLowerCase().includes(keyword) || task.targets.some((target) => target.toLowerCase().includes(keyword))
    ));
    const start = (page - 1) * pageSize;
    return envelope({
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      page_size: pageSize,
      metrics: { total: 24, queued: 0, running: 8, completed: 16, failed: 1, cancelled: 0 },
    });
  }
  if (path === '/api/v1/vulnerabilities') {
    return envelope({ items: vulnerabilities, total: 1, page: 1, page_size: 20 });
  }
  if (path === '/api/v1/assets') {
    return envelope({ items: assets, total: assets.length, page: 1, page_size: 1 });
  }
  if (path === '/api/v1/reports') {
    return envelope({ items: reports, total: reports.length, page: 1, page_size: 1 });
  }
  if (path === '/api/v1/dashboard/summary') return envelope(dashboardSummary);
  if (path === '/api/v1/vulnerabilities/overview') return envelope(vulnerabilityOverview);
  if (path === `/api/v1/vulnerabilities/${vulnerabilities[0].id}`) {
    const vulnerability = vulnerabilities[0];
    const item: Record<string, unknown> = { ...vulnerability };
    delete item.task_name;
    delete item.tags;
    return {
      status: 200,
      body: {
        ...item,
        data_json: {
          source_tool: 'httpx_probe',
          http_url: vulnerability.asset_key,
          vuln_suggestions: '启用强口令策略、登录限速和多因素认证，并完成复测。',
          cvss_score: 8.1,
        },
      },
    };
  }
  return null;
}
