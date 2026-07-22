import {
  ApiOutlined,
  CheckCircleFilled,
  CloudServerOutlined,
  DatabaseOutlined,
  ExportOutlined,
  ImportOutlined,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { zodResolver } from '@hookform/resolvers/zod';
import {
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
import { MetricCard, StatusTag } from '../components/Ui';
import type { Metric } from '../types';

type AssetType = 'domain' | 'ip' | 'http' | 'network_range';
type AssetStatus = '已授权' | '待确认' | '已停用';
type RiskLevel = '高' | '中' | '低' | '未知';

interface AssetRecord {
  id: string;
  address: string;
  type: AssetType;
  service: string;
  source: string;
  owner: string;
  status: AssetStatus;
  risk: RiskLevel;
  lastScannedAt: string;
  tags: string[];
}

const initialAssets: AssetRecord[] = [
  { id: 'AST-000128', address: 'admin.example.com', type: 'domain', service: 'HTTPS / 443', source: '手工录入', owner: '电商业务线', status: '已授权', risk: '高', lastScannedAt: '2026-07-19 16:42', tags: ['公网', '管理后台'] },
  { id: 'AST-000127', address: '10.10.1.0/24', type: 'network_range', service: '256 个地址', source: '文件导入', owner: '基础设施组', status: '已授权', risk: '中', lastScannedAt: '2026-07-18 09:30', tags: ['内网', '核心网段'] },
  { id: 'AST-000126', address: 'https://pay.example.com/api', type: 'http', service: 'HTTPS / 443', source: '数字人回传', owner: '支付业务线', status: '已授权', risk: '高', lastScannedAt: '2026-07-17 11:22', tags: ['API', '支付'] },
  { id: 'AST-000125', address: '172.16.0.10', type: 'ip', service: 'Redis / 6379', source: '小易发现', owner: '办公网络', status: '待确认', risk: '高', lastScannedAt: '2026-07-16 18:04', tags: ['内网', '中间件'] },
  { id: 'AST-000124', address: 'vpn.company.cn', type: 'domain', service: 'SSL VPN / 443', source: '手工录入', owner: '基础设施组', status: '已停用', risk: '低', lastScannedAt: '2026-07-12 10:08', tags: ['公网', 'VPN'] },
];

const assetMetrics: Metric[] = [
  { label: '资产总数', value: '18,735', trend: '+9.10%', tone: 'blue' },
  { label: '公网资产', value: '2,416', trend: '+4.80%', tone: 'purple' },
  { label: '高风险资产', value: '126', trend: '-6.20%', tone: 'red' },
  { label: '待确认', value: '38', trend: '+3', tone: 'orange' },
  { label: '本周新增', value: '284', trend: '+12.40%', tone: 'green' },
  { label: '已授权扫描', value: '17,962', trend: '+8.70%', tone: 'gray' },
];

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
  const [assets, setAssets] = useState(initialAssets);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { control, handleSubmit, reset, formState: { errors } } = useForm<AssetFormValues>({
    resolver: zodResolver(assetSchema),
    defaultValues: { type: 'domain', address: '', owner: '', authorized: true },
  });
  const filteredAssets = assets.filter((asset) =>
    `${asset.address}${asset.id}${asset.owner}`.toLowerCase().includes(query.toLowerCase()),
  );

  const addAsset = (values: AssetFormValues) => {
    setAssets((current) => [{
      id: `AST-${String(current.length + 129).padStart(6, '0')}`,
      address: values.address,
      type: values.type,
      service: '等待探测',
      source: '手工录入',
      owner: values.owner,
      status: values.authorized ? '已授权' : '待确认',
      risk: '未知',
      lastScannedAt: '尚未扫描',
      tags: ['新资产'],
    }, ...current]);
    reset();
    setModalOpen(false);
    message.success('资产已加入验证模型');
  };

  const columns: ColumnsType<AssetRecord> = [
    { title: '', width: 42, render: () => <Checkbox /> },
    { title: '资产地址/ID', dataIndex: 'address', width: 245, render: (address, row) => <div className="primary-cell"><strong>{address}</strong><span>{row.id}</span></div> },
    { title: '类型', dataIndex: 'type', width: 105, render: (type: AssetType) => <Tag color="blue">{assetTypeLabels[type]}</Tag> },
    { title: '服务信息', dataIndex: 'service', width: 145 },
    { title: '所属业务', dataIndex: 'owner', width: 140 },
    { title: '来源', dataIndex: 'source', width: 120 },
    { title: '授权状态', dataIndex: 'status', width: 100, render: (status) => <StatusTag status={status} /> },
    { title: '风险', dataIndex: 'risk', width: 75, render: (risk: RiskLevel) => <Tag color={risk === '高' ? 'red' : risk === '中' ? 'orange' : risk === '低' ? 'green' : 'default'}>{risk}</Tag> },
    { title: '最近扫描', dataIndex: 'lastScannedAt', width: 155 },
    { title: '标签', dataIndex: 'tags', render: (tags: string[]) => tags.map((tag) => <Tag key={tag}>{tag}</Tag>) },
    { title: '操作', width: 130, fixed: 'right', render: () => <Space><a>详情</a><a>发起扫描</a></Space> },
  ];

  return (
    <div className="page list-page assets-page">
      <div className="metric-grid metric-grid-six">{assetMetrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</div>
      <Card variant="borderless" className="data-card">
        <div className="filter-bar">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} prefix={<SearchOutlined />} placeholder="搜索资产地址、ID、所属业务..." />
          <Select defaultValue="全部类型" options={['全部类型', '域名', 'IP', 'HTTP 地址', '网段'].map((value) => ({ value }))} />
          <Select defaultValue="全部授权状态" options={['全部授权状态', '已授权', '待确认', '已停用'].map((value) => ({ value }))} />
          <Select defaultValue="全部风险" options={['全部风险', '高风险', '中风险', '低风险'].map((value) => ({ value }))} />
          <div className="filter-spacer" />
          <Button icon={<ImportOutlined />}>导入资产</Button>
          <Button icon={<ExportOutlined />}>导出</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新增资产</Button>
        </div>
        <div className="table-toolbar"><span>已选择 <strong>0</strong> 项</span><span className="muted">资产授权后才允许发起真实扫描</span></div>
        <Table rowKey="id" columns={columns} dataSource={filteredAssets} pagination={{ pageSize: 6 }} scroll={{ x: 1320 }} />
      </Card>

      <Modal title="新增资产" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={handleSubmit(addAsset)} okText="确认添加">
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

export function SettingsPage() {
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
                  <SettingsCard icon={<CloudServerOutlined />} title="小易渗透引擎" description="平台通过适配器调用预查 WebSocket 和扫描 REST。">
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
                    <SettingRow title="单次资产上限" description="与小易网段展开限制保持一致"><InputNumber defaultValue={512} min={1} max={512} /></SettingRow>
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
