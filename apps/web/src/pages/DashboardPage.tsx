import {
  BarChartOutlined,
  BugOutlined,
  CodeOutlined,
  DatabaseOutlined,
  KeyOutlined,
  LineChartOutlined,
  HistoryOutlined,
  ProfileOutlined,
  RadarChartOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card } from 'antd';
import { useNavigate } from 'react-router-dom';
import { getDashboardSummary, getVulnerabilityOverview, listAssets, listReports, listTasks, listVulnerabilities } from '../api/resources';
import { MetricCard, SectionTitle } from '../components/Ui';
import { RiskDonut } from '../components/DashboardVisuals';
import { smoothLine } from '../components/dashboardVisualGeometry';
import { displayPhase, sanitizeDisplayText } from '../vendorDisplay';
import type { Metric, TaskRecord } from '../types';

const featureCards = [
  { title: 'AI 渗透测试', desc: '智能化渗透测试与漏洞复测', icon: <RadarChartOutlined />, tone: 'red', path: '/pentest' },
  { title: 'AI 应急响应', desc: '自动化研判与智能处置建议', icon: <ThunderboltOutlined />, tone: 'purple', path: '/tasks' },
  { title: 'AI 代码审计', desc: '静态分析与逻辑漏洞挖掘', icon: <CodeOutlined />, tone: 'blue', path: '/vulnerabilities' },
  { title: 'AI 数据分析', desc: '多维数据聚合与趋势洞察', icon: <BarChartOutlined />, tone: 'green', path: '/reports/overview' },
];

const quickLinks = [
  ['资产中心', <DatabaseOutlined />, '/assets'],
  ['报告中心', <BarChartOutlined />, '/reports/overview'],
  ['漏洞详情', <BugOutlined />, '/vulnerabilities'],
  ['系统设置', <SettingOutlined />, '/settings'],
  ['团队管理', <TeamOutlined />, '/settings/team'],
  ['授权管理', <KeyOutlined />, '/settings/authorization'],
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

  const dashboardContent = (
    <div className="page dashboard-page material-dashboard">
      {firstError && <Alert className="resource-error dashboard-resource-error" type="error" showIcon message={firstError instanceof Error ? firstError.message : '总览数据加载失败'} action={<Button onClick={() => [...queries, dashboard].forEach((query) => query.refetch())}>重试</Button>} />}
      <div className="metric-grid metric-grid-five">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>

      <div className="feature-grid">
        {featureCards.map((item) => (
          <Card key={item.title} variant="borderless" className={`feature-card tone-${item.tone}`}>
            <span className="feature-icon">{item.icon}</span><div><strong>{item.title}</strong><p>{item.desc}</p></div>
            <Button type="primary" onClick={() => navigate(item.path)}>工作台 →</Button>
          </Card>
        ))}
      </div>

      <div className="dashboard-main-grid">
        <DashboardSummaryCard isPending={dashboard.isPending} summary={dashboard.data?.aiSummary} />
        {dashboard.isPending ? <DashboardTrendCard values={[]} loading /> : <DashboardTrendCard values={dashboard.data?.riskTrend ?? []} />}
        <Card variant="borderless" className="risk-card dashboard-material-height">
          <SectionTitle icon={<BugOutlined />} title="风险概况" />
          <div className="risk-content"><RiskDonut total={Number(vulnerabilityTotal) || 0} segments={riskSegments.map(({ key, value, color }) => ({ key, value: Number(value) || 0, color }))} /><ul>{riskSegments.map(({ key, label, value, dot }) => <li key={key}><i className={`dot ${dot}`} />{label} <strong>{totalValue(value, allVulnerabilityOverview.isError && (key === 'high' ? high.isError : true))}</strong></li>)}</ul></div>
        </Card>
      </div>

      <div className="dashboard-bottom-grid">
        <RecentTasksCard tasks={tasks.data?.items ?? []} loading={tasks.isPending} unavailable={tasks.isError} onViewAll={() => navigate('/tasks')} onOpen={(id) => navigate(`/pentest/session/${id}`)} />
        <LatestActivityCard tasks={tasks.data?.items ?? []} loading={tasks.isPending} unavailable={tasks.isError} onOpen={(id) => navigate(`/pentest/session/${id}`)} />
        <Card variant="borderless"><SectionTitle icon={<BugOutlined />} title="快捷入口" /><div className="quick-grid">{quickLinks.map(([label, icon, path]) => <Button key={label} icon={icon} onClick={() => navigate(path)}>{label}</Button>)}</div><p className="muted">报告总数：{totalValue(reports.data?.total, reports.isError)}</p></Card>
      </div>
    </div>
  );

  return dashboardContent;
}

function TruthfulEmpty({ text }: { text: string }) {
  return <div className="truthful-empty">{text}</div>;
}

type DashboardSummary = { warnings: string[]; priorityFindings: string[]; remediation: string[] };

const summaryAssetRoot = '/material/overview/components';

function DashboardSummaryHeading() {
  return <header className="dashboard-summary-heading"><img src={`${summaryAssetRoot}/summary-title.svg`} alt="" aria-hidden /><h3 id="dashboard-summary-title">AI 今日摘要</h3></header>;
}

export function DashboardSummaryCard({ summary, isPending = false }: { summary?: DashboardSummary; isPending?: boolean }) {
  return <section className="dashboard-summary-card dashboard-material-height" aria-labelledby="dashboard-summary-title">
    {isPending ? <><DashboardSummaryHeading /><TruthfulEmpty text="正在生成摘要..." /></> : summary ? <DashboardAiSummary summary={summary} /> : <><DashboardSummaryHeading /><TruthfulEmpty text="摘要暂不可用" /></>}
    <img className="dashboard-summary-watermark" src={`${summaryAssetRoot}/summary-watermark.svg`} alt="" aria-hidden />
  </section>;
}

export function DashboardAiSummary({ summary }: { summary: DashboardSummary }) {
  return <><DashboardSummaryHeading /><div className="dashboard-ai-summary-content">
    <SummaryBlock tone="danger" title="高危风险预警" items={summary.warnings.map(sanitizeDisplayText)} />
    <SummaryBlock tone="warning" title="重点发现" items={summary.priorityFindings.map(sanitizeDisplayText)} />
    <SummaryBlock tone="safe" title="处置建议" items={summary.remediation.map(sanitizeDisplayText)} />
  </div></>;
}

function SummaryBlock({ tone, title, items }: { tone: 'danger' | 'warning' | 'safe'; title: string; items: string[] }) {
  return <section className={`dashboard-summary-block dashboard-summary-item ${tone}`}><img className="dashboard-summary-item-icon" src={`${summaryAssetRoot}/summary-${tone}.svg`} alt="" aria-hidden /><div><strong>{title}</strong><ul>{items.slice(0, 2).map((item) => <li key={item}>{item}</li>)}</ul></div></section>;
}

type TrendPoint = { start: string; critical: number; high: number; medium: number; low: number };

export function DashboardTrendCard({ values, loading = false }: { values: TrendPoint[]; loading?: boolean }) {
  return <section className="dashboard-node-card dashboard-trend-card dashboard-material-height" aria-labelledby="dashboard-trend-title">
    <header className="dashboard-node-card-header"><span><LineChartOutlined /></span><h3 id="dashboard-trend-title">风险态势</h3><div className="dashboard-trend-tabs"><button className="active" type="button">风险态势</button><button type="button">代码审计</button><button type="button">数据分析</button></div></header>
    {loading ? <TruthfulEmpty text="正在加载风险趋势..." /> : values.length ? <RiskTrend values={values} /> : <TruthfulEmpty text="趋势暂不可用" />}
  </section>;
}

function RiskTrend({ values }: { values: TrendPoint[] }) {
  const series = [
    { key: 'critical', label: '严重', color: '#c92f39' },
    { key: 'high', label: '高危', color: '#ff8b32' },
    { key: 'medium', label: '中危', color: '#075bcc' },
    { key: 'low', label: '低危', color: '#087b5b' },
  ] as const;
  const width = 471;
  const height = 226;
  const plot = { left: 24, right: 1, top: 24, bottom: 25 };
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
  </div>;
}

type DashboardTaskCardProps = { tasks: TaskRecord[]; loading?: boolean; unavailable?: boolean; onOpen: (id: string) => void };

export function RecentTasksCard({ tasks, loading = false, unavailable = false, onOpen, onViewAll }: DashboardTaskCardProps & { onViewAll: () => void }) {
  return <section className="dashboard-node-card dashboard-recent-card" aria-labelledby="dashboard-recent-title">
    <header className="dashboard-bottom-title"><span><ProfileOutlined /></span><h3 id="dashboard-recent-title">近期任务</h3><button type="button" onClick={onViewAll}>查看全部</button></header>
    {loading ? <TruthfulEmpty text="正在加载任务..." /> : unavailable ? <TruthfulEmpty text="任务数据不可用" /> : tasks.length === 0 ? <TruthfulEmpty text="暂无任务数据" /> : <div className="dashboard-recent-list">{tasks.slice(0, 3).map((task, index) => <button className={`recent-tone-${index % 3}`} key={task.id} type="button" onClick={() => onOpen(task.id)}><span className="dashboard-recent-copy"><i aria-hidden /><span><strong title={task.name}>{task.name}</strong><time>{formatDashboardTime(task.createdAt)}</time></span></span><span className="dashboard-recent-progress"><em>进度 <b>{task.progress}%</b></em><i><b style={{ width: `${task.progress}%` }} /></i></span></button>)}</div>}
  </section>;
}

export function LatestActivityCard({ tasks, loading = false, unavailable = false, onOpen }: DashboardTaskCardProps) {
  return <section className="dashboard-node-card dashboard-activity-card" aria-labelledby="dashboard-activity-title">
    <header className="dashboard-bottom-title"><span><HistoryOutlined /></span><h3 id="dashboard-activity-title">最新动态</h3></header>
    {loading ? <TruthfulEmpty text="正在加载动态..." /> : unavailable ? <TruthfulEmpty text="任务动态不可用" /> : tasks.length === 0 ? <TruthfulEmpty text="暂无任务动态" /> : <div className="dashboard-activity-list">{tasks.slice(0, 3).map((task) => { const tone = task.statusCode === 'FAILED' ? 'orange' : task.statusCode === 'SUCCEEDED' ? 'green' : 'blue'; return <button className={`tone-${tone}`} key={task.id} type="button" onClick={() => onOpen(task.id)}><i aria-hidden /><span className="dashboard-activity-copy"><span><em>{task.status}</em><strong title={task.name}>{task.name}</strong><time>{formatDashboardClock(task.updatedAt)}</time></span><small>当前阶段：{displayPhase(task.phase)}，执行进度 {task.progress}%</small></span></button>; })}</div>}
  </section>;
}

function formatDashboardClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(11, 16);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
