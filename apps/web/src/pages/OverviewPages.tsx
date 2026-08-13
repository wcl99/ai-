import {
  ArrowRightOutlined,
  BarChartOutlined,
  ExportOutlined,
  FileTextOutlined,
  PieChartOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Progress, Radio, Tag } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getReportOverview,
  getVulnerabilityOverview,
  listVulnerabilities,
} from '../api/resources';
import type { DistributionItem, OverviewRange, TrendPoint } from '../api/resources';
import { MetricCard, SectionTitle, StatusTag } from '../components/Ui';
import { OverviewChart } from '../components/OverviewChart';
import type { Metric, VulnerabilityRecord } from '../types';

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
const rangeOptions: Array<{ label: string; value: OverviewRange }> = [
  { label: '当日', value: 'today' },
  { label: '3日', value: '3d' },
  { label: '7日', value: '7d' },
  { label: '历史', value: 'all' },
];

function totalValue(total: number | undefined, isError = false) {
  return total === undefined || isError ? '—' : String(total);
}

function RangeSelector({ value, onChange }: { value: OverviewRange; onChange: (value: OverviewRange) => void }) {
  return (
    <Radio.Group
      className="overview-range-selector"
      optionType="button"
      buttonStyle="solid"
      options={rangeOptions}
      value={value}
      onChange={(event) => onChange(event.target.value as OverviewRange)}
    />
  );
}

function formatBucket(value: string, granularity: 'hour' | 'day' | 'month') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (granularity === 'hour') return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit' }).format(date);
  if (granularity === 'month') return new Intl.DateTimeFormat('zh-CN', { year: '2-digit', month: '2-digit' }).format(date);
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(date);
}

function TrendChart({ points, granularity }: { points: TrendPoint[]; granularity: 'hour' | 'day' | 'month' }) {
  const max = Math.max(1, ...points.map((point) => point.count));
  if (points.length === 0) return <TruthfulEmpty text="当前范围暂无趋势数据" />;
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  return (
    <div className="overview-trend" aria-label="趋势图">
      <div className="overview-trend-bars">
        {points.map((point, index) => (
          <div key={point.start} title={`${formatBucket(point.start, granularity)}：${point.count}`}>
            <i style={{ height: `${Math.max(point.count === 0 ? 2 : 10, (point.count / max) * 100)}%` }} />
            <span>{index % labelEvery === 0 || index === points.length - 1 ? formatBucket(point.start, granularity) : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DistributionBars({ items }: { items: DistributionItem[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (items.length === 0) return <TruthfulEmpty text="暂无分布数据" />;
  return (
    <div className="overview-distribution">
      {items.map((item) => (
        <div key={item.key}>
          <span>{item.label}</span>
          <Progress percent={total > 0 ? Math.round((item.count / total) * 100) : 0} showInfo={false} />
          <strong>{item.count}</strong>
        </div>
      ))}
    </div>
  );
}

export function VulnerabilityOverviewPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState<OverviewRange>('7d');
  const overview = useQuery({
    queryKey: ['vulnerabilities', 'overview', range, timezone],
    queryFn: () => getVulnerabilityOverview({ range, timezone }),
  });
  const recent = useQuery({
    queryKey: ['vulnerabilities', 'overview-recent'],
    queryFn: () => listVulnerabilities({ page: 1, pageSize: 5 }),
  });
  const data = overview.data;
  const repairPercent = data
    ? (data.metrics.total > 0 ? Math.round((data.metrics.fixed / data.metrics.total) * 100) : 0)
    : undefined;
  const metrics: Metric[] = [
    { label: '漏洞总数', value: totalValue(data?.metrics.total, overview.isError), tone: 'gray' },
    { label: '高危漏洞', value: totalValue(data?.metrics.high, overview.isError), tone: 'red' },
    { label: '中危漏洞', value: totalValue(data?.metrics.medium, overview.isError), tone: 'orange' },
    { label: '待修复', value: totalValue(data?.metrics.open, overview.isError), tone: 'purple' },
    { label: '待复测', value: totalValue(data?.metrics.retesting, overview.isError), tone: 'blue' },
    { label: '已修复', value: totalValue(data?.metrics.fixed, overview.isError), tone: 'green' },
  ];

  return (
    <div className="page vulnerability-overview">
      {overview.isError && <Alert className="resource-error" type="error" showIcon message={overview.error instanceof Error ? overview.error.message : '漏洞总览加载失败'} action={<Button onClick={() => overview.refetch()}>重试</Button>} />}
      <div className="overview-toolbar"><span>统计范围</span><RangeSelector value={range} onChange={setRange} /></div>
      <div className="metric-grid metric-grid-six">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <div className="overview-with-aside">
        <main>
          <div className="overview-grid-three">
            <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<PieChartOutlined />} title="风险概况" />{overview.isPending ? <TruthfulEmpty text="正在加载风险分布..." /> : overview.isError ? <TruthfulEmpty text="风险分布不可用" /> : <DistributionBars items={data!.riskDistribution} />}</Card>
            <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<BarChartOutlined />} title="漏洞趋势" />{overview.isPending ? <TruthfulEmpty text="正在加载趋势..." /> : overview.isError ? <TruthfulEmpty text="趋势数据不可用" /> : <TrendChart points={data!.trend} granularity={data!.granularity} />}</Card>
            <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<SafetyCertificateOutlined />} title="来源分布" />{overview.isPending ? <TruthfulEmpty text="正在加载来源..." /> : overview.isError ? <TruthfulEmpty text="来源数据不可用" /> : <DistributionBars items={data!.sourceDistribution} />}</Card>
          </div>
          <Card variant="borderless"><SectionTitle icon={<FileTextOutlined />} title="最近新增漏洞" action={<Button type="link" onClick={() => navigate('/vulnerabilities')}>查看全部 →</Button>} />{recent.isPending ? <TruthfulEmpty text="正在加载漏洞..." /> : recent.isError ? <TruthfulEmpty text="漏洞数据不可用" /> : <VulnerabilityRows rows={recent.data.items} />}</Card>
        </main>
        <aside className="risk-insight"><Card variant="borderless"><SectionTitle icon={<RobotOutlined />} title="AI 风险一览" /><div className="insight-copy">平台当前记录<strong>{totalValue(data?.metrics.total, overview.isError)}</strong>个漏洞，高危<strong className="danger-text">{totalValue(data?.metrics.high, overview.isError)}</strong>个，中危<strong className="warning-text">{totalValue(data?.metrics.medium, overview.isError)}</strong>个。</div><h4>整体修复进度</h4><div className="repair-progress"><b>整体修复进度 <strong>{repairPercent === undefined || overview.isError ? '—' : `${repairPercent}%`}</strong></b>{repairPercent !== undefined && !overview.isError && <Progress percent={repairPercent} showInfo={false} />}</div>{data && <ul className="overview-insights">{data.recommendations.map((item) => <li key={item}>{item}</li>)}</ul>}</Card></aside>
      </div>
    </div>
  );
}

function VulnerabilityRows({ rows }: { rows: VulnerabilityRecord[] }) {
  if (rows.length === 0) return <TruthfulEmpty text="暂无漏洞数据" />;
  return <div className="simple-rows">{rows.map((row) => <div key={row.id}>
    <span className="overview-vulnerability-title">{row.title}</span>
    <span className="overview-vulnerability-severity-cell"><Tag className="overview-vulnerability-severity" color={row.severity === '严重' ? 'red' : row.severity === '高危' ? 'orange' : 'blue'}>{row.severity}</Tag></span>
    <span className="overview-vulnerability-status-cell"><StatusTag status={row.status} /></span>
    <time>{row.discoveredAt.slice(0, 10)}</time>
  </div>)}</div>;
}

export function ReportOverviewPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState<OverviewRange>('7d');
  const overview = useQuery({
    queryKey: ['reports', 'overview-analytics', range, timezone],
    queryFn: () => getReportOverview({ range, timezone }),
  });
  const data = overview.data;
  const metricItems = [
    { label: '报告总数', metric: data?.metrics.total, icon: 'metric-report-total.png', tone: 'neutral' },
    { label: '本月新增', metric: data?.metrics.monthlyNew, icon: 'metric-report-weekly.png', tone: 'rose' },
    { label: '待导出', metric: data?.metrics.pendingExport, icon: 'metric-report-pending-export.png', tone: 'orange' },
    { label: '已导出', metric: data?.metrics.exported, icon: 'metric-report-exported.png', tone: 'blue' },
    { label: '待确认', metric: data?.metrics.pendingConfirmation, icon: 'metric-report-pending-confirm.png', tone: 'purple' },
    { label: '本月交付', metric: data?.metrics.monthlyDelivered, icon: 'metric-report-delivered.png', tone: 'green' },
  ];
  const sourceColors = ['#c52c32', '#ff9138', '#075bcc', '#c8cddd', '#7357e8'];
  const riskColors = ['#c52c32', '#ff9138', '#075bcc', '#c8cddd', '#e9ebf4'];
  return (
    <div className="page report-overview report-overview-material">
      {overview.isError && <Alert className="resource-error" type="error" showIcon message={overview.error instanceof Error ? overview.error.message : '报告总览加载失败'} action={<Button onClick={() => overview.refetch()}>重试</Button>} />}
      <div className="report-lifecycle-grid">
        {metricItems.map((item) => (
          <Card key={item.label} variant="borderless" className={`report-lifecycle-card tone-${item.tone}`}>
            <span>{item.label}</span>
            <strong>{overview.isPending || overview.isError ? '—' : item.metric?.value}</strong>
            <small>{comparisonText(item.metric?.changePercent, overview.isPending || overview.isError)}</small>
            <i aria-hidden="true"><img src={`/ui-icons/${item.icon}`} alt="" /></i>
          </Card>
        ))}
      </div>
      <div className="report-material-chart-grid">
        <Card variant="borderless" className="material-chart-card">
          <SectionTitle icon={<PieChartOutlined />} title="报告来源分布" />
          {overview.isPending ? <TruthfulEmpty text="正在加载来源..." /> : overview.isError ? <TruthfulEmpty text="来源数据不可用" /> : <OverviewChart kind="donut" label="报告来源分布" centerLabel="报告总数" values={data!.sourceDistribution.map((item, index) => ({ label: item.label, value: item.count, color: sourceColors[index] }))} />}
        </Card>
        <Card variant="borderless" className="material-chart-card material-trend-card">
          <SectionTitle icon={<BarChartOutlined />} title="报告生成趋势" action={<RangeSelector value={range} onChange={setRange} />} />
          {overview.isPending ? <TruthfulEmpty text="正在加载趋势..." /> : overview.isError ? <TruthfulEmpty text="趋势数据不可用" /> : <OverviewChart kind="bar" label="报告生成趋势图" values={data!.trend.map((item) => ({ label: formatBucket(item.start, data!.granularity), value: item.count }))} />}
        </Card>
        <Card variant="borderless" className="material-chart-card">
          <SectionTitle icon={<PieChartOutlined />} title="报告等级分布" />
          {overview.isPending ? <TruthfulEmpty text="正在加载等级..." /> : overview.isError ? <TruthfulEmpty text="等级数据不可用" /> : <OverviewChart kind="donut" label="报告等级分布" centerLabel="风险报告" values={data!.riskDistribution.map((item, index) => ({ label: item.label, value: item.count, color: riskColors[index] }))} />}
        </Card>
      </div>
      <section className="recent-material-section">
        <div className="section-heading"><h3>最近新增报告</h3><Button type="link" onClick={() => navigate('/reports')}>查看全部 <ArrowRightOutlined /></Button></div>
        {overview.isPending ? <TruthfulEmpty text="正在加载报告..." /> : overview.isError ? <TruthfulEmpty text="报告数据不可用" /> : data!.latestReports.length ? (
          <div className="recent-material-reports">
            {data!.latestReports.map((report) => <article className="recent-material-report" key={report.id}><div><Tag>{report.sourceLabel}</Tag><time>{formatShortDate(report.createdAt)}</time></div><strong>{report.filename}</strong><span><b>{report.creatorName.slice(0, 1)}</b>{report.creatorName}</span></article>)}
            <Button className="material-next-button" aria-label="查看全部报告" icon={<ArrowRightOutlined />} onClick={() => navigate('/reports')} />
          </div>
        ) : <TruthfulEmpty text="暂无报告数据" />}
      </section>
      <div className="report-material-bottom">
        <Card variant="borderless" className="recent-export-card">
          <SectionTitle icon={<ExportOutlined />} title="最近导出的报告" action={<Button type="link" onClick={() => navigate('/reports')}>查看全部 <ArrowRightOutlined /></Button>} />
          {overview.isPending ? <TruthfulEmpty text="正在加载导出记录..." /> : overview.isError ? <TruthfulEmpty text="导出记录不可用" /> : data!.recentExports.length ? <div className="material-table-wrap"><table><thead><tr><th>报告名称</th><th>来源</th><th>格式</th><th>导出人</th><th>状态</th><th>导出时间</th></tr></thead><tbody>{data!.recentExports.map((item) => <tr key={item.id}><td>{item.filename}</td><td>{item.sourceLabel}</td><td>{item.format.toUpperCase()}</td><td>{item.exporterName}</td><td><Tag color="green">已交付</Tag></td><td>{formatDateTime(item.exportedAt)}</td></tr>)}</tbody></table></div> : <TruthfulEmpty text="暂无导出记录" />}
        </Card>
        <Card variant="borderless" className="material-report-insight">
          <SectionTitle icon={<RobotOutlined />} title="报告洞察" />
          {overview.isPending ? <TruthfulEmpty text="正在生成洞察..." /> : overview.isError ? <TruthfulEmpty text="报告洞察不可用" /> : <><p>{data!.insights[0] ?? '当前暂无可验证的报告洞察。'}</p><ul>{data!.insights.slice(1).map((item) => <li key={item}>{item}</li>)}</ul></>}
        </Card>
      </div>
    </div>
  );
}

function comparisonText(change: number | null | undefined, unavailable: boolean) {
  if (unavailable || change == null) return '暂无对比';
  return `${change >= 0 ? '↗ +' : '↘ '}${change.toFixed(2)}% 较上期`;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(value)).replace('/', '-');
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function TruthfulEmpty({ text }: { text: string }) {
  return <div className="truthful-empty">{text}</div>;
}
