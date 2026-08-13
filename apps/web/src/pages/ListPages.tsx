import {
  BarChartOutlined,
  CodeOutlined,
  ExperimentOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, DatePicker, Descriptions, Drawer, Dropdown, Input, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  listReports,
  listTasks,
  listVulnerabilities,
  previewReport,
  reportDownloadUrl,
  updateVulnerability,
  deleteTask,
  deleteVulnerability,
  stopTask,
} from '../api/resources';
import type {
  TaskStatusCode,
  VulnerabilitySeverityCode,
  VulnerabilityStatusCode,
} from '../api/resources';
import { MetricCard, ProgressCell, StatusTag } from '../components/Ui';
import { VulnerabilityPreviewDrawer } from '../components/VulnerabilityPreviewDrawer';
import type { Metric, ReportRecord, TaskRecord, VulnerabilityRecord } from '../types';
import { displayPhase } from '../vendorDisplay';

const PAGE_SIZE = 10;
const { RangePicker } = DatePicker;

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<TaskRecord>();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [testType, setTestType] = useState<string>();
  const [creator, setCreator] = useState<string>();
  const [createdRange, setCreatedRange] = useState<[string, string]>();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStatus = searchParams.get('status');
  const status = requestedStatus && ['QUEUED', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'PARTIAL_SUCCEEDED', 'FAILED', 'CANCELLED'].includes(requestedStatus)
    ? requestedStatus as TaskStatusCode
    : undefined;
  const query = useQuery({
    queryKey: ['tasks', { page, pageSize: PAGE_SIZE, status, keyword, testType, creator, createdRange }],
    queryFn: () => listTasks({ page, pageSize: PAGE_SIZE, status, keyword: keyword.trim() || undefined, testType, creator, createdFrom: createdRange?.[0], createdTo: createdRange?.[1] }),
  });
  const rows = query.data?.items ?? [];
  const visibleRows = rows;
  const stopMutation = useMutation({
    mutationFn: stopTask,
    onSuccess: () => { message.success('暂停请求已提交'); void queryClient.invalidateQueries({ queryKey: ['tasks'] }); },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => { message.success('任务已删除'); void queryClient.invalidateQueries({ queryKey: ['tasks'] }); },
  });
  const taskMetrics = query.data?.metrics;
  const metrics = pageMetrics('全部任务', taskMetrics?.total, query.isError, [
    { label: '排队中', value: taskMetrics?.queued ?? 0, tone: 'orange', icon: 'metric-task-queued' },
    { label: '进行中', value: taskMetrics?.running ?? 0, tone: 'blue', icon: 'metric-task-running' },
    { label: '已完成', value: taskMetrics?.completed ?? 0, tone: 'green', icon: 'metric-task-completed' },
    { label: '异常', value: taskMetrics?.failed ?? 0, tone: 'red', icon: 'metric-task-abnormal' },
    { label: '已停止', value: taskMetrics?.cancelled ?? 0, tone: 'gray', icon: 'metric-task-all' },
  ]);
  const columns: ColumnsType<TaskRecord> = [
    { title: '任务名称/ID', dataIndex: 'name', width: 220, render: (name, row) => <div className="primary-cell"><strong>{name}</strong><span>{row.id}</span></div> },
    { title: '类型', dataIndex: 'type', width: 130, render: (type) => <ServiceType type={type} /> },
    { title: '目标/资产摘要', dataIndex: 'target', ellipsis: true },
    { title: '创建时间', dataIndex: 'createdAt', width: 170, render: dateTime },
    { title: '创建人', dataIndex: 'creator', width: 150, render: (value) => <span className="table-nowrap" title={value}>{value}</span> },
    { title: '当前状态', dataIndex: 'status', width: 110, render: (value) => <StatusTag status={value} /> },
    { title: '进度', dataIndex: 'progress', width: 150, render: (value, row) => <ProgressCell value={value} tone={row.status === '异常' ? 'red' : row.status === '已完成' ? 'green' : 'blue'} /> },
      { title: '阶段', dataIndex: 'phase', width: 120, render: (value) => displayPhase(value) },
    { title: '操作', width: 250, fixed: 'right', render: (_, row) => <Space size={2}>
      <Button type="link" onClick={() => setSelected(row)}>摘要</Button>
      <Button type="link" aria-label="打开执行页" onClick={() => navigate(`/pentest/session/${row.id}`)}>详情</Button>
      {['QUEUED', 'RUNNING'].includes(row.statusCode) && <Popconfirm title="确认暂停该任务？" description="暂停请求将提交到执行引擎。" onConfirm={() => stopMutation.mutate(row.id)}><Button type="link" loading={stopMutation.isPending}>暂停</Button></Popconfirm>}
      {['SUCCEEDED', 'PARTIAL_SUCCEEDED', 'FAILED', 'CANCELLED'].includes(row.statusCode) && <Popconfirm title="确认删除该任务？" description="执行记录将删除，漏洞和报告仍会保留。" okButtonProps={{ danger: true }} onConfirm={() => deleteMutation.mutate(row.id)}><Button type="link" danger loading={deleteMutation.isPending}>删除</Button></Popconfirm>}
    </Space> },
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
        <Select aria-label="任务类型" value={testType} allowClear placeholder="全部类型" options={[{ value: 'standard', label: '渗透测试' }, { value: 'discovery', label: '资产发现' }]} onChange={(value) => { setTestType(value); setPage(1); }} />
        <Select aria-label="创建人" value={creator} allowClear showSearch placeholder="全部创建人" options={Array.from(new Set(rows.map((item) => item.creator))).map((value) => ({ value, label: value }))} onChange={(value) => { setCreator(value); setPage(1); }} />
        <RangePicker aria-label="任务创建时间" onChange={(_, values) => { setCreatedRange(values[0] && values[1] ? [`${values[0]}T00:00:00Z`, `${values[1]}T23:59:59Z`] : undefined); setPage(1); }} />
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
      <Drawer open={Boolean(selected)} width={520} title="任务摘要" onClose={() => setSelected(undefined)}>
        {selected && <div className="task-summary-drawer">
          <Descriptions column={1} size="small" bordered items={[
            { key: 'name', label: '任务名称', children: selected.name },
            { key: 'id', label: '任务 ID', children: selected.id },
            { key: 'target', label: '目标/资产', children: selected.target },
            { key: 'type', label: '任务类型', children: selected.type },
            { key: 'creator', label: '创建人', children: selected.creator },
            { key: 'status', label: '当前状态', children: <StatusTag status={selected.status} /> },
            { key: 'progress', label: '执行进度', children: <ProgressCell value={selected.progress} tone={selected.statusCode === 'FAILED' ? 'red' : selected.statusCode === 'SUCCEEDED' ? 'green' : 'blue'} /> },
            { key: 'phase', label: '当前阶段', children: displayPhase(selected.phase) },
          ]} />
          <Card size="small" title="摘要" className="task-summary-copy"><p>{selected.errorMessage || `${selected.name} 当前处于${selected.status}，执行进度 ${selected.progress}%，目标为 ${selected.target}。`}</p></Card>
          <Button type="primary" block onClick={() => navigate(`/pentest/session/${selected.id}`)}>查看任务详情</Button>
        </div>}
      </Drawer>
    </ListPage>
  );
}

export function VulnerabilitiesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState<VulnerabilitySeverityCode>();
  const [status, setStatus] = useState<VulnerabilityStatusCode>();
  const [keyword, setKeyword] = useState('');
  const [createdRange, setCreatedRange] = useState<[string, string]>();
  const [selectedId, setSelectedId] = useState<string>();
  const query = useQuery({
    queryKey: ['vulnerabilities', { page, pageSize: PAGE_SIZE, severity, status, keyword, createdRange }],
    queryFn: () => listVulnerabilities({ page, pageSize: PAGE_SIZE, severity, status, keyword: keyword.trim() || undefined, createdFrom: createdRange?.[0], createdTo: createdRange?.[1] }),
  });
  const mutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: VulnerabilityStatusCode }) => updateVulnerability(id, nextStatus),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vulnerabilities'] }),
  });
  const remove = useMutation({
    mutationFn: deleteVulnerability,
    onSuccess: () => { message.success('漏洞已删除'); setSelectedId(undefined); void queryClient.invalidateQueries({ queryKey: ['vulnerabilities'] }); },
  });
  const rows = query.data?.items ?? [];
  const visibleRows = rows;
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
    { title: '操作', width: 250, fixed: 'right', render: (_, row) => <Space size={2}><Button type="link" aria-label="查看漏洞详情" onClick={() => setSelectedId(row.id)}>详情</Button><Dropdown menu={statusMenu(row)}><Button type="link" loading={mutation.isPending} aria-label="处置漏洞">处置</Button></Dropdown><Popconfirm title="确认删除该漏洞？" description="删除后无法恢复。" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(row.id)}><Button type="link" danger loading={remove.isPending}>删除</Button></Popconfirm></Space> },
  ];

  return (
    <ListPage metrics={metrics}>
      <div className="filter-bar material-filter-bar">
        <Input allowClear prefix={<SearchOutlined />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索漏洞名称、ID 或资产" />
        <Select aria-label="漏洞等级" value={severity} allowClear placeholder="全部等级" options={['critical', 'high', 'medium', 'low'].map((value) => ({ value }))} onChange={(value) => { setSeverity(value as VulnerabilitySeverityCode | undefined); setPage(1); }} />
        <Select aria-label="漏洞状态" value={status} allowClear placeholder="全部状态" options={['OPEN', 'FIXING', 'RETESTING', 'FIXED'].map((value) => ({ value }))} onChange={(value) => { setStatus(value as VulnerabilityStatusCode | undefined); setPage(1); }} />
        <RangePicker aria-label="漏洞发现时间" onChange={(_, values) => { setCreatedRange(values[0] && values[1] ? [`${values[0]}T00:00:00Z`, `${values[1]}T23:59:59Z`] : undefined); setPage(1); }} />
        <div className="filter-spacer" />
        <Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>刷新</Button>
      </div>
      {mutation.isError && <Alert type="error" showIcon message={errorMessage(mutation.error)} />}
      {query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : (
        <Table rowKey="id" columns={columns} dataSource={visibleRows} loading={query.isPending} locale={{ emptyText: '暂无漏洞数据' }} pagination={pagination(page, query.data?.total ?? 0, setPage)} scroll={{ x: 1250 }} />
      )}
      <VulnerabilityPreviewDrawer vulnerabilityId={selectedId} onClose={() => setSelectedId(undefined)} />
    </ListPage>
  );
}

export function ReportsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ReportRecord>();
  const [keyword, setKeyword] = useState('');
  const [format, setFormat] = useState<'md' | 'docx' | 'pdf'>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<string>(() => searchParams.get('status') ?? '');
  const [createdRange, setCreatedRange] = useState<[string, string]>();
  const query = useQuery({
    queryKey: ['reports', { page, pageSize: PAGE_SIZE, keyword, format, status, createdRange }],
    queryFn: () => listReports({ page, pageSize: PAGE_SIZE, keyword: keyword.trim() || undefined, format, status, createdFrom: createdRange?.[0], createdTo: createdRange?.[1] }),
  });
  const preview = useMutation({
    mutationFn: previewReport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
  });
  const rows = query.data?.items ?? [];
  const bundles = Array.from(rows.reduce((groups, report) => {
    const key = report.taskId ?? report.id;
    const existing = groups.get(key);
    if (existing) existing.formats.set(report.format.toLowerCase(), report);
    else groups.set(key, { key, task: report.task, plan: report.plan, createdAt: report.createdAt, formats: new Map([[report.format.toLowerCase(), report]]) });
    return groups;
  }, new Map<string, { key: string; task: string; plan: string; createdAt: string; formats: Map<string, ReportRecord> }>()).values());
  const visibleBundles = bundles;
  const metricValue = query.data && !query.isError;
  const metrics: Metric[] = [
    { label: '报告总数', value: metricValue ? String(query.data.total) : '—', tone: 'gray', icon: 'metric-report-total' },
    { label: '本页新增', value: metricValue ? String(bundles.length) : '—', tone: 'red' },
    { label: '待导出', value: metricValue ? String(rows.filter((item) => !item.firstExportedAt).length) : '—', tone: 'orange' },
    { label: '已导出', value: metricValue ? String(rows.filter((item) => item.firstExportedAt).length) : '—', tone: 'blue' },
    { label: '待确认', value: metricValue ? String(rows.filter((item) => !item.firstViewedAt).length) : '—', tone: 'purple' },
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
    { title: '生命周期', width: 120, render: (_, row) => {
      const reports = Array.from(row.formats.values());
      const lifecycle = reports.some((report) => report.firstExportedAt)
        ? { label: '已导出', color: 'green' }
        : reports.some((report) => !report.firstViewedAt)
          ? { label: '待确认', color: 'orange' }
          : { label: '待导出', color: 'blue' };
      return <Tag color={lifecycle.color}>{lifecycle.label}</Tag>;
    } },
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
        <Select aria-label="报告状态" allowClear value={status || undefined} onChange={(value) => { setStatus(value ?? ''); setSearchParams(value ? { status: value } : {}, { replace: true }); setPage(1); }} placeholder="全部状态" options={[{ value: 'PENDING_EXPORT', label: '待导出' }, { value: 'EXPORTED', label: '已导出' }, { value: 'PENDING_CONFIRMATION', label: '待确认' }]} />
        <RangePicker aria-label="报告创建时间" onChange={(_, values) => { setCreatedRange(values[0] && values[1] ? [`${values[0]}T00:00:00Z`, `${values[1]}T23:59:59Z`] : undefined); setPage(1); }} />
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
