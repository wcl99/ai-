import {
  BarChartOutlined,
  BugOutlined,
  CodeOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  KeyOutlined,
  RadarChartOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQueries } from '@tanstack/react-query';
import { Alert, Button, Card, Progress, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { listAssets, listReports, listTasks, listVulnerabilities } from '../api/resources';
import { MetricCard, SectionTitle } from '../components/Ui';
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
  const queries = [tasks, running, assets, vulnerabilities, high, reports];
  const firstError = queries.find((query) => query.isError)?.error;
  const metrics: Metric[] = [
    { label: '任务总数', value: totalValue(tasks.data?.total, tasks.isError), tone: 'blue' },
    { label: '进行中任务', value: totalValue(running.data?.total, running.isError), tone: 'blue' },
    { label: '高危风险', value: totalValue(high.data?.total, high.isError), tone: 'red' },
    { label: '资产总数', value: totalValue(assets.data?.total, assets.isError), tone: 'purple' },
    { label: '漏洞总数', value: totalValue(vulnerabilities.data?.total, vulnerabilities.isError), tone: 'green' },
  ];
  const otherRisk = vulnerabilities.data && high.data && !vulnerabilities.isError && !high.isError
    ? String(Math.max(0, vulnerabilities.data.total - high.data.total))
    : '—';

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
        <Card variant="borderless" className="summary-card"><SectionTitle icon={<RobotOutlined />} title="AI 今日摘要" /><TruthfulEmpty text="暂无可验证的 AI 摘要数据" /></Card>
        <Card variant="borderless" className="trend-card"><SectionTitle icon={<BarChartOutlined />} title="风险趋势" /><TruthfulEmpty text="暂无历史趋势数据" /></Card>
        <Card variant="borderless" className="risk-card">
          <SectionTitle icon={<BugOutlined />} title="风险概况" />
          <div className="risk-content"><div className="risk-donut"><div><span>漏洞总数</span><strong>{totalValue(vulnerabilities.data?.total, vulnerabilities.isError)}</strong></div></div><ul><li><i className="dot high" />高危 <strong>{totalValue(high.data?.total, high.isError)}</strong></li><li><i className="dot low" />其他 <strong>{otherRisk}</strong></li></ul></div>
        </Card>
      </div>

      <div className="dashboard-bottom-grid">
        <Card variant="borderless">
          <SectionTitle icon={<FileTextOutlined />} title="近期任务" action={<Button type="link" onClick={() => navigate('/tasks')}>查看全部</Button>} />
          {tasks.isPending ? <TruthfulEmpty text="正在加载任务..." /> : tasks.isError ? <TruthfulEmpty text="任务数据不可用" /> : tasks.data.items.length === 0 ? <TruthfulEmpty text="暂无任务数据" /> : tasks.data.items.map((task) => <div className="recent-task" key={task.id}><div><strong>{task.name}</strong><span>{task.createdAt.slice(5, 16).replace('T', ' ')}</span></div><Progress percent={task.progress} size="small" /></div>)}
        </Card>
        <Card variant="borderless">
          <SectionTitle icon={<ThunderboltOutlined />} title="最新动态" />
          {tasks.isPending ? <TruthfulEmpty text="正在加载动态..." /> : tasks.isError ? <TruthfulEmpty text="任务动态不可用" /> : tasks.data.items.length === 0 ? <TruthfulEmpty text="暂无任务动态" /> : tasks.data.items.map((task) => <div className="activity" key={task.id}><i className={task.statusCode === 'FAILED' ? 'orange' : task.statusCode === 'SUCCEEDED' ? 'green' : 'blue'} /><div><Tag>{task.status}</Tag><strong>{task.name}</strong><p>当前阶段：{task.phase || '—'}，进度 {task.progress}%</p></div></div>)}
        </Card>
        <Card variant="borderless"><SectionTitle icon={<BugOutlined />} title="快捷入口" /><div className="quick-grid">{quickLinks.map(([label, icon]) => <Button key={label} icon={icon}>{label}</Button>)}</div><p className="muted">报告总数：{totalValue(reports.data?.total, reports.isError)}</p></Card>
      </div>
    </div>
  );
}

function TruthfulEmpty({ text }: { text: string }) {
  return <div className="truthful-empty">{text}</div>;
}
