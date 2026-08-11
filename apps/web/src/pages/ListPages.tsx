import {
  BarChartOutlined,
  CodeOutlined,
  ExperimentOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Drawer, Dropdown, Input, Select, Space, Table, Tag } from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  listReports,
  listTasks,
  listVulnerabilities,
  previewReport,
  reportDownloadUrl,
  updateVulnerability,
} from '../api/resources';
import type {
  TaskStatusCode,
  VulnerabilitySeverityCode,
  VulnerabilityStatusCode,
} from '../api/resources';
import { MetricCard, ProgressCell, StatusTag } from '../components/Ui';
import type { Metric, ReportRecord, TaskRecord, VulnerabilityRecord } from '../types';

const PAGE_SIZE = 10;

function dateTime(value: string) {
  return value.replace('T', ' ').replace('Z', '').slice(0, 19);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请稍后重试';
}

function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <Alert
      className="resource-error"
      type="error"
      showIcon
      message={errorMessage(error)}
      action={<Button onClick={retry}>重试</Button>}
    />
  );
}

function pagination(
  page: number,
  total: number,
  setPage: (page: number) => void,
): TablePaginationConfig {
  return {
    current: page,
    pageSize: PAGE_SIZE,
    total,
    showSizeChanger: false,
    onChange: setPage,
  };
}

function pageMetrics(
  totalLabel: string,
  total: number | undefined,
  isError: boolean,
  rows: Array<{ label: string; value: number; tone: Metric['tone']; icon: string }>,
): Metric[] {
  const loaded = total !== undefined && !isError;
  return [
    { label: totalLabel, value: loaded ? String(total) : '—', tone: 'gray' },
    ...rows.map((row) => ({ ...row, value: loaded ? String(row.value) : '—' })),
  ];
}

export function TasksPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStatus = searchParams.get('status');
  const status = requestedStatus && ['QUEUED', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'PARTIAL_SUCCEEDED', 'FAILED', 'CANCELLED'].includes(requestedStatus)
    ? requestedStatus as TaskStatusCode
    : undefined;
  const query = useQuery({
    queryKey: ['tasks', { page, pageSize: PAGE_SIZE, status }],
    queryFn: () => listTasks({ page, pageSize: PAGE_SIZE, status }),
  });
  const rows = query.data?.items ?? [];
  const visibleRows = keyword.trim()
    ? rows.filter((item) => `${item.name} ${item.id} ${item.target}`.toLowerCase().includes(keyword.trim().toLowerCase()))
    : rows;
  const metrics = pageMetrics('全部任务', query.data?.total, query.isError, [
    { label: '本页排队', value: rows.filter((item) => item.statusCode === 'QUEUED').length, tone: 'orange', icon: 'metric-task-queued' },
    { label: '本页进行中', value: rows.filter((item) => item.statusCode === 'RUNNING').length, tone: 'blue', icon: 'metric-task-running' },
    { label: '本页已完成', value: rows.filter((item) => item.statusCode === 'SUCCEEDED').length, tone: 'green', icon: 'metric-task-completed' },
    { label: '本页异常', value: rows.filter((item) => item.statusCode === 'FAILED').length, tone: 'red', icon: 'metric-task-abnormal' },
    { label: '本页已停止', value: rows.filter((item) => item.statusCode === 'CANCELLED').length, tone: 'gray', icon: 'metric-task-all' },
  ]);
  const columns: ColumnsType<TaskRecord> = [
    { title: '任务名称/ID', dataIndex: 'name', width: 220, render: (name, row) => <div className="primary-cell"><strong>{name}</strong><span>{row.id}</span></div> },
    { title: '类型', dataIndex: 'type', width: 130, render: (type) => <ServiceType type={type} /> },
    { title: '目标/资产摘要', dataIndex: 'target', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: dateTime },
    { title: '创建人', dataIndex: 'creator', width: 150, render: (value) => <span className="table-nowrap" title={value}>{value}</span> },
    { title: '当前状态', dataIndex: 'status', width: 110, render: (value) => <StatusTag status={value} /> },
    { title: '进度', dataIndex: 'progress', width: 150, render: (value, row) => <ProgressCell value={value} tone={row.status === '异常' ? 'red' : row.status === '已完成' ? 'green' : 'blue'} /> },
    { title: '阶段', dataIndex: 'phase', width: 120, render: (value) => value || '—' },
  ];

  return (
    <ListPage metrics={metrics}>
      <div className="filter-bar material-filter-bar">
        <Input allowClear prefix={<SearchOutlined />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索任务名称、ID 或资产" />
        <Select
          aria-label="任务状态"
          value={status}
          allowClear
          placeholder="全部状态"
          options={[
            ['QUEUED', '排队中'], ['RUNNING', '进行中'], ['SUCCEEDED', '已完成'], ['FAILED', '异常'], ['CANCELLED', '已停止'],
          ].map(([value, label]) => ({ value, label }))}
          onChange={(value) => {
            setSearchParams(value ? { status: String(value) } : {}, { replace: true });
            setPage(1);
          }}
        />
        <div className="filter-spacer" />
        <Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>刷新</Button>
      </div>
      {query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : (
        <Table
          rowKey="id"
          columns={columns}
          dataSource={visibleRows}
          loading={query.isPending}
          locale={{ emptyText: '暂无任务数据' }}
          pagination={pagination(page, query.data?.total ?? 0, setPage)}
          scroll={{ x: 1200 }}
        />
      )}
    </ListPage>
  );
}

export function VulnerabilitiesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState<VulnerabilitySeverityCode>();
  const [status, setStatus] = useState<VulnerabilityStatusCode>();
  const [selected, setSelected] = useState<VulnerabilityRecord>();
  const [keyword, setKeyword] = useState('');
  const query = useQuery({
    queryKey: ['vulnerabilities', { page, pageSize: PAGE_SIZE, severity, status }],
    queryFn: () => listVulnerabilities({ page, pageSize: PAGE_SIZE, severity, status }),
  });
  const mutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: VulnerabilityStatusCode }) => updateVulnerability(id, nextStatus),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vulnerabilities'] }),
  });
  const rows = query.data?.items ?? [];
  const visibleRows = keyword.trim()
    ? rows.filter((item) => `${item.title} ${item.id} ${item.asset} ${item.task}`.toLowerCase().includes(keyword.trim().toLowerCase()))
    : rows;
  const metrics = pageMetrics('漏洞总数', query.data?.total, query.isError, [
    { label: '本页高危', value: rows.filter((item) => ['严重', '高危'].includes(item.severity)).length, tone: 'red', icon: 'metric-vulnerability-high' },
    { label: '本页中危', value: rows.filter((item) => item.severity === '中危').length, tone: 'orange', icon: 'metric-vulnerability-medium' },
    { label: '本页待修复', value: rows.filter((item) => item.statusCode === 'OPEN').length, tone: 'purple', icon: 'metric-vulnerability-pending' },
    { label: '本页待复测', value: rows.filter((item) => item.statusCode === 'RETESTING').length, tone: 'blue', icon: 'metric-vulnerability-retest' },
    { label: '本页已修复', value: rows.filter((item) => item.statusCode === 'FIXED').length, tone: 'green', icon: 'metric-vulnerability-fixed' },
  ]);
  const statusMenu = (row: VulnerabilityRecord): MenuProps => ({
    items: [
      { key: 'FIXING', label: '标记修复中' },
      { key: 'RETESTING', label: '标记待复测' },
      { key: 'FIXED', label: '标记已修复' },
      { key: 'OPEN', label: '重新打开' },
    ],
    onClick: ({ key }) => mutation.mutate({ id: row.id, nextStatus: key as VulnerabilityStatusCode }),
  });
  const columns: ColumnsType<VulnerabilityRecord> = [
    { title: '漏洞标题/漏洞 ID', dataIndex: 'title', width: 260, render: (title, row) => <div className="primary-cell"><strong>{title}</strong><span>{row.id}</span></div> },
    { title: '关联资产', dataIndex: 'asset', width: 190, ellipsis: true },
    { title: '所属任务', dataIndex: 'task', width: 190, ellipsis: true },
    { title: '首次发现时间', dataIndex: 'discoveredAt', width: 170, render: dateTime },
    { title: '状态', dataIndex: 'status', width: 100, render: (value) => <StatusTag status={value} /> },
    { title: '等级', dataIndex: 'severity', width: 90, render: (value) => <Tag color={value === '严重' ? 'red' : value === '高危' ? 'orange' : 'blue'}>{value}</Tag> },
    { title: '标签', dataIndex: 'tags', render: (tags: string[]) => tags.map((tag) => <Tag key={tag}>{tag}</Tag>) },
    { title: '操作', width: 190, render: (_, row) => <Space><Button type="link" aria-label="查看漏洞详情" onClick={() => setSelected(row)}>详情</Button><Dropdown menu={statusMenu(row)}><Button type="link" loading={mutation.isPending} aria-label="处置漏洞">处置漏洞</Button></Dropdown></Space> },
  ];

  return (
    <ListPage metrics={metrics}>
      <div className="filter-bar material-filter-bar">
        <Input allowClear prefix={<SearchOutlined />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索漏洞名称、ID 或资产" />
        <Select aria-label="漏洞等级" value={severity} allowClear placeholder="全部等级" options={['critical', 'high', 'medium', 'low'].map((value) => ({ value }))} onChange={(value) => { setSeverity(value as VulnerabilitySeverityCode | undefined); setPage(1); }} />
        <Select aria-label="漏洞状态" value={status} allowClear placeholder="全部状态" options={['OPEN', 'FIXING', 'RETESTING', 'FIXED'].map((value) => ({ value }))} onChange={(value) => { setStatus(value as VulnerabilityStatusCode | undefined); setPage(1); }} />
        <div className="filter-spacer" />
        <Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>刷新</Button>
      </div>
      {mutation.isError && <Alert type="error" showIcon message={errorMessage(mutation.error)} />}
      {query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : (
        <Table rowKey="id" columns={columns} dataSource={visibleRows} loading={query.isPending} locale={{ emptyText: '暂无漏洞数据' }} pagination={pagination(page, query.data?.total ?? 0, setPage)} scroll={{ x: 1250 }} />
      )}
      <Drawer open={Boolean(selected)} width={640} title={selected?.title ?? '漏洞详情'} className="material-vulnerability-drawer" onClose={() => setSelected(undefined)}>
        {selected && <div className="detail-drawer">
          <section><h3>基础信息</h3><div className="detail-meta"><span>漏洞 ID <strong>{selected.id}</strong></span><span>风险等级 <Tag color={selected.severity === '严重' ? 'red' : 'orange'}>{selected.severity}</Tag></span><span>当前状态 <StatusTag status={selected.status} /></span><span>关联资产 <strong>{selected.asset}</strong></span><span>所属任务 <strong>{selected.task || '—'}</strong></span><span>首次发现 <strong>{dateTime(selected.discoveredAt)}</strong></span><span>最近更新 <strong>{dateTime(selected.updatedAt)}</strong></span></div></section>
          <Card size="small" className="drawer-insight"><h3><ThunderboltOutlined /> AI 风险研判</h3><p>{selected.description ?? '暂无可验证的风险描述'}</p></Card>
          <Card size="small" className="drawer-remediation"><h3>修复建议</h3><p>请结合漏洞证据和业务影响制定修复方案；当前接口未提供结构化修复建议。</p></Card>
        </div>}
      </Drawer>
    </ListPage>
  );
}

export function ReportsPage() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReportRecord>();
  const [keyword, setKeyword] = useState('');
  const [format, setFormat] = useState<'md' | 'docx' | 'pdf'>();
  const query = useQuery({
    queryKey: ['reports', { page, pageSize: PAGE_SIZE }],
    queryFn: () => listReports({ page, pageSize: PAGE_SIZE }),
  });
  const preview = useMutation({ mutationFn: previewReport });
  const rows = query.data?.items ?? [];
  const bundles = Array.from(rows.reduce((groups, report) => {
    const key = report.taskId ?? report.id;
    const existing = groups.get(key);
    if (existing) existing.formats.set(report.format.toLowerCase(), report);
    else groups.set(key, { key, task: report.task, plan: report.plan, createdAt: report.createdAt, formats: new Map([[report.format.toLowerCase(), report]]) });
    return groups;
  }, new Map<string, { key: string; task: string; plan: string; createdAt: string; formats: Map<string, ReportRecord> }>()).values());
  const visibleBundles = bundles.filter((bundle) => {
    const matchesKeyword = !keyword.trim() || `${bundle.task} ${bundle.plan} ${bundle.key}`.toLowerCase().includes(keyword.trim().toLowerCase());
    return matchesKeyword && (!format || bundle.formats.has(format));
  });
  const metricValue = query.data && !query.isError;
  const metrics: Metric[] = [
    { label: '报告总数', value: metricValue ? String(query.data.total) : '—', tone: 'gray', icon: 'metric-report-total' },
    { label: '本页新增', value: metricValue ? String(bundles.length) : '—', tone: 'red' },
    { label: '待导出', value: metricValue ? String(rows.filter((item) => item.status === 'READY').length) : '—', tone: 'orange' },
    { label: '已导出', value: '—', tone: 'blue' },
    { label: '待确认', value: '—', tone: 'purple' },
    { label: '本月交付', value: '—', tone: 'green' },
  ];
  const columns: ColumnsType<(typeof bundles)[number]> = [
    { title: '所属任务', dataIndex: 'task', width: 260, render: (task, row) => <div className="primary-cell"><strong>{task}</strong><span>{row.key}</span></div> },
    { title: '所属计划', dataIndex: 'plan', width: 190 },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: dateTime },
    { title: '报告格式', width: 360, render: (_, row) => <Space wrap>{(['md', 'docx', 'pdf'] as const).map((format) => {
      const report = row.formats.get(format);
      return report
        ? <a key={format} aria-label={`下载 ${format.toUpperCase()}`} href={reportDownloadUrl(report.id)} download><Tag color="blue">{format.toUpperCase()}</Tag></a>
        : <Tag key={format}>{format.toUpperCase()} 未生成</Tag>;
    })}</Space> },
    { title: '预览', width: 100, render: (_, row) => {
      const report = row.formats.get('md');
      return <Button type="link" disabled={!report?.previewSupported} onClick={() => { if (report) { setSelected(report); preview.mutate(report.id); } }}>预览</Button>;
    } },
  ];

  return (
    <ListPage metrics={metrics}>
      <div className="filter-bar material-filter-bar">
        <Input allowClear prefix={<SearchOutlined />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索报告、任务或计划" />
        <Select allowClear value={format} onChange={setFormat} placeholder="全部格式" options={['md', 'docx', 'pdf'].map((value) => ({ value, label: value.toUpperCase() }))} />
        <div className="filter-spacer" /><Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>刷新</Button>
      </div>
      {query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : (
        <Table rowKey="key" columns={columns} dataSource={visibleBundles} loading={query.isPending} locale={{ emptyText: '暂无报告数据' }} pagination={pagination(page, query.data?.total ?? 0, setPage)} scroll={{ x: 1100 }} />
      )}
      <Drawer open={Boolean(selected)} width={680} title={selected?.name ?? '报告预览'} onClose={() => { setSelected(undefined); preview.reset(); }}>
        {preview.isPending && <p>正在加载报告...</p>}
        {preview.isError && <Alert type="error" showIcon message={errorMessage(preview.error)} />}
        {preview.data && <pre className="report-preview">{preview.data}</pre>}
      </Drawer>
    </ListPage>
  );
}

function ServiceType({ type }: { type: string }) {
  const item = type === '渗透测试'
    ? { icon: <ExperimentOutlined />, color: 'red' }
    : type === '代码审计'
      ? { icon: <CodeOutlined />, color: 'blue' }
      : type === '应急响应'
        ? { icon: <ThunderboltOutlined />, color: 'purple' }
        : { icon: <BarChartOutlined />, color: 'green' };
  return <span className={`service-type ${item.color}`}>{item.icon}{type}</span>;
}

function ListPage({ metrics, children }: { metrics: Metric[]; children: React.ReactNode }) {
  return (
    <div className="page list-page">
      <div className="metric-grid metric-grid-six">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <Card variant="borderless" className="data-card">{children}</Card>
    </div>
  );
}
