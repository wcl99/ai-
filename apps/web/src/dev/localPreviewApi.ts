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

const previewVulnerabilityId = '00000000-0000-4000-8000-000000000139';
type PreviewAction = { action: string; value: unknown; actor: string; created_at: string };
type PreviewComment = { author: string; text: string; created_at: string };
type PreviewData = Record<string, unknown> & {
  manual_retest: boolean;
  assignee_name: string | null;
  report_status: string;
  favorite: boolean;
  ticket_id?: string;
  resolution?: string;
  action_history: PreviewAction[];
  comments: PreviewComment[];
};
type PreviewVulnerability = {
  id: string;
  plan_id: string;
  task_id: string;
  asset_key: string;
  title: string;
  severity: string;
  status: string;
  description: string;
  created_at: string;
  updated_at: string;
  task_name: string;
  tags: string[];
  data_json: PreviewData;
};

const initialPreviewVulnerability: PreviewVulnerability = {
  id: previewVulnerabilityId,
  plan_id: planId,
  task_id: sessionId,
  asset_key: 'http://139.198.31.136:81',
  title: 'HTTP方法滥用导致越权修改与权限提升 (BOLA + Mass Assignment)',
  severity: 'critical',
  status: 'OPEN',
  description: 'PUT /api/user接口仅校验登录token存在性，未校验资源归属和操作权限。任意登录用户可通过指定任意id修改其他用户资料，并可通过修改role字段实现权限提升。',
  created_at: '2026-08-09T21:27:29Z',
  updated_at: now,
  task_name: '139.198.31.136:81渗透测试',
  tags: ['BOLA', 'Mass Assignment', '越权访问', '建议人工复测'],
  data_json: {
    source_tool: 'AI渗透测试',
    http_url: 'http://139.198.31.136:81/api/user',
    http_method: 'PUT',
    payload: 'PUT /api/user {"id":5,"username":"adminsc","nickName":"HACKED_BY_NORMAL_USER","sex":"男","address":"武汉","phone":"18672191141","role":1}',
    http_request: 'GET http://139.198.31.136:81/ HTTP/1.1\nHost: 139.198.31.136:81\nProxy-Connection: Keep-Alive\nReferer: http://139.198.31.136:81/\nX-Requested-With: XMLHttpRequest\nAccept: application/json, text/plain, */*\nUser-Agent: Mozilla/5.0',
    http_response: 'HTTP/1.1 200 OK\nServer: nginx/1.31.3\nContent-Type: text/html\nConnection: keep-alive\n\n<!DOCTYPE html><html><head><title>vue_demo</title></head><body><div id="app"></div></body></html>',
    ai_risk_summary: '普通登录用户能够修改任意用户资料，并可篡改 role 字段将自身提升为管理员。该问题同时具备对象级越权与批量赋值特征，可能导致管理员账户接管、权限体系失效和业务数据被未授权修改，应优先修复并安排人工复测。',
    analysis: '通过MITM代理测试并注册普通用户获取真实token。使用普通用户token调用PUT /api/user修改管理员用户id=5的资料，接口返回成功，随后查询确认修改生效；将自身role从0改为1同样成功。',
    vuln_suggestions: '1) 在PUT /api/user接口中校验当前登录用户与目标id是否一致，或校验操作权限；2) 服务端忽略客户端提交的role等敏感字段，仅允许修改白名单字段；3) 对管理操作增加角色权限校验。',
    cvss_score: 9.8,
    manual_retest: true,
    assignee_name: null,
    team_name: '安全运营组',
    business_name: '图书管理系统',
    report_status: '未加入报告',
    favorite: false,
    action_history: [],
    comments: [],
  },
};

let previewVulnerability = structuredClone(initialPreviewVulnerability);
const vulnerabilities = [previewVulnerability];

function vulnerabilityDetail() {
  return Object.fromEntries(
    Object.entries(previewVulnerability).filter(([key]) => key !== 'task_name' && key !== 'tags'),
  );
}

export function resetLocalPreviewVulnerability() {
  previewVulnerability = structuredClone(initialPreviewVulnerability);
  vulnerabilities[0] = previewVulnerability;
}

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
    warnings: ['当前有 1 个未关闭的严重漏洞。'],
    priority_findings: ['优先处置越权修改与权限提升漏洞。'],
    remediation: ['完成接口鉴权与字段白名单修复后安排人工复测。'],
    source: 'fallback',
  },
  risk_trend: Array.from({ length: 7 }, (_, index) => ({
    start: `2026-08-${String(13 + index).padStart(2, '0')}`,
    critical: index === 6 ? 1 : 0,
    high: 0,
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
    critical: 1,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
    open: 1,
    retesting: 0,
    fixed: 0,
  },
  risk_distribution: [
    { key: 'critical', label: '严重', count: 1 },
    { key: 'high', label: '高危', count: 0 },
    { key: 'medium', label: '中危', count: 0 },
    { key: 'low', label: '低危', count: 0 },
  ],
  source_distribution: [{ key: 'ai_pentest', label: 'AI渗透测试', count: 1 }],
  trend: dashboardSummary.risk_trend.map(({ start, high }) => ({ start, count: high })),
  recommendations: ['优先修复 /api/user 的对象级鉴权与敏感字段批量赋值问题。'],
};

export type LocalPreviewResponse = { status: number; body: unknown };

export function getLocalPreviewResponse(rawUrl: string, method = 'GET', requestBody?: Record<string, unknown>): LocalPreviewResponse | null {
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
    const listItems = vulnerabilities.map((item) => Object.fromEntries(
      Object.entries(item).filter(([key]) => key !== 'data_json'),
    ));
    return envelope({ items: listItems, total: listItems.length, page: 1, page_size: 20 });
  }
  if (path === '/api/v1/assets') {
    return envelope({ items: assets, total: assets.length, page: 1, page_size: 1 });
  }
  if (path === '/api/v1/reports') {
    return envelope({ items: reports, total: reports.length, page: 1, page_size: 1 });
  }
  if (path === '/api/v1/dashboard/summary') return envelope(dashboardSummary);
  if (path === '/api/v1/vulnerabilities/overview') return envelope(vulnerabilityOverview);
  if (path === `/api/v1/vulnerabilities/${previewVulnerabilityId}` && method === 'GET') {
    return { status: 200, body: vulnerabilityDetail() };
  }
  if (path === `/api/v1/vulnerabilities/${previewVulnerabilityId}` && method === 'PATCH') {
    if (typeof requestBody?.status === 'string') previewVulnerability.status = requestBody.status;
    previewVulnerability.updated_at = new Date().toISOString();
    return { status: 200, body: vulnerabilityDetail() };
  }
  if (path === `/api/v1/vulnerabilities/${previewVulnerabilityId}/actions` && method === 'POST') {
    const action = typeof requestBody?.action === 'string' ? requestBody.action : '';
    const value = requestBody?.value;
    const data = previewVulnerability.data_json;
    if (action === 'favorite') data.favorite = value === true;
    if (action === 'assign') data.assignee_name = typeof value === 'string' ? value : null;
    if (action === 'retest') { previewVulnerability.status = 'RETESTING'; data.manual_retest = true; }
    if (action === 'add_report') data.report_status = '已加入报告';
    if (action === 'create_ticket') data.ticket_id = `TICKET-${previewVulnerabilityId.slice(-3)}`;
    if (action === 'ignore') { previewVulnerability.status = 'FIXED'; data.resolution = 'ignored'; }
    if (action === 'false_positive') { previewVulnerability.status = 'FIXED'; data.resolution = 'false_positive'; }
    const createdAt = new Date().toISOString();
    if (action === 'comment' && typeof value === 'string' && value.trim()) {
      data.comments.push({ author: '本地管理员', text: value.trim(), created_at: createdAt });
    }
    data.action_history.push({ action, value, actor: '本地管理员', created_at: createdAt });
    previewVulnerability.updated_at = createdAt;
    return { status: 200, body: vulnerabilityDetail() };
  }
  return null;
}
