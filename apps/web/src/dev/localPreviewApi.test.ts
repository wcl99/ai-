import { describe, expect, it } from 'vitest';
import { getLocalPreviewResponse } from './localPreviewApi';

describe('local preview API', () => {
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
      data: { metrics: { assets: 1, vulnerabilities: 1 }, ai_summary: { source: 'fallback' } },
    });
    expect(assets?.status).toBe(200);
    expect(reports?.status).toBe(200);
    expect(overview?.body).toMatchObject({ success: true, data: { metrics: { total: 1, high: 1 } } });
  });
});
