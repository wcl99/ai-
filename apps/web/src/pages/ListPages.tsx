import { DownloadOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Checkbox, Drawer, Input, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { MetricCard, ProgressCell, StatusTag } from '../components/Ui';
import { reports, tasks, vulnerabilities } from '../data/mock';
import type { Metric, ReportRecord, TaskRecord, VulnerabilityRecord } from '../types';

const taskMetrics: Metric[] = [
  { label: '全部任务', value: '1,284', trend: '+8.2%', tone: 'gray' },
  { label: '排队中', value: '12', trend: '+2', tone: 'orange' },
  { label: '进行中', value: '8', trend: '+3', tone: 'blue' },
  { label: '已完成', value: '1,250', trend: '+12.5%', tone: 'green' },
  { label: '异常任务', value: '4', trend: '-2', tone: 'red' },
  { label: '今日新增', value: '26', trend: '+18.6%', tone: 'purple' },
];

const vulnMetrics: Metric[] = [
  { label: '漏洞总数', value: '3,247', trend: '+4.70%', tone: 'purple' },
  { label: '高危漏洞', value: '412', trend: '+5.84%', tone: 'red' },
  { label: '中危漏洞', value: '1,562', trend: '+3.80%', tone: 'orange' },
  { label: '待修复', value: '2,135', trend: '+6.26%', tone: 'purple' },
  { label: '待复测', value: '325', trend: '-3.16%', tone: 'blue' },
  { label: '已修复', value: '1,128', trend: '+9.42%', tone: 'green' },
];

const reportMetrics: Metric[] = [
  { label: '报告总数', value: '1,286', trend: '+8.20%', tone: 'purple' },
  { label: '本周新增', value: '42', trend: '+12.50%', tone: 'red' },
  { label: '待导出', value: '18', trend: '+6.30%', tone: 'orange' },
  { label: '已导出', value: '1,102', trend: '+5.10%', tone: 'blue' },
  { label: '待确认', value: '24', trend: '-4.00%', tone: 'purple' },
  { label: '本月交付', value: '86', trend: '+18.60%', tone: 'green' },
];

function PageFilters({ placeholder, action }: { placeholder: string; action?: React.ReactNode }) {
  return (
    <div className="filter-bar">
      <Input prefix={<SearchOutlined />} placeholder={placeholder} />
      <Select defaultValue="全部状态" options={['全部状态', '进行中', '已完成'].map((value) => ({ value }))} />
      <Select defaultValue="全部类型" options={['全部类型', '渗透测试', '代码审计'].map((value) => ({ value }))} />
      <Button>最近七天</Button>
      <div className="filter-spacer" />
      <Button icon={<ReloadOutlined />}>刷新</Button>
      {action}
    </div>
  );
}

export function TasksPage() {
  const columns: ColumnsType<TaskRecord> = [
    { title: '任务名称/ID', dataIndex: 'name', width: 210, render: (name, row) => <div className="primary-cell"><strong>{name}</strong><span>{row.id}</span></div> },
    { title: '类型', dataIndex: 'type', width: 120 },
    { title: '目标/资产摘要', dataIndex: 'target', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    { title: '创建人', dataIndex: 'creator', width: 110 },
    { title: '当前状态', dataIndex: 'status', width: 100, render: (status) => <StatusTag status={status} /> },
    { title: '进度', dataIndex: 'progress', width: 150, render: (value, row) => <ProgressCell value={value} tone={row.status === '异常' ? 'red' : row.status === '已完成' ? 'green' : 'blue'} /> },
    { title: '优先级', dataIndex: 'priority', width: 80, render: (value) => <Tag color={value === '高' ? 'red' : 'default'}>{value}</Tag> },
    { title: '操作', width: 120, render: () => <Space><a>摘要</a><a>详情</a></Space> },
  ];
  return (
    <ListPage metrics={taskMetrics}>
      <PageFilters placeholder="搜索任务名称、ID..." action={<Button type="primary" icon={<PlusOutlined />}>新建任务</Button>} />
      <Table rowKey="id" columns={columns} dataSource={tasks} pagination={{ pageSize: 6 }} />
    </ListPage>
  );
}

export function VulnerabilitiesPage() {
  const [selected, setSelected] = useState<VulnerabilityRecord>();
  const columns: ColumnsType<VulnerabilityRecord> = useMemo(() => [
    { title: '', width: 44, render: () => <Checkbox /> },
    { title: '漏洞标题/漏洞 ID', dataIndex: 'title', width: 250, render: (title, row) => <div className="primary-cell"><strong>{title}</strong><span>{row.id}</span></div> },
    { title: '来源模块', dataIndex: 'source', width: 110 },
    { title: '关联资产', dataIndex: 'asset', width: 180, ellipsis: true },
    { title: '所属任务', dataIndex: 'task', width: 180, ellipsis: true },
    { title: '首次发现时间', dataIndex: 'discoveredAt', width: 165 },
    { title: '状态', dataIndex: 'status', width: 90, render: (status) => <StatusTag status={status} /> },
    { title: '等级', dataIndex: 'severity', width: 80, render: (severity) => <Tag color={severity === '严重' ? 'red' : severity === '高危' ? 'orange' : 'blue'}>{severity}</Tag> },
    { title: 'AI 标签', dataIndex: 'tags', render: (tags: string[]) => tags.map((tag) => <Tag key={tag}>{tag}</Tag>) },
    { title: '操作', width: 90, render: (_, row) => <a onClick={() => setSelected(row)}>详情</a> },
  ], []);
  return (
    <ListPage metrics={vulnMetrics}>
      <PageFilters placeholder="搜索漏洞标题、漏洞 ID、资产、任务..." action={<Button type="primary">搜索</Button>} />
      <Table rowKey="id" columns={columns} dataSource={vulnerabilities} pagination={{ pageSize: 5 }} scroll={{ x: 1350 }} />
      <Drawer open={Boolean(selected)} width={560} title="漏洞详情" onClose={() => setSelected(undefined)}>
        {selected && <div className="detail-drawer">
          <Tag color="red">{selected.severity}</Tag><StatusTag status={selected.status} />
          <h2>{selected.title}</h2><p className="muted">{selected.id}</p>
          <Card size="small"><strong>关联资产</strong><p>{selected.asset}</p><strong>所属任务</strong><p>{selected.task}</p></Card>
          <h3>漏洞描述</h3><p>{selected.description}</p>
          <h3>AI 处置建议</h3><p>优先限制暴露端口，升级受影响组件，并完成凭据轮换后发起复测。</p>
          <Button type="primary">创建修复任务</Button>
        </div>}
      </Drawer>
    </ListPage>
  );
}

export function ReportsPage() {
  const columns: ColumnsType<ReportRecord> = [
    { title: '', width: 44, render: () => <Checkbox /> },
    { title: '报告名称', dataIndex: 'name', width: 250, render: (name, row) => <div className="primary-cell"><strong>{name}</strong><span>{row.id}</span></div> },
    { title: '类型', dataIndex: 'type', width: 110 },
    { title: '资产分组', dataIndex: 'group', width: 120 },
    { title: '所属任务', dataIndex: 'task', width: 190 },
    { title: '创建时间', dataIndex: 'createdAt', width: 170 },
    { title: '状态', dataIndex: 'status', width: 90, render: (status) => <StatusTag status={status} /> },
    { title: '导出状态', dataIndex: 'exported', width: 100, render: (value) => <Tag color={value ? 'blue' : 'default'}>{value ? '已导出' : '未导出'}</Tag> },
    { title: '报告信息', dataIndex: 'risks', render: (risks: ReportRecord['risks']) => Object.entries(risks).map(([key, value]) => <Tag key={key}>{key} {value}</Tag>) },
    { title: '操作', width: 110, render: () => <Space><a>详情</a><a>下载</a></Space> },
  ];
  return (
    <ListPage metrics={reportMetrics}>
      <PageFilters placeholder="搜索报告名称、ID、任务、创建人..." action={<Button type="primary">搜索</Button>} />
      <div className="table-toolbar"><span>已选择 <strong>0</strong> 项</span><Button icon={<DownloadOutlined />}>批量导出</Button></div>
      <Table rowKey="id" columns={columns} dataSource={reports} pagination={{ pageSize: 6 }} scroll={{ x: 1300 }} />
    </ListPage>
  );
}

function ListPage({ metrics, children }: { metrics: Metric[]; children: React.ReactNode }) {
  return (
    <div className="page list-page">
      <div className="metric-grid metric-grid-six">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <Card variant="borderless" className="data-card">{children}</Card>
    </div>
  );
}
