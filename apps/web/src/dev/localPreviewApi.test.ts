import { describe, expect, it } from 'vitest';
import { getLocalPreviewResponse, resetLocalPreviewVulnerability } from './localPreviewApi';

describe('local preview API', () => {
  beforeEach(() => resetLocalPreviewVulnerability());
  it('serves the current session and seven-task global monitor', () => {
    const task = getLocalPreviewResponse(
      '/api/v1/tasks/f8da37dc-6205-4f22-a2ca-1756cc142a19',
    );
    const tasks = getLocalPreviewResponse('/api/v1/tasks?page=1&page_size=7');
    const tools = getLocalPreviewResponse(
      '/api/v1/tasks/f8da37dc-6205-4f22-a2ca-1756cc142a19/tools',
    );

    expect(task?.status).toBe(200);
    expect(task?.body).toMatchObject({
      id: 'f8da37dc-6205-4f22-a2ca-1756cc142a19',
      name: 'anshun12345.com渗透测试',
    });
    expect(tasks?.body).toMatchObject({
      success: true,
      data: { total: 8, page_size: 7 },
    });
    expect((tasks?.body as { data: { items: unknown[] } }).data.items).toHaveLength(7);
    const toolData = (tools?.body as { data: Array<{ toolName: string }> }).data;
    expect(toolData).toHaveLength(4);
    expect(toolData[0]).toMatchObject({ toolName: 'list_domain_by_company' });
  });

  it('serves all dashboard data locally without falling through to the API proxy', () => {
    const summary = getLocalPreviewResponse('/api/v1/dashboard/summary');
    const overview = getLocalPreviewResponse('/api/v1/vulnerabilities/overview?range=all&timezone=Asia%2FShanghai');
    const assets = getLocalPreviewResponse('/api/v1/assets?page=1&page_size=1');
    const reports = getLocalPreviewResponse('/api/v1/reports?page=1&page_size=1');

    expect(summary?.status).toBe(200);
    expect(summary?.body).toMatchObject({
      success: true,
      data: { metrics: { assets: 1, vulnerabilities: 1, high_risk: 1 }, ai_summary: { source: 'fallback' } },
    });
    expect(assets?.status).toBe(200);
    expect(reports?.status).toBe(200);
    expect(overview?.body).toMatchObject({ success: true, data: { metrics: { total: 1, critical: 1 } } });
  });

  it('serves a real vulnerability from the acceptance data with full detail evidence', () => {
    const response = getLocalPreviewResponse('/api/v1/vulnerabilities?page=1&page_size=20');
    const detail = getLocalPreviewResponse('/api/v1/vulnerabilities/00000000-0000-4000-8000-000000000139');

    expect(response?.body).toMatchObject({
      success: true,
      data: {
        total: 1,
        items: [{
          id: '00000000-0000-4000-8000-000000000139',
          title: 'HTTP方法滥用导致越权修改与权限提升 (BOLA + Mass Assignment)',
          severity: 'critical',
        }],
      },
    });
    expect(detail?.body).toMatchObject({
      id: '00000000-0000-4000-8000-000000000139',
      data_json: {
        http_url: 'http://139.198.31.136:81/api/user',
        payload: expect.stringContaining('PUT /api/user'),
        http_request: expect.stringContaining('GET http://139.198.31.136:81/'),
        http_response: expect.stringContaining('HTTP/1.1 200 OK'),
        vuln_suggestions: expect.stringContaining('校验当前登录用户'),
      },
    });
  });

  it('persists local preview actions for interactive acceptance', () => {
    const id = '00000000-0000-4000-8000-000000000139';
    const action = getLocalPreviewResponse(`/api/v1/vulnerabilities/${id}/actions`, 'POST', {
      action: 'comment',
      value: '请安排复测',
    });
    const detail = getLocalPreviewResponse(`/api/v1/vulnerabilities/${id}`);

    expect(action?.status).toBe(200);
    expect(detail?.body).toMatchObject({
      data_json: {
        comments: [{ author: '本地管理员', text: '请安排复测' }],
        action_history: [{ action: 'comment', value: '请安排复测' }],
      },
    });
  });
});
