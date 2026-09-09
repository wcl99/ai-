import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { VulnerabilityRepairTrend, buildRemediationQueue, limitOverviewRows, mapVulnerabilitySourceDistribution, vulnerabilityMetricComparison } from './OverviewPages';
import type { VulnerabilityRecord } from '../types';

describe('vulnerability overview material contracts', () => {
  it('limits both overview vulnerability lists to five rows', () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({ id: String(index) })) as VulnerabilityRecord[];
    expect(limitOverviewRows(rows)).toHaveLength(5);
    expect(limitOverviewRows(rows).map((row) => row.id)).toEqual(['0', '1', '2', '3', '4']);
  });

  it('does not fabricate a metric comparison when the API provides none', () => {
    expect(vulnerabilityMetricComparison()).toBe('暂无对比');
  });

  it('maps server overview data without replacing it with fixed demo totals', async () => {
    const { buildVulnerabilityOverviewView } = await import('./OverviewPages');
    const result = buildVulnerabilityOverviewView({
      range: '7d', timezone: 'Asia/Shanghai', granularity: 'day',
      metrics: { total: 3, critical: 1, high: 1, medium: 1, low: 0, unknown: 0, open: 2, retesting: 0, fixed: 1 },
      riskDistribution: [], sourceDistribution: [], trend: [], recommendations: [],
    }, []);
    expect(result.metrics.total).toBe(3);
    expect(result.metrics.high).toBe(1);
    expect(result.repairPercent).toBe(33);
    expect(result.rows).toEqual([]);
  });
  it('prioritizes open critical findings before newer lower-severity findings', () => {
    const make = (id: string, severity: VulnerabilityRecord['severity'], statusCode: VulnerabilityRecord['statusCode'], updatedAt: string): VulnerabilityRecord => ({ id, title: id, severity, status: statusCode === 'FIXED' ? '已修复' : '待修复', statusCode, asset: 'api.example.com', task: 'scan', discoveredAt: updatedAt, updatedAt, tags: [], description: null });
    expect(buildRemediationQueue([
      make('medium-new', '中危', 'OPEN', '2026-08-29T12:00:00Z'),
      make('critical-old', '严重', 'OPEN', '2026-08-01T12:00:00Z'),
      make('fixed-critical', '严重', 'FIXED', '2026-08-29T13:00:00Z'),
    ]).map((row) => row.id)).toEqual(['critical-old', 'medium-new']);
  });
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
