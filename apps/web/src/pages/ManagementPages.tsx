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
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { createAsset, listAssets } from '../api/resources';
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

  const addAsset = (values: AssetFormValues) => mutation.mutate({
    asset_type: values.type,
    address: values.address,
    owner: values.owner,
    authorized: values.authorized,
  });

  const assets = query.data?.items ?? [];
  const visibleAssets = typeFilter ? assets.filter((asset) => asset.type === typeFilter) : assets;
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
  ];

  return (
    <div className="page list-page assets-page">
      <div className="metric-grid metric-grid-six">{assetMetrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <Card variant="borderless" className="data-card">
        <div className="material-data-heading"><div><h3>资产列表</h3><p>统一管理已发现和已授权的业务资产</p></div></div>
        <div className="filter-bar">
          <Select
            aria-label="资产类型筛选"
            allowClear
            value={typeFilter}
            placeholder="全部资产类型"
            options={Object.entries(assetTypeLabels).map(([value, label]) => ({ value, label }))}
            onChange={(value) => setTypeFilter(value as AssetType | undefined)}
          />
          <div className="filter-spacer" />
          <Button onClick={() => query.refetch()}>刷新</Button>
          <Button disabled title="导入接口尚未确认">导入资产</Button>
          <Button disabled title="导出接口尚未确认">导出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新增资产</Button>
        </div>
        <div className="table-toolbar"><span className="muted">资产授权后才允许发起真实扫描</span></div>
        {query.isError ? <Alert type="error" showIcon message={query.error instanceof Error ? query.error.message : '资产加载失败'} action={<Button onClick={() => query.refetch()}>重试</Button>} /> : (
          <Table rowKey="id" columns={columns} dataSource={visibleAssets} loading={query.isPending} locale={{ emptyText: '暂无资产数据' }} pagination={{ current: page, pageSize: 10, total: typeFilter ? visibleAssets.length : query.data?.total ?? 0, showSizeChanger: false, onChange: setPage }} scroll={{ x: 900 }} />
        )}
      </Card>

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
