import { renderToStaticMarkup } from 'react-dom/server';
import { RiskDonut } from '../components/DashboardVisuals';
import { smoothLine } from '../components/dashboardVisualGeometry';
import { dashboardScaleForViewport } from './dashboardScale';
import { DashboardAiSummary, DashboardSummaryCard, DashboardTrendCard, LatestActivityCard, RecentTasksCard, riskOverviewMetrics } from './DashboardPage';

describe('dashboard visual contracts', () => {
  it('renders dashboard data cards as native layouts without material screenshot overlays', () => {
    const trend = renderToStaticMarkup(<DashboardTrendCard values={[]} />);
    const recent = renderToStaticMarkup(<RecentTasksCard tasks={[]} onOpen={() => undefined} onViewAll={() => undefined} />);
    const activity = renderToStaticMarkup(<LatestActivityCard tasks={[]} onOpen={() => undefined} />);

    expect(trend).toContain('dashboard-node-card');
    expect(trend).toContain('dashboard-trend-tabs');
    expect(recent).toContain('dashboard-node-card');
    expect(recent).not.toContain('recent-tasks.png');
    expect(activity).toContain('dashboard-node-card');
    expect(activity).not.toContain('latest-activity.png');
  });

  it('keeps the dashboard in fluid layout mode instead of scaling the canvas', () => {
    expect(dashboardScaleForViewport({ width: 1569, height: 912 })).toBeNull();
  });

  it('keeps fluid layout mode at the narrow desktop breakpoint', () => {
    expect(dashboardScaleForViewport({ width: 1024, height: 912 })).toBeNull();
  });

  it('uses a continuous cubic curve with no hard line joins', () => {
    const path = smoothLine([{ x: 0, y: 20 }, { x: 30, y: 5 }, { x: 60, y: 18 }]);
    expect(path).toMatch(/^M 0 20 C /);
    expect(path.match(/ C /g)).toHaveLength(2);
    expect(path).not.toContain(' L ');
  });

  it('keeps smoothed curve control points inside the chart bounds', () => {
    const path = smoothLine([{ x: 0, y: 180 }, { x: 100, y: 180 }, { x: 200, y: 180 }], { minY: 180, maxY: 180 });
    const numbers = [...path.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
    expect(Math.min(...numbers.filter((_, index) => index % 2 === 1))).toBeGreaterThanOrEqual(180);
  });

  it('renders risk segments as rounded SVG strokes', () => {
    const document = new DOMParser().parseFromString(
      renderToStaticMarkup(<RiskDonut total={12} segments={[{ key: 'high', value: 4, color: '#ff8b32' }, { key: 'other', value: 8, color: '#e9edf5' }]} />),
      'text/html',
    );
    expect(document.querySelectorAll('.risk-donut-segment')).toHaveLength(2);
    expect(document.querySelector('.risk-donut-segment')?.getAttribute('stroke-linecap')).toBe('round');
  });

  it('uses all-time vulnerability overview totals instead of paged-list totals when available', () => {
    expect(riskOverviewMetrics({ metrics: { total: 243, critical: 12, high: 37, medium: 81, low: 113 } }, 132, 18)).toEqual({
      total: 243,
      critical: 12,
      highRisk: 37,
      medium: 81,
      low: 113,
    });
  });

  it('does not invent unavailable severity totals from paged-list fallbacks', () => {
    expect(riskOverviewMetrics(undefined, 12, 4)).toEqual({
      total: 12,
      critical: undefined,
      highRisk: 4,
      medium: undefined,
      low: undefined,
    });
  });

  it('does not expose the AI provider name in the summary card', () => {
    const markup = renderToStaticMarkup(
      <DashboardAiSummary
        summary={{
          warnings: ['当前有 2 个未关闭漏洞'],
          priorityFindings: ['发现 1 个高危漏洞'],
          remediation: ['优先处理高危漏洞'],
        }}
      />,
    );
    expect(markup).not.toContain('DeepSeek');
  });

  it('renders one live summary title instead of relying on material image text', () => {
    const markup = renderToStaticMarkup(<DashboardAiSummary summary={{ warnings: [], priorityFindings: [], remediation: [] }} />);
    expect(markup.match(/AI 今日摘要/g)).toHaveLength(1);
  });

  it('keeps live summary copy in a dedicated content column', () => {
    const markup = renderToStaticMarkup(<DashboardAiSummary summary={{ warnings: ['预警'], priorityFindings: ['发现'], remediation: ['建议'] }} />);
    expect(markup).toContain('dashboard-ai-summary-content');
  });

  it('builds the complete summary card from independent component assets', () => {
    const markup = renderToStaticMarkup(
      <DashboardSummaryCard
        summary={{ warnings: ['预警'], priorityFindings: ['发现'], remediation: ['建议'] }}
      />,
    );
    expect(markup).not.toContain('ai-summary.png');
    expect(markup).not.toContain('summary-content-surface');
    expect(markup).not.toContain('dashboard-summary-symbol');
    expect(markup).toContain('/material/overview/components/summary-title.svg');
    expect(markup).toContain('/material/overview/components/summary-danger.svg');
    expect(markup).toContain('/material/overview/components/summary-warning.svg');
    expect(markup).toContain('/material/overview/components/summary-safe.svg');
    expect(markup).toContain('/material/overview/components/summary-watermark.svg');
    expect(markup.match(/AI 今日摘要/g)).toHaveLength(1);
    expect(markup).toContain('预警');
    expect(markup).toContain('发现');
    expect(markup).toContain('建议');
  });

});
