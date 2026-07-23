import {
  BarChartOutlined,
  FileTextOutlined,
  PieChartOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Progress, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { listReports, listVulnerabilities } from '../api/resources';
import { MetricCard, SectionTitle, StatusTag } from '../components/Ui';
import type { Metric, VulnerabilityRecord } from '../types';

function totalValue(total: number | undefined, isError = false) {
  return total === undefined || isError ? '—' : String(total);
}

export function VulnerabilityOverviewPage() {
  const navigate = useNavigate();
  const [all, high, medium, open, retesting, fixed, recent] = useQueries({
    queries: [
      { queryKey: ['vulnerabilities', 'overview-total'], queryFn: () => listVulnerabilities({ page: 1, pageSize: 1 }) },
      { queryKey: ['vulnerabilities', 'overview-high'], queryFn: () => listVulnerabilities({ severity: 'high', page: 1, pageSize: 1 }) },
      { queryKey: ['vulnerabilities', 'overview-medium'], queryFn: () => listVulnerabilities({ severity: 'medium', page: 1, pageSize: 1 }) },
      { queryKey: ['vulnerabilities', 'overview-open'], queryFn: () => listVulnerabilities({ status: 'OPEN', page: 1, pageSize: 1 }) },
      { queryKey: ['vulnerabilities', 'overview-retesting'], queryFn: () => listVulnerabilities({ status: 'RETESTING', page: 1, pageSize: 1 }) },
      { queryKey: ['vulnerabilities', 'overview-fixed'], queryFn: () => listVulnerabilities({ status: 'FIXED', page: 1, pageSize: 1 }) },
      { queryKey: ['vulnerabilities', 'overview-recent'], queryFn: () => listVulnerabilities({ page: 1, pageSize: 5 }) },
    ],
  });
  const queries = [all, high, medium, open, retesting, fixed, recent];
  const firstError = queries.find((query) => query.isError)?.error;
  const total = all.data?.total;
  const fixedTotal = fixed.data?.total;
  const repairPercent = total !== undefined && fixedTotal !== undefined
    ? (total > 0 ? Math.round((fixedTotal / total) * 100) : 0)
    : undefined;
  const metrics: Metric[] = [
    { label: '漏洞总数', value: totalValue(total, all.isError), tone: 'gray' },
    { label: '高危漏洞', value: totalValue(high.data?.total, high.isError), tone: 'red' },
    { label: '中危漏洞', value: totalValue(medium.data?.total, medium.isError), tone: 'orange' },
    { label: '待修复', value: totalValue(open.data?.total, open.isError), tone: 'purple' },
    { label: '待复测', value: totalValue(retesting.data?.total, retesting.isError), tone: 'blue' },
    { label: '已修复', value: totalValue(fixedTotal, fixed.isError), tone: 'green' },
  ];

  return (
    <div className="page vulnerability-overview">
      {firstError && <Alert className="resource-error" type="error" showIcon message={firstError instanceof Error ? firstError.message : '漏洞总览加载失败'} action={<Button onClick={() => queries.forEach((query) => query.refetch())}>重试</Button>} />}
      <div className="metric-grid metric-grid-six">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <div className="overview-with-aside">
        <main>
          <div className="overview-grid-three">
            <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<PieChartOutlined />} title="风险概况" /><div className="risk-content compact"><div className="risk-donut"><div><span>漏洞总数</span><strong>{totalValue(total, all.isError)}</strong></div></div><ul><li><i className="dot high" />高危<strong>{totalValue(high.data?.total, high.isError)}</strong></li><li><i className="dot medium" />中危<strong>{totalValue(medium.data?.total, medium.isError)}</strong></li></ul></div></Card>
            <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<BarChartOutlined />} title="漏洞趋势" /><TruthfulEmpty text="暂无历史趋势数据" /></Card>
            <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<SafetyCertificateOutlined />} title="来源分布" /><TruthfulEmpty text="当前接口未提供来源聚合" /></Card>
          </div>
          <Card variant="borderless"><SectionTitle icon={<FileTextOutlined />} title="最近新增漏洞" action={<Button type="link" onClick={() => navigate('/vulnerabilities')}>查看全部 →</Button>} />{recent.isPending ? <TruthfulEmpty text="正在加载漏洞..." /> : recent.isError ? <TruthfulEmpty text="漏洞数据不可用" /> : <VulnerabilityRows rows={recent.data.items} />}</Card>
        </main>
        <aside className="risk-insight"><Card variant="borderless"><SectionTitle icon={<RobotOutlined />} title="AI 风险一览" /><div className="insight-copy">平台当前记录<strong>{totalValue(total, all.isError)}</strong>个漏洞，高危<strong className="danger-text">{totalValue(high.data?.total, high.isError)}</strong>个，中危<strong className="warning-text">{totalValue(medium.data?.total, medium.isError)}</strong>个。</div><h4>整体修复进度</h4><div className="repair-progress"><b>整体修复进度 <strong>{repairPercent === undefined || all.isError || fixed.isError ? '—' : `${repairPercent}%`}</strong></b>{repairPercent !== undefined && !all.isError && !fixed.isError && <Progress percent={repairPercent} showInfo={false} />}</div><TruthfulEmpty text="暂无可验证的自动处置建议" /></Card></aside>
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
  const query = useQuery({
    queryKey: ['reports', 'overview'],
    queryFn: () => listReports({ page: 1, pageSize: 5 }),
  });
  const metrics: Metric[] = [{ label: '报告总数', value: totalValue(query.data?.total, query.isError), tone: 'gray' }];
  return (
    <div className="page report-overview">
      {query.isError && <Alert className="resource-error" type="error" showIcon message={query.error instanceof Error ? query.error.message : '报告总览加载失败'} action={<Button onClick={() => query.refetch()}>重试</Button>} />}
      <div className="metric-grid metric-grid-six">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <div className="report-chart-grid">
        <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<PieChartOutlined />} title="报告来源分布" /><TruthfulEmpty text="当前接口未提供来源聚合" /></Card>
        <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<BarChartOutlined />} title="报告生成趋势" /><TruthfulEmpty text="暂无历史趋势数据" /></Card>
        <Card variant="borderless" className="overview-chart-card"><SectionTitle icon={<PieChartOutlined />} title="报告等级分布" /><TruthfulEmpty text="当前接口未提供等级聚合" /></Card>
      </div>
      <div className="recent-report-section"><div className="section-heading"><h3>最近新增报告</h3><Button type="link" onClick={() => navigate('/reports')}>查看全部 →</Button></div>{query.isPending ? <TruthfulEmpty text="正在加载报告..." /> : query.isError ? <TruthfulEmpty text="报告数据不可用" /> : <><div className="recent-report-cards">{query.data.items.map((report) => <Card key={report.id} variant="borderless"><Tag color="blue">{report.format.toUpperCase()}</Tag><time>{report.createdAt.slice(0, 10)}</time><strong>{report.name}</strong><span>{report.plan}</span></Card>)}</div>{query.data.items.length === 0 && <TruthfulEmpty text="暂无报告数据" />}</>}</div>
      <Card variant="borderless" className="report-insight"><SectionTitle icon={<RobotOutlined />} title="报告洞察" /><TruthfulEmpty text="暂无可验证的报告洞察数据" /></Card>
    </div>
  );
}

function TruthfulEmpty({ text }: { text: string }) {
  return <div className="truthful-empty">{text}</div>;
}
