import {
  BarChartOutlined,
  BugOutlined,
  CodeOutlined,
  DatabaseOutlined,
  KeyOutlined,
  RadarChartOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { getDashboardSummary, getVulnerabilityOverview, listAssets, listReports, listTasks, listVulnerabilities } from '../api/resources';
import { MetricCard, SectionTitle } from '../components/Ui';
import { RiskDonut } from '../components/DashboardVisuals';
import { smoothLine } from '../components/dashboardVisualGeometry';
import { displayPhase, sanitizeDisplayText } from '../vendorDisplay';
import type { Metric } from '../types';

const featureCards = [
  { title: 'AI 渗透测试', desc: '智能化渗透测试与漏洞发现', icon: <RadarChartOutlined />, tone: 'red' },
  { title: 'AI 应急响应', desc: '自动化研判与智能处置建议', icon: <ThunderboltOutlined />, tone: 'purple' },
  { title: 'AI 代码审计', desc: '静态分析与逻辑漏洞挖掘', icon: <CodeOutlined />, tone: 'blue' },
  { title: 'AI 数据分析', desc: '多维数据聚合与趋势洞察', icon: <BarChartOutlined />, tone: 'green' },
];

const quickLinks = [
  ['资产中心', <DatabaseOutlined />],
  ['报告中心', <BarChartOutlined />],
  ['漏洞详情', <BugOutlined />],
  ['系统设置', <SettingOutlined />],
  ['团队管理', <TeamOutlined />],
  ['授权管理', <KeyOutlined />],
] as const;

function totalValue(total: number | undefined, isError = false) {
  return total === undefined || isError ? '—' : String(total);
}

export function riskOverviewMetrics(
  overview: { metrics: { total: number; critical: number; high: number; medium: number; low: number } } | undefined,
  fallbackTotal: number | undefined,
  fallbackHighRisk: number | undefined,
) {
  const total = overview?.metrics.total ?? fallbackTotal;
  const critical = overview?.metrics.critical;
  const highRisk = overview?.metrics.high ?? fallbackHighRisk;
  const medium = overview?.metrics.medium;
  const low = overview?.metrics.low;
  return {
    total,
    critical,
    highRisk,
    medium,
    low,
  };
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [tasks, running, assets, vulnerabilities, high, reports] = useQueries({
    queries: [
      { queryKey: ['tasks', 'dashboard-recent'], queryFn: () => listTasks({ page: 1, pageSize: 3 }) },
      { queryKey: ['tasks', 'dashboard-running'], queryFn: () => listTasks({ status: 'RUNNING', page: 1, pageSize: 1 }) },
      { queryKey: ['assets', 'dashboard-total'], queryFn: () => listAssets({ page: 1, pageSize: 1 }) },
      { queryKey: ['vulnerabilities', 'dashboard-total'], queryFn: () => listVulnerabilities({ page: 1, pageSize: 1 }) },
      { queryKey: ['vulnerabilities', 'dashboard-high'], queryFn: () => listVulnerabilities({ severity: 'high', page: 1, pageSize: 1 }) },
      { queryKey: ['reports', 'dashboard-total'], queryFn: () => listReports({ page: 1, pageSize: 1 }) },
    ],
  });
  const dashboard = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: getDashboardSummary });
  const allVulnerabilityOverview = useQuery({
    queryKey: ['vulnerabilities', 'dashboard-overview-all'],
    queryFn: () => getVulnerabilityOverview({ range: 'all', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  });
  const queries = [tasks, running, assets, vulnerabilities, high, reports, allVulnerabilityOverview];
  const firstError = [...queries, dashboard].find((query) => query.isError)?.error;
  // The dashboard summary is the authoritative all-time aggregate. The paged
  // list queries remain useful for the recent-task and fallback states, but
  // must not define the risk-card totals.
  const riskMetrics = riskOverviewMetrics(
    allVulnerabilityOverview.data,
    vulnerabilities.data?.total,
    high.data?.total,
  );
  const vulnerabilityTotal = riskMetrics.total;
  const highRiskTotal = riskMetrics.highRisk;
  const metrics: Metric[] = [
    { label: '任务总数', value: totalValue(tasks.data?.total, tasks.isError), tone: 'blue' },
    { label: '进行中任务', value: totalValue(running.data?.total, running.isError), tone: 'blue' },
    { label: '高危风险', value: totalValue(highRiskTotal, allVulnerabilityOverview.isError && high.isError), tone: 'red' },
    { label: '资产总数', value: totalValue(assets.data?.total, assets.isError), tone: 'purple' },
    { label: '漏洞总数', value: totalValue(vulnerabilityTotal, allVulnerabilityOverview.isError && vulnerabilities.isError), tone: 'green' },
  ];
  const riskSegments = [
    { key: 'critical', label: '严重', value: riskMetrics.critical, color: '#c72d35', dot: 'severe' },
    { key: 'high', label: '高危', value: riskMetrics.highRisk, color: '#ff8b2b', dot: 'high' },
    { key: 'medium', label: '中危', value: riskMetrics.medium, color: '#075bd8', dot: 'medium' },
    { key: 'low', label: '低危', value: riskMetrics.low, color: '#087b5b', dot: 'low' },
  ];

  return (
    <div className="page dashboard-page material-dashboard">
      {firstError && <Alert className="resource-error" type="error" showIcon message={firstError instanceof Error ? firstError.message : '总览数据加载失败'} action={<Button onClick={() => queries.forEach((query) => query.refetch())}>重试</Button>} />}
      <div className="metric-grid metric-grid-five">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>

      <div className="feature-grid">
        {featureCards.map((item) => (
          <Card key={item.title} variant="borderless" className={`feature-card tone-${item.tone}`}>
            <span className="feature-icon">{item.icon}</span><div><strong>{item.title}</strong><p>{item.desc}</p></div>
            <Button type="primary" onClick={() => navigate('/pentest')}>工作台 →</Button>
          </Card>
        ))}
      </div>

      <div className="dashboard-main-grid">
        <MaterialPanel className="summary-card dashboard-material-height" image="ai-summary.png" label="AI 今日摘要">
          {dashboard.isPending ? <TruthfulEmpty text="正在生成摘要..." /> : dashboard.data ? <DashboardAiSummary summary={dashboard.data.aiSummary} /> : <TruthfulEmpty text="摘要暂不可用" />}
        </MaterialPanel>
        <MaterialPanel className="trend-card dashboard-material-height" image="risk-trend.png" label="风险趋势">
          {dashboard.isPending ? <TruthfulEmpty text="正在加载风险趋势..." /> : dashboard.data ? <div className="material-panel-data"><RiskTrend values={dashboard.data.riskTrend} /></div> : <TruthfulEmpty text="趋势暂不可用" />}
        </MaterialPanel>
        <Card variant="borderless" className="risk-card dashboard-material-height">
          <SectionTitle icon={<BugOutlined />} title="风险概况" />
          <div className="risk-content"><RiskDonut total={Number(vulnerabilityTotal) || 0} segments={riskSegments.map(({ key, value, color }) => ({ key, value: Number(value) || 0, color }))} /><ul>{riskSegments.map(({ key, label, value, dot }) => <li key={key}><i className={`dot ${dot}`} />{label} <strong>{totalValue(value, allVulnerabilityOverview.isError && (key === 'high' ? high.isError : true))}</strong></li>)}</ul></div>
        </Card>
      </div>

      <div className="dashboard-bottom-grid">
        <MaterialPanel className="recent-tasks-card" image="recent-tasks.png" label="近期任务">
          <button className="material-panel-link" type="button" onClick={() => navigate('/tasks')}>查看全部</button>
          {tasks.isPending ? <TruthfulEmpty text="正在加载任务..." /> : tasks.isError ? <TruthfulEmpty text="任务数据不可用" /> : tasks.data.items.length === 0 ? <TruthfulEmpty text="暂无任务数据" /> : <div className="recent-task-list material-panel-data">{tasks.data.items.map((task, index) => <button className={`recent-task recent-task-tone-${index % 3}`} key={task.id} type="button" onClick={() => navigate(`/pentest/session/${task.id}`)}><i aria-hidden /><div className="recent-task-copy"><strong>{task.name}</strong><span>{formatDashboardTime(task.createdAt)}</span></div><div className="recent-task-progress"><span>进度 <b>{task.progress}%</b></span><div role="progressbar" aria-label={`${task.name}执行进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={task.progress}><i style={{ width: `${task.progress}%` }} /></div></div></button>)}</div>}
        </MaterialPanel>
        <MaterialPanel className="latest-activity-card" image="latest-activity.png" label="最新动态">
          {tasks.isPending ? <TruthfulEmpty text="正在加载动态..." /> : tasks.isError ? <TruthfulEmpty text="任务动态不可用" /> : tasks.data.items.length === 0 ? <TruthfulEmpty text="暂无任务动态" /> : <div className="activity-timeline material-panel-data">{tasks.data.items.map((task) => { const tone = task.statusCode === 'FAILED' ? 'orange' : task.statusCode === 'SUCCEEDED' ? 'green' : 'blue'; return <button className={`activity activity-${tone}`} key={task.id} type="button" onClick={() => navigate(`/pentest/session/${task.id}`)}><i className="activity-node" aria-hidden /><div className="activity-copy"><div><Tag color={tone === 'green' ? 'success' : tone === 'orange' ? 'warning' : 'processing'}>{task.status}</Tag><strong>{task.name}</strong><time>{formatDashboardTime(task.updatedAt)}</time></div><p>当前阶段：{displayPhase(task.phase)}，执行进度 {task.progress}%</p></div></button>; })}</div>}
        </MaterialPanel>
        <Card variant="borderless"><SectionTitle icon={<BugOutlined />} title="快捷入口" /><div className="quick-grid">{quickLinks.map(([label, icon]) => <Button key={label} icon={icon}>{label}</Button>)}</div><p className="muted">报告总数：{totalValue(reports.data?.total, reports.isError)}</p></Card>
      </div>
    </div>
  );
}

function TruthfulEmpty({ text }: { text: string }) {
  return <div className="truthful-empty">{text}</div>;
}

export function DashboardAiSummary({ summary }: { summary: { warnings: string[]; priorityFindings: string[]; remediation: string[] } }) {
  return <div className="dashboard-ai-summary material-panel-data">
    <div className="dashboard-ai-summary-title">AI 今日摘要</div>
    <SummaryBlock tone="danger" title="高危风险预警" items={summary.warnings.map(sanitizeDisplayText)} />
    <SummaryBlock tone="warning" title="重点发现" items={summary.priorityFindings.map(sanitizeDisplayText)} />
    <SummaryBlock tone="safe" title="处置建议" items={summary.remediation.map(sanitizeDisplayText)} />
  </div>;
}

function MaterialPanel({ className, image, label, children }: { className: string; image: string; label: string; children: ReactNode }) {
  return <section className={`overview-material-panel ${className}`} aria-label={label}><img src={`/material/overview/${image}`} alt="" aria-hidden /><span className="material-panel-accessible-title">{label}</span>{children}</section>;
}

function SummaryBlock({ tone, title, items }: { tone: 'danger' | 'warning' | 'safe'; title: string; items: string[] }) {
  return <section className={`dashboard-summary-block ${tone}`}><span className="dashboard-summary-symbol" aria-hidden>{tone === 'danger' ? '!' : tone === 'warning' ? '△' : '✓'}</span><div><strong>{title}</strong><ul>{items.slice(0, 2).map((item) => <li key={item}>{item}</li>)}</ul></div></section>;
}

function RiskTrend({ values }: { values: Array<{ start: string; critical: number; high: number; medium: number; low: number }> }) {
  const series = [
    { key: 'critical', label: '严重', color: '#c92f39' },
    { key: 'high', label: '高危', color: '#ff8b32' },
    { key: 'medium', label: '中危', color: '#075bcc' },
    { key: 'low', label: '低危', color: '#087b5b' },
  ] as const;
  const width = 620;
  const height = 245;
  const plot = { left: 40, right: 12, top: 14, bottom: 32 };
  const maxValue = Math.max(1, ...values.flatMap((item) => series.map(({ key }) => item[key])));
  const ceiling = Math.max(4, Math.ceil(maxValue / 4) * 4);
  const x = (index: number) => plot.left + (values.length <= 1 ? (width - plot.left - plot.right) / 2 : index * (width - plot.left - plot.right) / (values.length - 1));
  const y = (value: number) => plot.top + (ceiling - value) / ceiling * (height - plot.top - plot.bottom);
  return <div className="dashboard-risk-trend" aria-label="风险趋势图">
    <svg className="dashboard-risk-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="risk-trend-title risk-trend-description">
      <title id="risk-trend-title">近七日风险趋势</title>
      <desc id="risk-trend-description">按严重、高危、中危和低危展示每日漏洞数量变化</desc>
      {[0, 1, 2, 3, 4].map((tick) => { const value = ceiling - ceiling / 4 * tick; const lineY = y(value); return <g key={tick}><line className="risk-grid-line" x1={plot.left} x2={width - plot.right} y1={lineY} y2={lineY} /><text className="risk-axis-label" x={plot.left - 9} y={lineY + 4} textAnchor="end">{value}</text></g>; })}
      {values.map((item, index) => <text className="risk-axis-label" key={item.start} x={x(index)} y={height - 7} textAnchor="middle">{item.start.slice(5)}</text>)}
      {series.map(({ key, label, color }) => { const points = values.map((item, index) => ({ x: x(index), y: y(item[key]), value: item[key], date: item.start })); return <g className={`risk-series risk-series-${key}`} key={key}><path d={smoothLine(points, { minY: plot.top, maxY: height - plot.bottom })} stroke={color} /><g>{points.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="3.5" fill={color} tabIndex={0}><title>{`${point.date} ${label}：${point.value}`}</title></circle>)}</g></g>; })}
    </svg>
    <div className="dashboard-risk-legend">{series.map((item) => <span key={item.key}><i style={{ background: item.color }} />{item.label}</span>)}</div>
  </div>;
}

function formatDashboardTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(5, 16).replace('T', ' ');
  const now = new Date();
  const elapsed = now.getTime() - date.getTime();
  if (elapsed >= 0 && elapsed < 60 * 60 * 1000) return `${Math.max(1, Math.floor(elapsed / 60000))}分钟前`;
  if (elapsed >= 0 && elapsed < 24 * 60 * 60 * 1000) return `${Math.floor(elapsed / 3600000)}小时前`;
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
