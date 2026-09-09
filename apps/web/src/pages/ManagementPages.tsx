import {
  ApiOutlined,
  CheckCircleFilled,
  CloudServerOutlined,
  DatabaseOutlined,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Descriptions,
  Empty,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { createAsset, createAssetsBulk, listAssets, listVulnerabilities, updateAsset } from '../api/resources';
import { MetricCard, StatusTag } from '../components/Ui';
import type { AssetRecord, Metric } from '../types';

type AssetType = 'domain' | 'ip' | 'http' | 'network_range';

const assetSchema = z.object({
  type: z.enum(['domain', 'ip', 'http', 'network_range']),
  address: z.string().trim().min(3, '请输入有效资产地址'),
  owner: z.string().trim().min(2, '请输入所属业务'),
  authorized: z.boolean(),
});

type AssetFormValues = z.infer<typeof assetSchema>;

const assetTypeLabels: Record<AssetType, string> = {
  domain: '域名',
  ip: 'IP',
  http: 'HTTP 地址',
  network_range: '网段',
};

export function AssetsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<AssetType>();
  const [authorizationFilter, setAuthorizationFilter] = useState<'authorized' | 'pending'>();
  const [search, setSearch] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<AssetFormValues[]>([]);
  const query = useQuery({
    queryKey: ['assets', { page, pageSize: 10 }],
    queryFn: () => listAssets({ page, pageSize: 10 }),
  });
  const { control, handleSubmit, reset, formState: { errors } } = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: { type: 'domain', address: '', owner: '', authorized: true },
  });
  const mutation = useMutation({
    mutationFn: createAsset,
    onSuccess: async () => {
      reset();
      setModalOpen(false);
      setPage(1);
      await queryClient.invalidateQueries({ queryKey: ['assets'] });
      message.success('资产已添加');
    },
  });
  const importMutation = useMutation({ mutationFn: createAssetsBulk, onSuccess: async () => { setImportOpen(false); setImportRows([]); await queryClient.invalidateQueries({ queryKey: ['assets'] }); message.success('资产导入成功'); } });
  const bulkAuthMutation = useMutation({ mutationFn: async (value: boolean) => { await Promise.all(selectedRowKeys.map((id) => updateAsset(String(id), { authorized: value }))); }, onSuccess: async () => { setSelectedRowKeys([]); await queryClient.invalidateQueries({ queryKey: ['assets'] }); message.success('批量授权状态已更新'); } });
  const exportAssets = () => {
    const rows = [['资产地址', '类型', '所属业务', '授权状态', '标签'], ...visibleAssets.map((a) => [a.address, assetTypeLabels[a.type as AssetType] ?? a.type, a.owner ?? '', a.authorized ? '已授权' : '待确认', a.tags.join('|')])];
    const csv = '\ufeff' + rows.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'assets.csv'; link.click(); URL.revokeObjectURL(url);
  };
  const parseImport = async (file: File) => { const text = await file.text(); const lines = text.split(/\r?\n/).filter(Boolean); const data = lines[0]?.includes('资产地址') ? lines.slice(1) : lines; const rows = data.map((line) => line.split(',').map((v) => v.replace(/^"|"$/g, '').trim())).filter((r) => r[0]).map((r) => ({ type: (['domain','ip','http','network_range'].includes(r[1]) ? r[1] : 'domain') as AssetType, address: r[0], owner: r[2] || '', authorized: r[3] === '已授权' || r[3] === 'true' })); setImportRows(rows); return false; };
  const downloadImportTemplate = () => { const csv = '\ufeff资产地址,类型,所属业务,授权状态\r\nexample.com,domain,示例业务,待确认'; const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'assets-import-template.csv'; link.click(); URL.revokeObjectURL(url); };

  const addAsset = (values: AssetFormValues) => mutation.mutate({
    asset_type: values.type,
    address: values.address,
    owner: values.owner,
    authorized: values.authorized,
  });

  const assets = query.data?.items ?? [];
  const visibleAssets = assets.filter((asset) => {
    const matchesType = !typeFilter || asset.type === typeFilter;
    const matchesAuthorization = !authorizationFilter || (authorizationFilter === 'authorized' ? asset.authorized : !asset.authorized);
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [asset.address, asset.owner, asset.service, asset.id, ...asset.tags].some((value) => String(value ?? '').toLowerCase().includes(term));
    return matchesType && matchesAuthorization && matchesSearch;
  });
  const assetMetrics: Metric[] = [
    { label: '资产总数', value: query.data && !query.isError ? String(query.data.total) : '—', tone: 'blue' },
    { label: '本页已授权', value: query.data && !query.isError ? String(assets.filter((asset) => asset.authorized).length) : '—', tone: 'green' },
    { label: '本页待授权', value: query.data && !query.isError ? String(assets.filter((asset) => !asset.authorized).length) : '—', tone: 'orange' },
    { label: '本页域名', value: query.data && !query.isError ? String(assets.filter((asset) => asset.type === 'domain').length) : '—', tone: 'purple' },
    { label: '本页 IP', value: query.data && !query.isError ? String(assets.filter((asset) => asset.type === 'ip').length) : '—', tone: 'blue' },
    { label: '本页网段', value: query.data && !query.isError ? String(assets.filter((asset) => asset.type === 'network_range').length) : '—', tone: 'gray' },
  ];

  const columns: ColumnsType<AssetRecord> = [
    { title: '资产地址/ID', dataIndex: 'address', width: 245, render: (address, row) => <div className="primary-cell"><strong>{address}</strong><span>{row.id}</span></div> },
    { title: '类型', dataIndex: 'type', width: 105, render: (type: AssetType) => <Tag color="blue">{assetTypeLabels[type] ?? type}</Tag> },
    { title: '服务信息', dataIndex: 'service', width: 145, render: (value) => value ?? '—' },
    { title: '所属业务', dataIndex: 'owner', width: 140, render: (value) => value ?? '—' },
    { title: '授权状态', dataIndex: 'authorized', width: 110, render: (value) => <StatusTag status={value ? '已授权' : '待确认'} /> },
    { title: '标签', dataIndex: 'tags', render: (tags: string[]) => tags.map((tag) => <Tag key={tag}>{tag}</Tag>) },
    { title: '操作', key: 'actions', render: (_, row) => <Button type="link" href={`/assets/${row.id}`}>查看详情</Button> },
  ];

  return (
    <div className="page list-page assets-page">
      <div className="metric-grid metric-grid-six">{assetMetrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <Card variant="borderless" className="data-card">
        <div className="material-data-heading"><div><h3>资产列表</h3><p>统一管理已发现和已授权的业务资产</p></div></div>
        <div className="filter-bar">
          <Input aria-label="搜索资产" allowClear value={search} placeholder="搜索地址、业务或标签" onChange={(event) => setSearch(event.target.value)} style={{ width: 220 }} />
          <Select
            aria-label="资产类型筛选"
            allowClear
            value={typeFilter}
            placeholder="全部资产类型"
            options={Object.entries(assetTypeLabels).map(([value, label]) => ({ value, label }))}
            onChange={(value) => setTypeFilter(value as AssetType | undefined)}
          />
          <Select aria-label="授权状态筛选" allowClear value={authorizationFilter} placeholder="全部授权状态" options={[{ value: 'authorized', label: '已授权' }, { value: 'pending', label: '待确认' }]} onChange={(value) => setAuthorizationFilter(value as 'authorized' | 'pending' | undefined)} />
          <div className="filter-spacer" />
          <Button onClick={() => query.refetch()}>刷新</Button>
          <Button onClick={() => setImportOpen(true)}>导入资产</Button><Button onClick={downloadImportTemplate}>下载导入模板</Button>
          <Button onClick={exportAssets}>导出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新增资产</Button>
        </div>
        <div className="table-toolbar"><span className="muted">资产授权后才允许发起真实扫描</span>{selectedRowKeys.length > 0 && <Space><span>已选择 {selectedRowKeys.length} 条</span><Button size="small" loading={bulkAuthMutation.isPending} onClick={() => bulkAuthMutation.mutate(true)}>批量授权</Button><Button size="small" loading={bulkAuthMutation.isPending} onClick={() => bulkAuthMutation.mutate(false)}>取消授权</Button></Space>}</div>
        {query.isError ? <Alert type="error" showIcon message={query.error instanceof Error ? query.error.message : '资产加载失败'} action={<Button onClick={() => query.refetch()}>重试</Button>} /> : (
          <Table rowKey="id" rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }} columns={columns} dataSource={visibleAssets} loading={query.isPending} locale={{ emptyText: '暂无符合条件的资产' }} pagination={{ current: page, pageSize: 10, total: typeFilter || authorizationFilter || search ? visibleAssets.length : query.data?.total ?? 0, showSizeChanger: false, onChange: setPage }} scroll={{ x: 900 }} />
        )}
      </Card>
      <Modal title="导入资产" open={importOpen} onCancel={() => { setImportOpen(false); importMutation.reset(); }} onOk={() => { if (!importRows.length) { message.warning('请先选择包含资产的 CSV 文件'); return; } importMutation.mutate(importRows.map(({ type, address, owner, authorized }) => ({ asset_type: type, address, owner, authorized }))); }} okText="确认导入" confirmLoading={importMutation.isPending}>
        {importMutation.isError && <Alert type="error" showIcon message={importMutation.error instanceof Error ? importMutation.error.message : '资产导入失败'} />}
        <p>支持 CSV 文件，列顺序：资产地址、类型、所属业务、授权状态。</p><Button type="link" onClick={downloadImportTemplate}>下载 CSV 导入模板</Button>
        <input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (file) void parseImport(file); }} />
        <p>待导入 {importRows.length} 条</p>
      </Modal>

      <Modal title="新增资产" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSubmit(addAsset)} okText="确认添加" confirmLoading={mutation.isPending}>
        {mutation.isError && <Alert type="error" showIcon message={mutation.error instanceof Error ? mutation.error.message : '资产添加失败'} />}
        <Form layout="vertical" className="asset-form">
          <Form.Item label="资产类型">
            <Controller name="type" control={control} render={({ field }) => (
              <Select {...field} options={Object.entries(assetTypeLabels).map(([value, label]) => ({ value, label }))} />
            )} />
          </Form.Item>
          <Form.Item label="资产地址" validateStatus={errors.address ? 'error' : undefined} help={errors.address?.message}>
            <Controller name="address" control={control} render={({ field }) => (
              <Input {...field} placeholder="例如 admin.example.com 或 10.10.1.0/24" />
            )} />
          </Form.Item>
          <Form.Item label="所属业务" validateStatus={errors.owner ? 'error' : undefined} help={errors.owner?.message}>
            <Controller name="owner" control={control} render={({ field }) => (
              <Input {...field} placeholder="例如电商业务线" />
            )} />
          </Form.Item>
          <Controller name="authorized" control={control} render={({ field }) => (
            <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>已取得该资产的扫描授权</Checkbox>
          )} />
        </Form>
      </Modal>
    </div>
  );
}

export function LegacySettingsPage() {
  const [engineUrl, setEngineUrl] = useState('http://127.0.0.1:8080/api/osCore');
  const [digitalHumanEnabled, setDigitalHumanEnabled] = useState(true);
  const [allowlistOnly, setAllowlistOnly] = useState(true);
  const [testing, setTesting] = useState(false);

  const testConnection = () => {
    setTesting(true);
    window.setTimeout(() => {
      setTesting(false);
      message.success('连接配置格式有效；等待后端接入后执行真实探测');
    }, 600);
  };

  return (
    <div className="page settings-page">
      <div className="settings-banner">
        <div><SettingOutlined /><span><strong>验证模型设置</strong><small>当前配置仅保存在浏览器内，用于确认交互与接口字段。</small></span></div>
        <Tag color="blue">Validation Mode</Tag>
      </div>
      <Tabs
        defaultActiveKey="integration"
        items={[
          {
            key: 'integration',
            label: '外部集成',
            children: (
              <Row gutter={20}>
                <Col span={14}>
          <SettingsCard icon={<CloudServerOutlined />} title="渗透执行引擎" description="平台通过适配器调用预查 WebSocket 和扫描 REST。">
                    <Form layout="vertical">
                      <Form.Item label="REST Base URL"><Input value={engineUrl} onChange={(event) => setEngineUrl(event.target.value)} prefix={<ApiOutlined />} /></Form.Item>
                      <Form.Item label="资产预查 WebSocket"><Input value={`${engineUrl.replace(/^http/, 'ws')}/ws/asset-can`} readOnly /></Form.Item>
                      <Space><Button type="primary" loading={testing} onClick={testConnection}>测试配置</Button><Tag icon={<CheckCircleFilled />} color="green">适配器已启用</Tag></Space>
                    </Form>
                  </SettingsCard>
                </Col>
                <Col span={10}>
                  <SettingsCard icon={<RobotOutlined />} title="智能数字人" description="使用独立 JWT 身份回传资产、漏洞、报告和日志。">
                    <SettingRow title="启用数字人接口" description="/api/ai/*">
                      <Switch checked={digitalHumanEnabled} onChange={setDigitalHumanEnabled} />
                    </SettingRow>
                    <SettingRow title="JWT Audience" description="限制令牌使用范围"><Tag>mcp-xiaoyi</Tag></SettingRow>
                    <SettingRow title="计划关联" description="写入类接口必须携带有效 plan_id"><Tag color="green">强制</Tag></SettingRow>
                  </SettingsCard>
                </Col>
              </Row>
            ),
          },
          {
            key: 'security',
            label: '扫描护栏',
            children: (
              <Row gutter={20}>
                <Col span={12}>
                  <SettingsCard icon={<SafetyCertificateOutlined />} title="授权与范围" description="防止验证流程误触发未授权扫描。">
                    <SettingRow title="仅允许授权资产" description="未授权资产不能创建真实任务"><Switch checked={allowlistOnly} onChange={setAllowlistOnly} /></SettingRow>
              <SettingRow title="单次资产上限" description="与平台网段展开限制保持一致"><InputNumber defaultValue={512} min={1} max={512} /></SettingRow>
                    <SettingRow title="白盒信息" description="仅在最终 chat 提交，不进入预查 WebSocket"><Tag color="blue">隔离传输</Tag></SettingRow>
                  </SettingsCard>
                </Col>
                <Col span={12}>
                  <SettingsCard icon={<LockOutlined />} title="凭据与日志" description="验证模型仍保留必要的安全边界。">
                    <SettingRow title="引擎凭据" description="仅由后端环境变量注入"><Tag color="green">不下发前端</Tag></SettingRow>
                    <SettingRow title="敏感日志脱敏" description="Token、Cookie、白盒凭据不记录"><Switch defaultChecked /></SettingRow>
                    <SettingRow title="真实扫描确认" description="创建任务前必须再次确认"><Switch defaultChecked /></SettingRow>
                  </SettingsCard>
                </Col>
              </Row>
            ),
          },
          {
            key: 'storage',
            label: '数据与存储',
            children: (
              <Row gutter={20}>
                <Col span={12}>
                  <SettingsCard icon={<DatabaseOutlined />} title="PostgreSQL" description="平台任务、漏洞和报告的业务状态来源。">
                    <SettingRow title="连接状态" description="等待后端工程接入"><Tag color="orange">未连接</Tag></SettingRow>
                    <SettingRow title="数据库迁移" description="结构变化统一使用 Alembic"><Tag color="blue">必需</Tag></SettingRow>
                  </SettingsCard>
                </Col>
                <Col span={12}>
                  <SettingsCard icon={<KeyOutlined />} title="验证文件目录" description="当前阶段使用本地受控目录保存附件和报告。">
                    <Form layout="vertical"><Form.Item label="报告目录"><Input defaultValue="./data/reports" /></Form.Item><Button>保存路径</Button></Form>
                  </SettingsCard>
                </Col>
              </Row>
            ),
          },
        ]}
      />
    </div>
  );
}

export function AssetManagementPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['assets', 'management-summary'], queryFn: () => listAssets({ page: 1, pageSize: 100 }) });
  const [selected, setSelected] = useState<React.Key[]>([]);
  const assets = query.data?.items ?? [];
  const authorized = assets.filter((asset) => asset.authorized).length;
  const pending = assets.length - authorized;
  const bulkMutation = useMutation({ mutationFn: async (value: boolean) => Promise.all(selected.map((id) => updateAsset(String(id), { authorized: value }))), onSuccess: async () => { setSelected([]); await queryClient.invalidateQueries({ queryKey: ['assets'] }); await query.refetch(); message.success('资产授权状态已更新'); } });
  const typeRows = Object.entries(assetTypeLabels).map(([type, label]) => ({ type, label, count: assets.filter((asset) => asset.type === type).length }));
  return <div className="page asset-management-page">
    <div className="detail-heading"><div><h2>资产管理</h2><p>统一维护资产归属、授权和安全运营入口</p></div><Space><Button href="/assets">进入资产列表</Button><Button type="primary" href="/assets">新增资产</Button></Space></div>
    <div className="metric-grid metric-grid-six"><MetricCard metric={{ label: '资产总数', value: query.isError ? '—' : String(query.data?.total ?? '—'), tone: 'blue' }} /><MetricCard metric={{ label: '已授权资产', value: query.isPending ? '—' : String(authorized), tone: 'green' }} /><MetricCard metric={{ label: '待确认资产', value: query.isPending ? '—' : String(pending), tone: 'orange' }} /></div>
    <Card variant="borderless" className="data-card"><div className="material-data-heading"><div><h3>管理工作台</h3><p>在一个工作区完成资产归属与授权治理</p></div></div><div className="asset-management-actions"><Button href="/assets">资产列表与筛选</Button><Button href="/assets">导入 / 导出资产</Button><Button disabled={!selected.length} loading={bulkMutation.isPending} onClick={() => bulkMutation.mutate(true)}>批量授权{selected.length ? `（${selected.length}）` : ''}</Button><Button disabled={!selected.length} loading={bulkMutation.isPending} onClick={() => bulkMutation.mutate(false)}>取消授权</Button></div></Card>
    <Card variant="borderless" className="data-card"><h3>待处理资产</h3><Table rowKey="id" size="small" pagination={{ pageSize: 5, showSizeChanger: false }} rowSelection={{ selectedRowKeys: selected, onChange: setSelected }} loading={query.isPending} dataSource={assets.filter((asset) => !asset.authorized)} columns={[{ title: '资产地址', dataIndex: 'address' }, { title: '所属业务', dataIndex: 'owner' }, { title: '状态', dataIndex: 'authorized', render: () => <StatusTag status="待确认" /> }, { title: '操作', render: (_, row) => <Button type="link" href={`/assets/${row.id}`}>查看详情</Button> }]} locale={{ emptyText: '暂无待处理资产' }} /></Card>
    <Card variant="borderless" className="data-card"><h3>资产类型分布</h3><Table rowKey="type" size="small" pagination={false} loading={query.isPending} dataSource={typeRows} columns={[{ title: '类型', dataIndex: 'label' }, { title: '数量', dataIndex: 'count' }]} locale={{ emptyText: '暂无资产数据' }} /></Card>
  </div>;
}

export function AssetDetailPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const query = useQuery({
    queryKey: ['assets', 'detail', assetId],
    queryFn: () => listAssets({ page: 1, pageSize: 100 }),
    enabled: Boolean(assetId),
  });
  const asset = query.data?.items.find((item) => item.id === assetId);
  const vulnerabilitiesQuery = useQuery({ queryKey: ['asset-vulnerabilities', assetId, asset?.address], queryFn: () => listVulnerabilities({ asset: asset?.address, page: 1, pageSize: 20 }), enabled: Boolean(asset?.address) });
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [owner, setOwner] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const editMutation = useMutation({ mutationFn: () => updateAsset(assetId ?? '', { owner, authorized }), onSuccess: async () => { setEditOpen(false); await queryClient.invalidateQueries({ queryKey: ['assets'] }); await query.refetch(); message.success('资产信息已更新'); } });
  if (query.isPending) return <div className="page"><Card loading /></div>;
  if (query.isError || !asset) return <div className="page"><Alert type="error" showIcon message="资产不存在或加载失败" /></div>;
  return (
    <div className="page detail-page asset-detail-page">
      <div className="detail-heading">
        <div><h2>{asset.address}</h2><p>{assetTypeLabels[asset.type as AssetType] ?? asset.type} · {asset.owner ?? '未分配业务'}</p></div>
        <Space><Button type="primary">发起扫描</Button><Button>发起渗透测试</Button><Button onClick={() => { setOwner(asset.owner ?? ''); setAuthorized(asset.authorized); setEditOpen(true); }}>编辑资产</Button><Button>导出资产报告</Button></Space>
      </div>
      <Card variant="borderless" className="data-card">
        <h3>资产信息</h3>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="资产地址">{asset.address}</Descriptions.Item>
          <Descriptions.Item label="资产类型">{assetTypeLabels[asset.type as AssetType] ?? asset.type}</Descriptions.Item>
          <Descriptions.Item label="所属业务">{asset.owner ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="授权状态"><StatusTag status={asset.authorized ? '已授权' : '待确认'} /></Descriptions.Item>
          <Descriptions.Item label="首次发现">{asset.createdAt}</Descriptions.Item>
          <Descriptions.Item label="最近更新">{asset.updatedAt}</Descriptions.Item>
          <Descriptions.Item label="标签" span={2}>{asset.tags.length ? asset.tags.map((tag) => <Tag key={tag}>{tag}</Tag>) : '—'}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card variant="borderless" className="data-card"><Tabs items={[{ key: 'vulnerabilities', label: '关联漏洞', children: vulnerabilitiesQuery.isPending ? <div>正在加载关联漏洞...</div> : vulnerabilitiesQuery.isError ? <Alert type="error" message="关联漏洞加载失败" /> : vulnerabilitiesQuery.data?.items.length ? <Table rowKey="id" size="small" pagination={false} dataSource={vulnerabilitiesQuery.data.items} columns={[{ title: '漏洞', dataIndex: 'title' }, { title: '严重性', dataIndex: 'severity' }, { title: '状态', dataIndex: 'status' }]} /> : <Empty description="暂无关联漏洞" /> }, { key: 'tasks', label: '关联任务', children: <Empty description="暂无关联任务" /> }, { key: 'history', label: '扫描历史', children: <Empty description="暂无扫描记录" /> }]} /></Card>
      <Modal title="编辑资产" open={editOpen} onCancel={() => setEditOpen(false)} onOk={() => editMutation.mutate()} confirmLoading={editMutation.isPending}>
        {editMutation.isError && <Alert type="error" showIcon message="资产更新失败，请稍后重试" />}
        <Form layout="vertical"><Form.Item label="所属业务"><Input value={owner} onChange={(event) => setOwner(event.target.value)} /></Form.Item><Form.Item label="授权状态"><Switch checked={authorized} onChange={setAuthorized} checkedChildren="已授权" unCheckedChildren="待确认" /></Form.Item></Form>
      </Modal>
    </div>
  );
}

export { ManagementSettingsPage as SettingsPage } from './SystemSettingsPage';

function SettingsCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card variant="borderless" className="settings-card">
      <div className="settings-card-title"><span>{icon}</span><div><h3>{title}</h3><p>{description}</p></div></div>
      {children}
    </Card>
  );
}

function SettingRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <div className="setting-row"><div><strong>{title}</strong><span>{description}</span></div>{children}</div>;
}
