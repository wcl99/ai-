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
import { visibleTaskError } from '../vendorDisplay';
import {
  listReports,
  listTasks,
  listVulnerabilities,
  getTaskRiskSummary,
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
import { MetricCard, ProgressCell, SeverityTag, StatusTag } from '../components/Ui';
import { VulnerabilityPreviewDrawer } from '../components/VulnerabilityPreviewDrawer';
import type { Metric, ReportRecord, TaskRecord, VulnerabilityRecord } from '../types';
import { displayPhase } from '../vendorDisplay';
import './VulnerabilityListPage.css';
import './ReportListPage.css';

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

function TaskRiskSummary({ taskId }: { taskId: string }) {
  const query = useQuery({
    queryKey: ['task-risk-summary', taskId],
    queryFn: () => getTaskRiskSummary(taskId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  if (query.isPending) return <Card size="small" title="任务风险评分" className="task-risk-summary"><p>正在分析任务漏洞...</p></Card>;
  if (query.isError || !query.data) return <Card size="small" title="任务风险评分" className="task-risk-summary"><Alert type="warning" showIcon message={errorMessage(query.error)} /></Card>;
  const summary = query.data;
  return <section className="task-risk-summary" aria-label="任务漏洞摘要">
    <Card size="small" title="任务风险评分" className="task-risk-score-card">
      <div className="task-risk-score-top">
        <strong>{summary.score === null ? '—' : summary.score.toFixed(1)}</strong>
        {['暂无评分', '无风险'].includes(summary.level) ? <Tag>{summary.level}</Tag> : <SeverityTag severity={summary.level} />}
      </div>
      <p>{summary.rationale}</p>
      {summary.source === 'deepseek' && <small>依据 CVSS v3.1 生成</small>}
      {summary.message && <small>{summary.message}</small>}
    </Card>
    <Card size="small" title={`任务中探测到的漏洞（${summary.vulnerabilities.length}）`} className="task-findings-card">
      {summary.vulnerabilities.length === 0 ? <p>本次任务未发现漏洞。</p> : <ul>
        {summary.vulnerabilities.map((item) => <li key={item.id}>
          <div><strong>{item.title}</strong><span>{item.asset_key || '未关联资产'}</span></div>
          <div>{item.severity === 'unknown' ? <Tag>未知</Tag> : <SeverityTag severity={item.severity} />}{item.cvss_score !== null && <em>CVSS {item.cvss_score.toFixed(1)}</em>}</div>
        </li>)}
      </ul>}
    </Card>
  </section>;
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
          <TaskRiskSummary taskId={selected.id} />
          <Card size="small" title="摘要" className="task-summary-copy"><p>{visibleTaskError(selected.errorMessage) || `${selected.name} 当前处于${selected.status}，执行进度 ${selected.progress}%，目标为 ${selected.target}。`}</p></Card>
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
    queryKey: ['vulnerabilities', { page, pageSize: 5, severity, status, keyword, createdRange }],
    queryFn: () => listVulnerabilities({ page, pageSize: 5, severity, status, keyword: keyword.trim() || undefined, createdFrom: createdRange?.[0], createdTo: createdRange?.[1] }),
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
  const metrics = [
    ['漏洞总数', query.isError ? '—' : query.data?.total ?? 0, 4],
    ['高危漏洞', query.isError ? '—' : rows.filter((item) => ['严重', '高危'].includes(item.severity)).length, 5],
    ['中危漏洞', query.isError ? '—' : rows.filter((item) => item.severity === '中危').length, 6],
    ['待修复', query.isError ? '—' : rows.filter((item) => item.statusCode === 'OPEN').length, 7],
    ['待复测', query.isError ? '—' : rows.filter((item) => item.statusCode === 'RETESTING').length, 8],
    ['已修复', query.isError ? '—' : rows.filter((item) => item.statusCode === 'FIXED').length, 9],
  ] as const;
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
    { title: '漏洞标题/漏洞 ID', dataIndex: 'title', width: 228, render: (title, row) => <div className="figma-vulnerability-primary"><strong>{title}</strong><span>{row.id}</span></div> },
    { title: '来源模块', width: 124, render: () => <span className="figma-vulnerability-source"><img src="/figma/vulnerability-list/table-05.svg" alt="" />渗透测试</span> },
    { title: '关联资产', dataIndex: 'asset', width: 192, render: (asset) => <div className="figma-vulnerability-primary"><strong>{asset}</strong><span>资产</span></div> },
    { title: '所属任务', dataIndex: 'task', width: 168, render: (task) => <div className="figma-vulnerability-primary"><strong>{task || '未关联任务'}</strong><span>—</span></div> },
    { title: '首次发现时间', dataIndex: 'discoveredAt', width: 168, render: dateTime },
    { title: '最近发现时间', dataIndex: 'updatedAt', width: 168, render: dateTime },
    { title: '状态', dataIndex: 'status', width: 112, render: (value) => <StatusTag status={value} /> },
    { title: '等级', dataIndex: 'severity', width: 112, render: (value) => <SeverityTag severity={value} /> },
    { title: 'AI标签', dataIndex: 'tags', width: 148, render: (tags: string[]) => <div className="figma-vulnerability-tags">{tags.slice(0, 2).map((tag) => <Tag key={tag}>{tag}</Tag>)}</div> },
    { title: '操作', width: 126, fixed: 'right', render: (_, row) => <Space size={0} className="figma-vulnerability-actions"><Button type="link" aria-label="查看漏洞详情" onClick={() => setSelectedId(row.id)}>详情</Button><Dropdown menu={statusMenu(row)}><Button type="link" loading={mutation.isPending} aria-label="处置漏洞">处置</Button></Dropdown><Popconfirm title="确认删除该漏洞？" description="删除后无法恢复。" okButtonProps={{ danger: true }} onConfirm={() => remove.mutate(row.id)}><Button type="text" danger loading={remove.isPending} aria-label="删除"><img src="/figma/vulnerability-list/table-06.svg" alt="" /></Button></Popconfirm></Space> },
  ];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 5));
  const resetFilters = () => {
    setKeyword('');
    setSeverity(undefined);
    setStatus(undefined);
    setCreatedRange(undefined);
    setPage(1);
  };

  return (
    <div className="figma-vulnerability-list" data-node-id="1:4187">
      <section className="figma-vulnerability-metrics" data-node-id="1:4273">
        {metrics.map(([label, value, icon]) => <article className="figma-vulnerability-metric" key={label}>
          <img className="figma-vulnerability-metric-art" src={`/figma/vulnerability-list/metric-0${icon}.svg`} alt="" />
          <span>{label}</span><strong>{value}</strong><small><b>—</b> 较昨日</small>
        </article>)}
      </section>
      <section className="figma-vulnerability-data" data-node-id="1:4370">
        <div className="figma-vulnerability-filters" data-node-id="1:4371">
          <div className="figma-vulnerability-filter-row">
            <label>漏洞等级<Select aria-label="漏洞等级" value={severity} allowClear placeholder="全部" options={[['critical', '严重'], ['high', '高危'], ['medium', '中危'], ['low', '低危']].map(([value, label]) => ({ value, label }))} onChange={(value) => { setSeverity(value as VulnerabilitySeverityCode | undefined); setPage(1); }} /></label>
            <label>漏洞状态<Select aria-label="漏洞状态" value={status} allowClear placeholder="全部" options={[['OPEN', '待修复'], ['FIXING', '修复中'], ['RETESTING', '待复测'], ['FIXED', '已修复']].map(([value, label]) => ({ value, label }))} onChange={(value) => { setStatus(value as VulnerabilityStatusCode | undefined); setPage(1); }} /></label>
            {['来源模块', '资产类型', '所属业务'].map((label) => <label key={label}>{label}<Select aria-label={label} placeholder="全部" options={[{ value: 'all', label: '全部' }]} /></label>)}
            <Button>更多筛选</Button>
            <Input className="figma-vulnerability-search" allowClear prefix={<SearchOutlined />} value={keyword} onChange={(event) => { setKeyword(event.target.value); setPage(1); }} placeholder="搜索漏洞标题、漏洞 ID、资产、任务..." />
            <Button type="primary" onClick={() => query.refetch()}>搜索</Button>
            <Button onClick={resetFilters}>重置</Button>
            <Button className="figma-vulnerability-save">保存视图</Button>
          </div>
          <div className="figma-vulnerability-filter-row figma-vulnerability-filter-row-secondary">
            <label className="figma-vulnerability-date-label">时间范围<span>首次发现时间</span><RangePicker key={createdRange ? 'set' : 'clear'} aria-label="漏洞发现时间" onChange={(_, values) => { setCreatedRange(values[0] && values[1] ? [`${values[0]}T00:00:00Z`, `${values[1]}T23:59:59Z`] : undefined); setPage(1); }} /></label>
            <span>是否需人工复测</span>
            <label className="figma-vulnerability-check"><input type="checkbox" /> AI 推荐优先</label>
            <label className="figma-vulnerability-check"><input type="checkbox" /> 是否已生成报告</label>
            <Button type="link" className="figma-vulnerability-clear" onClick={resetFilters}>清空筛选</Button>
          </div>
        </div>
        <div className="figma-vulnerability-bulk" data-node-id="1:4470">
          <span>已选择 <b>0</b> 项</span><i />
          <Button icon={<img src="/figma/vulnerability-list/table-01.svg" alt="" />}>批量指派</Button>
          <Button icon={<img src="/figma/vulnerability-list/table-02.svg" alt="" />}>批量变更状态</Button>
          <Button icon={<img src="/figma/vulnerability-list/table-03.svg" alt="" />}>批量加入报告</Button>
          <Button className="figma-vulnerability-export" icon={<img src="/figma/vulnerability-list/table-04.svg" alt="" />} onClick={() => query.refetch()}>导出</Button>
        </div>
        {mutation.isError && <Alert type="error" showIcon message={errorMessage(mutation.error)} />}
        {query.isError && <ErrorState error={query.error} retry={() => query.refetch()} />}
        <Table className="figma-vulnerability-table" rowKey="id" columns={columns} dataSource={visibleRows} loading={query.isPending} locale={{ emptyText: '暂无漏洞数据' }} pagination={false} scroll={{ x: 1594 }} />
        <footer className="figma-vulnerability-pagination" data-node-id="1:4814">
          <span>共{total}条记录，当前显示 {total ? (page - 1) * 5 + 1 : 0} - {Math.min(page * 5, total)} 条（点击可查看详情）</span>
          <div><Button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>{Array.from({ length: Math.min(3, pages) }, (_, index) => index + 1).map((number) => <Button type={number === page ? 'primary' : 'default'} key={number} onClick={() => setPage(number)}>{number}</Button>)}{pages > 3 && <span>...</span>}<Button disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</Button></div>
        </footer>
      </section>
      <VulnerabilityPreviewDrawer vulnerabilityId={selectedId} onClose={() => setSelectedId(undefined)} />
    </div>
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
  const metrics = [
    { label: '报告总数', value: metricValue ? String(query.data.total) : '—', art: 'metric-01.svg' },
    { label: '本周新增', value: '—', art: 'metric-02.svg' },
    { label: '待导出', value: metricValue ? String(rows.filter((item) => !item.firstExportedAt).length) : '—', art: 'metric-03.svg' },
    { label: '已导出', value: metricValue ? String(rows.filter((item) => item.firstExportedAt).length) : '—', art: 'metric-04.svg' },
    { label: '待确认', value: metricValue ? String(rows.filter((item) => !item.firstViewedAt).length) : '—', art: 'metric-05.svg' },
    { label: '本月交付', value: '—', art: 'metric-06.svg' },
  ];
  const columns: ColumnsType<(typeof bundles)[number]> = [
    { title: '报告名称', width: 240, render: (_, row) => { const report = Array.from(row.formats.values())[0]; return <div className="figma-report-primary"><strong>{report?.name ?? '—'}</strong><span>{report?.id ?? row.key}</span></div>; } },
    { title: '类型', width: 132, render: (_, row) => <span className="figma-report-type"><ExperimentOutlined />{row.task === '—' ? '—' : '渗透测试'}</span> },
    { title: '资产分组', width: 148, render: () => '—' },
    { title: '所属任务', dataIndex: 'task', width: 260, render: (task, row) => <div className="figma-report-primary"><strong>{task}</strong><span>{row.key}</span></div> },
    { title: '创建时间', dataIndex: 'createdAt', width: 188, render: dateTime },
    { title: '状态', width: 124, render: (_, row) => <Tag className="figma-report-state">{Array.from(row.formats.values()).some((item) => !item.firstViewedAt) ? '待确认' : '已完成'}</Tag> },
    { title: '导出状态', width: 124, render: (_, row) => <Tag className="figma-report-export-state">{Array.from(row.formats.values()).some((item) => item.firstExportedAt) ? '已导出' : '未导出'}</Tag> },
    { title: '报告信息', width: 200, render: (_, row) => <div className="figma-report-formats">{(['md', 'docx', 'pdf'] as const).map((format) => {
      const report = row.formats.get(format);
      return report
        ? <a key={format} aria-label={`下载 ${format.toUpperCase()}`} href={reportDownloadUrl(report.id)} download><Tag color="blue">{format.toUpperCase()}</Tag></a>
        : null;
      })}</div> },
    { title: '操作', width: 130, fixed: 'right', render: (_, row) => {
      const report = row.formats.get('md');
      const downloadable = report ?? Array.from(row.formats.values())[0];
      return <div className="figma-report-actions"><Button type="link" disabled={!report?.previewSupported} onClick={() => { if (report) { setSelected(report); preview.mutate(report.id); } }}>预览</Button>{downloadable && <a href={reportDownloadUrl(downloadable.id)} download>下载</a>}</div>;
    } },
  ];

  const resetFilters = () => {
    setKeyword(''); setFormat(undefined); setStatus(''); setCreatedRange(undefined); setSearchParams({}, { replace: true }); setPage(1);
  };
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="figma-report-list" data-node-id="1:9473">
      <div className="figma-report-metrics" data-node-id="1:9609">{metrics.map((metric) => <article className="figma-report-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small><b>—</b>较昨日</small><img src={`/figma/report-list/${metric.art}`} alt="" /></article>)}</div>
      <section className="figma-report-data" data-node-id="1:9706">
        <div className="figma-report-filters" data-node-id="1:9707">
          <label>报告类型<Select allowClear value={format} onChange={setFormat} placeholder="全部" options={['md', 'docx', 'pdf'].map((value) => ({ value, label: value.toUpperCase() }))} /></label>
          <label>报告状态<Select aria-label="报告状态" allowClear value={status || undefined} onChange={(value) => { setStatus(value ?? ''); setSearchParams(value ? { status: value } : {}, { replace: true }); setPage(1); }} placeholder="全部" options={[{ value: 'PENDING_EXPORT', label: '待导出' }, { value: 'EXPORTED', label: '已导出' }, { value: 'PENDING_CONFIRMATION', label: '待确认' }]} /></label>
          <label>资产分组<Select disabled placeholder="全部" options={[]} /></label>
          <label>创建时间<RangePicker aria-label="报告创建时间" onChange={(_, values) => { setCreatedRange(values[0] && values[1] ? [`${values[0]}T00:00:00Z`, `${values[1]}T23:59:59Z`] : undefined); setPage(1); }} /></label>
          <Input className="figma-report-search" allowClear prefix={<SearchOutlined />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索报告名称、ID、任务、创建人..." />
          <Button type="primary" onClick={() => setPage(1)}>搜索</Button><Button onClick={resetFilters}>重置</Button>
        </div>
        <div className="figma-report-bulk" data-node-id="1:9760"><span>已选择 <b>0</b> 项</span><div><Button>批量导出</Button><Button onClick={() => query.refetch()}>导出列表</Button></div></div>
        {query.isError && <ErrorState error={query.error} retry={() => query.refetch()} />}
        <Table className="figma-report-table" rowKey="key" columns={columns} dataSource={visibleBundles} loading={query.isPending} locale={{ emptyText: '暂无报告数据' }} pagination={false} scroll={{ x: 1594 }} />
        <footer className="figma-report-pagination" data-node-id="1:10177"><span>共{total}份报告，当前显示 {total ? (page - 1) * PAGE_SIZE + 1 : 0} - {Math.min(page * PAGE_SIZE, total)} 份（点击可查看详情）</span><div><Button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>{Array.from({ length: Math.min(3, pages) }, (_, index) => index + 1).map((number) => <Button type={number === page ? 'primary' : 'default'} key={number} onClick={() => setPage(number)}>{number}</Button>)}{pages > 3 && <span>...</span>}<Button disabled={page >= pages} onClick={() => setPage(page + 1)}>下一页</Button></div></footer>
      </section>
      <Drawer open={Boolean(selected)} width={680} title={selected?.name ?? '报告预览'} onClose={() => { setSelected(undefined); preview.reset(); }}>
        {preview.isPending && <p>正在加载报告...</p>}
        {preview.isError && <Alert type="error" showIcon message={errorMessage(preview.error)} />}
        {preview.data && <pre className="report-preview">{preview.data}</pre>}
      </Drawer>
    </div>
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
