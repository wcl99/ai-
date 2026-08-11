import {
  BarChartOutlined,
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
  listReports,
  listVulnerabilities,
} from '../api/resources';
import type { DistributionItem, OverviewRange, TrendPoint } from '../api/resources';
import { MetricCard, SectionTitle, StatusTag } from '../components/Ui';
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
  return <div className="simple-rows">{rows.map((row) => <div key={row.id}><span>{row.title}</span><Tag color={row.severity === '严重' ? 'red' : row.severity === '高危' ? 'orange' : 'blue'}>{row.severity}</Tag><StatusTag status={row.status} /><time>{row.discoveredAt.slice(0, 10)}</time></div>)}</div>;
}

export function ReportOverviewPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState<OverviewRange>('7d');
  const overview = useQuery({
    queryKey: ['reports', 'overview-analytics', range, timezone],
    queryFn: () => getReportOverview({ range, timezone }),
  });
  const recent = useQuery({
    queryKey: ['reports', 'overview-recent'],
    queryFn: () => listReports({ page: 1, pageSize: 5 }),
  });
  const data = overview.data;
  const metrics: Metric[] = [
    { label: '报告总数', value: totalValue(data?.metrics.total, overview.isError), tone: 'gray' },
    { label: '完整报告', value: totalValue(data?.metrics.ready, overview.isError), tone: 'green' },
    { label: '部分报告', value: totalValue(data?.metrics.partial, overview.isError), tone: 'orange' },
    { label: '近 7 天新增', value: totalValue(data?.metrics.recent7d, overview.isError), tone: 'blue' },
  ];
  return (
    <div className="page report-overview">
      {overview.isError && <Alert className="resource-error" type="error" showIcon message={overview.error instanceof Error ? overview.error.message : '报告总览加载失败'} action={<Button onClick={() => overview.refetch()}>重试</Button>} />}
      <div className="overview-toolbar"><span>统计范围</span><RangeSelector value={range} onChange={setRange} /></div>
      <div className="metric-grid metric-grid-six">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <div className="report-chart-grid">
        <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<PieChartOutlined />} title="报告来源分布" />{overview.isPending ? <TruthfulEmpty text="正在加载来源..." /> : overview.isError ? <TruthfulEmpty text="来源数据不可用" /> : <DistributionBars items={data!.sourceDistribution} />}</Card>
        <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<BarChartOutlined />} title="报告生成趋势" />{overview.isPending ? <TruthfulEmpty text="正在加载趋势..." /> : overview.isError ? <TruthfulEmpty text="趋势数据不可用" /> : <TrendChart points={data!.trend} granularity={data!.granularity} />}</Card>
        <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<PieChartOutlined />} title="报告等级分布" />{overview.isPending ? <TruthfulEmpty text="正在加载等级..." /> : overview.isError ? <TruthfulEmpty text="等级数据不可用" /> : <DistributionBars items={data!.levelDistribution} />}</Card>
      </div>
      <div className="recent-report-section"><div className="section-heading"><h3>最近新增报告</h3><Button type="link" onClick={() => navigate('/reports')}>查看全部 →</Button></div>{recent.isPending ? <TruthfulEmpty text="正在加载报告..." /> : recent.isError ? <TruthfulEmpty text="报告数据不可用" /> : <><div className="recent-report-cards">{recent.data.items.map((report) => <Card key={report.id} variant="borderless"><Tag color="blue">{report.format.toUpperCase()}</Tag><time>{report.createdAt.slice(0, 10)}</time><strong>{report.name}</strong><span>{report.plan}</span></Card>)}</div>{recent.data.items.length === 0 && <TruthfulEmpty text="暂无报告数据" />}</>}</div>
      <Card variant="borderless" className="report-insight"><SectionTitle icon={<RobotOutlined />} title="报告洞察" />{overview.isPending ? <TruthfulEmpty text="正在生成洞察..." /> : overview.isError ? <TruthfulEmpty text="报告洞察不可用" /> : <ul className="overview-insights">{data!.insights.map((item) => <li key={item}>{item}</li>)}</ul>}</Card>
    </div>
  );
}

function TruthfulEmpty({ text }: { text: string }) {
  return <div className="truthful-empty">{text}</div>;
}
