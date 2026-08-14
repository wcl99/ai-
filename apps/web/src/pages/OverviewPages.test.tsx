import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VulnerabilityRepairTrend, mapVulnerabilitySourceDistribution } from './OverviewPages';

describe('vulnerability overview material contracts', () => {
  it('maps technical vulnerability sources to material modules', () => {
    expect(mapVulnerabilitySourceDistribution([
      { key: 'scan_smart_retest_result_detail', label: 'scan_smart_retest_result_detail', count: 10 },
      { key: 'xiaoyi', label: '平台回传', count: 4 },
      { key: 'demo', label: '演示数据导入', count: 3 },
      { key: 'pentest', label: '渗透测试', count: 2 },
    ])).toEqual([
      { key: 'ai-vulnerability-scan', label: 'AI漏洞扫描', count: 17 },
      { key: 'ai-pentest', label: 'AI渗透测试', count: 2 },
    ]);
  });

  it('keeps unknown sources in a truthful fallback module', () => {
    expect(mapVulnerabilitySourceDistribution([{ key: 'custom', label: '自定义来源', count: 2 }])).toEqual([
      { key: 'other', label: '其他来源', count: 2 },
    ]);
  });

  it('renders repair trend as bars', () => {
    const markup = renderToStaticMarkup(<VulnerabilityRepairTrend points={[{ start: '2026-08-14', count: 4 }]} granularity="day" />);
    expect(markup).toContain('data-chart-kind="bar"');
    expect(markup).not.toContain('vulnerability-line');
  });
});
