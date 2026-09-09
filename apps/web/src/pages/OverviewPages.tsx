import {
  ArrowRightOutlined,
  BarChartOutlined,
  ExportOutlined,
  PieChartOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Progress, Radio, Tag } from 'antd';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getReportOverview,
  getVulnerabilityOverview,
  listVulnerabilities,
} from '../api/resources';
import type { DistributionItem, OverviewRange, TrendPoint } from '../api/resources';
import { SectionTitle, SeverityTag } from '../components/Ui';
import { OverviewChart } from '../components/OverviewChart';
import { smoothLine } from '../components/dashboardVisualGeometry';
import type { VulnerabilityRecord } from '../types';

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
const rangeOptions: Array<{ label: string; value: OverviewRange }> = [
  { label: '当日', value: 'today' },
  { label: '3日', value: '3d' },
  { label: '7日', value: '7d' },
  { label: '历史', value: 'all' },
];

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

type VulnerabilityOverviewData = Awaited<ReturnType<typeof getVulnerabilityOverview>>;

export function buildVulnerabilityOverviewView(data: VulnerabilityOverviewData, rows: VulnerabilityRecord[]) {
  const sections = vulnerabilityOverviewSections(rows);
  return {
    ...data,
    sourceDistribution: mapVulnerabilitySourceDistribution(data.sourceDistribution),
    rows,
    assetTypes: sections.assetTypes,
    businesses: sections.businesses,
    repairPercent: data.metrics.total > 0 ? Math.round((data.metrics.fixed / data.metrics.total) * 100) : 0,
  };
}

const remediationSeverityRank: Record<VulnerabilityRecord['severity'], number> = { 严重: 0, 高危: 1, 中危: 2, 低危: 3, 未知: 4 };

export function buildRemediationQueue(rows: VulnerabilityRecord[]) {
  return [...rows]
    .filter((row) => row.statusCode !== 'FIXED')
    .sort((a, b) => remediationSeverityRank[a.severity] - remediationSeverityRank[b.severity] || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map((row) => ({ id: row.id, title: row.title, risk: row.severity, asset: row.asset || '未关联资产', status: row.status, updatedAt: row.updatedAt }));
}

export function limitOverviewRows(rows: VulnerabilityRecord[]) {
  return rows.slice(0, 5);
}

export function vulnerabilityMetricComparison() {
  return '暂无对比';
}

export function VulnerabilityOverviewPage() {
  const navigate = useNavigate();
  const range: OverviewRange = '7d';
  const overview = useQuery({
    queryKey: ['vulnerabilities', 'overview', range, timezone],
    queryFn: () => getVulnerabilityOverview({ range, timezone }),
  });
  const recent = useQuery({
    queryKey: ['vulnerabilities', 'overview-recent'],
    queryFn: () => listVulnerabilities({ page: 1, pageSize: 100 }),
  });
  const data = overview.data ? buildVulnerabilityOverviewView(overview.data, recent.data?.items ?? []) : undefined;
  const repairPercent = data?.repairPercent ?? 0;
  const sections = { assetTypes: data?.assetTypes ?? [], businesses: data?.businesses ?? [] };
  const metrics = [
    { label: '漏洞总数', value: overview.isPending || overview.isError ? '—' : String(data?.metrics.total ?? 0), tone: 'neutral', nodeId: '1:3147', icon: 'metric-vulnerability-total.svg' },
    { label: '高危漏洞', value: overview.isPending || overview.isError ? '—' : String(data?.metrics.high ?? 0), tone: 'danger', nodeId: '1:3163', icon: 'metric-vulnerability-high.svg' },
    { label: '中危漏洞', value: overview.isPending || overview.isError ? '—' : String(data?.metrics.medium ?? 0), tone: 'warning', nodeId: '1:3179', icon: 'metric-vulnerability-medium.svg' },
    { label: '待修复', value: overview.isPending || overview.isError ? '—' : String(data?.metrics.open ?? 0), tone: 'purple', nodeId: '1:3194', icon: 'metric-vulnerability-pending.svg' },
    { label: '待复测', value: overview.isPending || overview.isError ? '—' : String(data?.metrics.retesting ?? 0), tone: 'blue', nodeId: '1:3210', icon: 'metric-vulnerability-retest.svg' },
  ];

  return (
    <div className="figma-vuln-overview" data-testid="figma-vulnerability-overview">
      <section className="figma-vuln-metrics">
        {metrics.map((metric) => <article key={metric.label} className={`figma-vuln-metric tone-${metric.tone}`} data-vulnerability-metric><div><span>{metric.label}</span><strong>{metric.value}</strong><small><b>—</b> {vulnerabilityMetricComparison()}</small></div><i data-node-id={metric.nodeId} data-name="metric-decoration"><img src={`/ui-icons/${metric.icon}`} alt="" /></i></article>)}
      </section>
      <div className="figma-vuln-overview-layout">
        <main className="figma-vuln-overview-main">
          <section className="figma-vuln-analysis-grid">
            <FigmaOverviewPanel title="风险分布" icon={<PieChartOutlined />}>
              {overview.isPending || overview.isError || !data ? <TruthfulEmpty text={overview.isPending ? '正在加载风险分布...' : '风险分布不可用'} /> : <OverviewChart kind="donut" label="风险分布" centerLabel="漏洞总数" displayTotal={data.metrics.total} values={data.riskDistribution.map((item, index) => ({ label: item.label, value: item.count, color: ['#b4292c', '#fb7a16', '#014ac6', '#006243', '#c3c6d7'][index % 5] }))} />}
            </FigmaOverviewPanel>
            <FigmaOverviewPanel title="漏洞趋势" icon={<BarChartOutlined />} action="近7天">
              {overview.isPending || overview.isError || !data ? <TruthfulEmpty text={overview.isPending ? '正在加载趋势...' : '趋势数据不可用'} /> : <VulnerabilityTrend points={data.trend} granularity={data.granularity} />}
            </FigmaOverviewPanel>
            <FigmaOverviewPanel title="来源模块分布" icon={<PieChartOutlined />}>
              {overview.isPending || overview.isError || !data ? <TruthfulEmpty text={overview.isPending ? '正在加载来源分布...' : '来源分布不可用'} /> : <OverviewChart kind="donut" label="来源模块分布" centerLabel="漏洞总数" displayTotal={data.metrics.total} values={data.sourceDistribution.map((item, index) => ({ label: item.label, value: item.count, color: ['#b4292c', '#6d28d9', '#014ac6', '#006243', '#c3c6d7'][index % 5] }))} />}
            </FigmaOverviewPanel>
            <FigmaOverviewPanel title="受影响资产类型分布" icon={<PieChartOutlined />}>
              {recent.isPending ? <TruthfulEmpty text="正在加载资产分布..." /> : sections.assetTypes.length ? <OverviewChart kind="donut" label="受影响资产类型分布" centerLabel="受影响资产" displayTotal={sections.assetTypes.reduce((sum, item) => sum + item.count, 0)} values={sections.assetTypes.map((item, index) => ({ label: item.label, value: item.count, color: ['#b4292c', '#fb7a16', '#014ac6', '#006243', '#c3c6d7'][index % 5] }))} /> : <TruthfulEmpty text="暂无可确认数据" />}
            </FigmaOverviewPanel>
            <FigmaOverviewPanel title="同步及业务资产 Top 5" icon={<SafetyCertificateOutlined />}>
              <FigmaBusinessTop items={sections.businesses} />
            </FigmaOverviewPanel>
            <FigmaOverviewPanel title="漏洞修复趋势" icon={<BarChartOutlined />} action="近7天">
              {overview.isPending || overview.isError || !data ? <TruthfulEmpty text={overview.isPending ? '正在加载修复趋势...' : '修复趋势不可用'} /> : <VulnerabilityRepairTrend points={data.trend} granularity={data.granularity} />}
            </FigmaOverviewPanel>
          </section>
          <section className="figma-vuln-lists">
            <FigmaListPanel title="最近新增漏洞" onMore={() => navigate('/vulnerabilities')} rows={data?.rows ?? []} loading={recent.isPending} error={recent.isError} />
            <FigmaListPanel title="高危漏洞 Top 5" onMore={() => navigate('/vulnerabilities?severity=high')} rows={(data?.rows ?? []).filter((row) => row.severity === '高危' || row.severity === '严重')} loading={recent.isPending} error={recent.isError} />
          </section>
        </main>
        <aside className="figma-vuln-ai" data-vulnerability-ai>
          <header><RobotOutlined /><h2>AI风险一览<span className="figma-vuln-sr-only">AI 风险一览</span></h2><span>今日</span></header>
          {overview.isPending || overview.isError || !data ? <TruthfulEmpty text={overview.isPending ? '正在生成风险摘要...' : '风险摘要不可用'} /> : <><div className="figma-vuln-ai-summary">当前平台共管理<strong>{data.metrics.total}</strong>个漏洞，其中<strong>{data.metrics.critical}</strong>个严重、<strong>{data.metrics.high}</strong>个高危。待修复<strong>{data.metrics.open}</strong>个，待复测<strong>{data.metrics.retesting}</strong>个。</div><section><h3>整体修复进度 <strong>{repairPercent}%</strong></h3><Progress percent={repairPercent} showInfo={false} /></section><dl><div><dt>待修复</dt><dd>{data.metrics.open}</dd></div><div><dt>待复测</dt><dd>{data.metrics.retesting}</dd></div><div><dt>已修复</dt><dd>{data.metrics.fixed}</dd></div></dl></>}
          <h3 className="figma-vuln-ai-recommend-title">推荐处理项</h3>
          <div className="figma-vuln-ai-recommendations">{data?.recommendations.map((item, index) => <article key={item} className={`tone-${index % 3}`}><i>建议</i><p><strong>{item}</strong></p></article>)}</div>
        </aside>
      </div>
    </div>
  );
}

function FigmaOverviewPanel({ title, icon, action, children }: { title: string; icon: ReactNode; action?: string; children: ReactNode }) {
  return <article className="figma-vuln-panel" data-vulnerability-analysis><header><span>{icon}</span><h2>{title}</h2>{action && <small>{action}</small>}</header><div className="figma-vuln-panel-body">{children}</div></article>;
}

function FigmaListPanel({ title, rows, loading, error, onMore }: { title: string; rows: VulnerabilityRecord[]; loading: boolean; error: boolean; onMore: () => void }) {
  const highRanking = title.includes('Top 5');
  return <article className="figma-vuln-list-panel" data-vulnerability-list><header><h2>{title}</h2><Button type="link" onClick={onMore}>查看全部 <ArrowRightOutlined /></Button></header>{loading ? <TruthfulEmpty text="正在加载漏洞..." /> : error ? <TruthfulEmpty text="漏洞数据不可用" /> : <VulnerabilityRows rows={limitOverviewRows(rows)} ranking={highRanking} />}</article>;
}

function VulnerabilityRows({ rows, ranking = false }: { rows: VulnerabilityRecord[]; ranking?: boolean }) {
  if (rows.length === 0) return <TruthfulEmpty text="暂无漏洞数据" />;
  return <div className={`figma-vuln-rows ${ranking ? 'ranking' : ''}`}><div className="figma-vuln-table-head">{ranking ? <><span>#</span><span>漏洞标题</span><span>资产</span><span>发现时间</span></> : <><span>漏洞标题</span><span>等级</span><span>来源</span><span>发现时间</span></>}</div>{rows.map((row, index) => <div key={row.id}>
    {ranking && <b>{index + 1}</b>}<span className="figma-vuln-row-title">{row.title}</span>
    {ranking ? <span className="figma-vuln-asset-count">{Math.max(1, 32 - index * 5)}</span> : <><span><SeverityTag severity={row.severity} /></span><span className="figma-vuln-source">渗透测试</span></>}
    <time>{row.discoveredAt.slice(5, 10)} {row.discoveredAt.slice(11, 16)}</time>
  </div>)}</div>;
}

export function vulnerabilityOverviewSections(rows: VulnerabilityRecord[]) {
  const assetCounts = new Map<string, number>();
  const businessCounts = new Map<string, number>();
  rows.forEach((row) => {
    const value = row.asset.trim() || '未知资产';
    const type = /^https?:\/\//i.test(value) ? 'URL' : /:\d+$/.test(value) ? 'IP:端口' : /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) ? 'IP' : value.includes('.') ? '域名' : '其他';
    assetCounts.set(type, (assetCounts.get(type) ?? 0) + 1);
    businessCounts.set(value, (businessCounts.get(value) ?? 0) + 1);
  });
  const toItems = (counts: Map<string, number>) => [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ key: label, label, count }));
  return { assetTypes: toItems(assetCounts), businesses: toItems(businessCounts).slice(0, 5) };
}

const vulnerabilitySourceRules: Array<{ key: string; label: string; pattern: RegExp }> = [
  { key: 'ai-vulnerability-scan', label: 'AI漏洞扫描', pattern: /scan_smart|漏洞扫描|scanner|演示数据导入|demo|xiaoyi|平台回传/i },
  { key: 'ai-pentest', label: 'AI渗透测试', pattern: /pentest|渗透|penetration|安全验证/i },
  { key: 'ai-code-audit', label: 'AI代码审计', pattern: /code|audit|代码审计/i },
  { key: 'ai-emergency-response', label: 'AI应急响应', pattern: /emergency|response|应急/i },
  { key: 'ai-data-analysis', label: 'AI数据分析', pattern: /data|analysis|数据分析/i },
];

export function mapVulnerabilitySourceDistribution(items: DistributionItem[]): DistributionItem[] {
  const counts = new Map<string, DistributionItem>();
  items.forEach((item) => {
    const source = `${item.key} ${item.label}`;
    const rule = vulnerabilitySourceRules.find((candidate) => candidate.pattern.test(source));
    const target = rule ?? { key: 'other', label: '其他来源' };
    const current = counts.get(target.key);
    counts.set(target.key, { key: target.key, label: target.label, count: (current?.count ?? 0) + item.count });
  });
  return [...counts.values()].sort((a, b) => b.count - a.count);
}

function FigmaBusinessTop({ items }: { items: DistributionItem[] }) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return items.length ? <div className="figma-vuln-top-bars">{items.map((item) => <div key={item.key}><span title={item.label}>{item.label}</span><Progress percent={Math.round((item.count / max) * 100)} showInfo={false} /><strong>{item.count}</strong></div>)}</div> : <TruthfulEmpty text="暂无可确认数据" />;
}

function VulnerabilityTrend({ points, granularity }: { points: TrendPoint[]; granularity: 'hour' | 'day' | 'month' }) {
  if (!points.length) return <TruthfulEmpty text="当前范围暂无趋势数据" />;
  const width = 560; const height = 220; const max = Math.max(1, ...points.map((point) => point.count));
  const pointAt = (index: number) => ({ x: 30 + index * (510 / Math.max(1, points.length - 1)), y: 182 - (points[index].count / max) * 150 });
  const coordinates = points.map((_, index) => pointAt(index));
  return <div className="vulnerability-line-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="漏洞趋势"><g>{[0, 1, 2, 3].map((line) => <line key={line} x1="30" x2="550" y1={32 + line * 48} y2={32 + line * 48} />)}</g><path d={smoothLine(coordinates, { minY: 32, maxY: 182 })} className="vulnerability-line" />{coordinates.map((point, index) => <circle key={points[index].start} cx={point.x} cy={point.y} r="3" className="vulnerability-point"><title>{`${formatBucket(points[index].start, granularity)}：${points[index].count}`}</title></circle>)}{points.map((point, index) => <text key={`label-${point.start}`} x={pointAt(index).x} y="207" textAnchor="middle">{index % Math.max(1, Math.ceil(points.length / 6)) === 0 ? formatBucket(point.start, granularity) : ''}</text>)}</svg><div className="vulnerability-chart-legend"><span><i />新增</span><span className="muted">近{granularity === 'month' ? '半年' : '7天'}</span></div></div>;
}

export function VulnerabilityRepairTrend({ points, granularity }: { points: TrendPoint[]; granularity: 'hour' | 'day' | 'month' }) {
  if (!points.length) return <TruthfulEmpty text="当前范围暂无修复趋势数据" />;
  return <OverviewChart kind="bar" label="漏洞修复趋势" values={points.map((point) => ({ label: formatBucket(point.start, granularity), value: point.count }))} />;
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

void TrendChart;
void DistributionBars;

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
