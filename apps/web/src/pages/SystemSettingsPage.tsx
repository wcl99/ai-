import {
  ApiOutlined,
  AppstoreOutlined,
  DeleteOutlined,
  FileProtectOutlined,
  KeyOutlined,
  LockOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Input, InputNumber, Select, Switch, Tabs, Tag, message } from 'antd';
import { useState } from 'react';
import { getOrganization, getRuntimeSettings } from '../api/resources';

const STORAGE_KEY = 'ai-security-management-settings-v1';

type LocalSettings = {
  sessionMinutes: number;
  singleLogin: boolean;
  auditDays: number;
  auditEnabled: boolean;
  allowList: string;
  modelPlatform: string;
  apiBaseUrl: string;
  modelName: string;
  maxConcurrentTasks: number;
  weakCredentials: Array<{ username: string; password: string }>;
  weakPasswordDictionary: string;
  highRiskPorts: string;
  inactivityDays: number;
  minimumPasswordLength: number;
  enabledRules: boolean;
  modules: Record<'pentest' | 'incident' | 'audit' | 'analysis', boolean>;
};

const DEFAULT_SETTINGS: LocalSettings = {
  sessionMinutes: 30,
  singleLogin: true,
  auditDays: 180,
  auditEnabled: true,
  allowList: '127.0.0.1\n10.0.0.0/8',
  modelPlatform: 'DeepSeek',
  apiBaseUrl: 'https://api.deepseek.com/v1',
  modelName: 'deepseek-v4-flash',
  maxConcurrentTasks: 5,
  weakCredentials: [
    { username: 'admin', password: 'admin' },
    { username: 'root', password: '123456' },
  ],
  weakPasswordDictionary: '内置通用弱口令字典',
  highRiskPorts: '21, 22, 23, 3306, 3389, 6379',
  inactivityDays: 90,
  minimumPasswordLength: 8,
  enabledRules: true,
  modules: { pentest: true, incident: true, audit: true, analysis: true },
};

function loadLocalSettings(): LocalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<LocalSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      modules: { ...DEFAULT_SETTINGS.modules, ...parsed.modules },
      weakCredentials: Array.isArray(parsed.weakCredentials) ? parsed.weakCredentials : DEFAULT_SETTINGS.weakCredentials,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function SettingCard({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card className="material-settings-card" variant="borderless">
      <header><span>{icon}</span><div><h3>{title}</h3><p>{description}</p></div></header>
      {children}
    </Card>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="material-setting-row">
      <div><strong>{label}</strong>{hint && <small>{hint}</small>}</div>
      <div>{children}</div>
    </div>
  );
}

export function ManagementSettingsPage() {
  const organization = useQuery({ queryKey: ['organization'], queryFn: getOrganization });
  const runtime = useQuery({ queryKey: ['runtime-settings'], queryFn: getRuntimeSettings });
  const [settings, setSettings] = useState<LocalSettings>(loadLocalSettings);

  const patch = <K extends keyof LocalSettings>(key: K, value: LocalSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    message.success('设置已保存到当前浏览器');
  };
  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.removeItem(STORAGE_KEY);
    message.success('已恢复默认设置');
  };

  const security = (
    <div className="material-settings-grid">
      <SettingCard icon={<LockOutlined />} title="登录与退出设置" description="控制管理端会话与账号登录策略">
        <SettingRow label="会话超时时间" hint="单位：分钟；超过该时间无操作将自动退出"><InputNumber min={5} max={1440} value={settings.sessionMinutes} onChange={(value) => patch('sessionMinutes', value ?? 30)} /></SettingRow>
        <SettingRow label="单点登录限制" hint="同一账号仅保留一个有效会话"><Switch checked={settings.singleLogin} onChange={(value) => patch('singleLogin', value)} /></SettingRow>
        <SettingRow label="当前组织" hint="来自平台真实组织配置"><Input value={organization.data?.name ?? '正在读取…'} disabled /></SettingRow>
      </SettingCard>
      <SettingCard icon={<FileProtectOutlined />} title="审计日志设置" description="设置平台操作留痕与保存周期">
        <SettingRow label="启用审计日志"><Switch checked={settings.auditEnabled} onChange={(value) => patch('auditEnabled', value)} /></SettingRow>
        <SettingRow label="日志保留时间" hint="单位：天"><InputNumber min={30} max={3650} value={settings.auditDays} onChange={(value) => patch('auditDays', value ?? 180)} /></SettingRow>
        <SettingRow label="运行状态" hint="服务端实时读取"><Tag color={runtime.data?.engine_configured ? 'green' : 'orange'}>{runtime.data?.engine_configured ? '服务已就绪' : '等待配置'}</Tag></SettingRow>
      </SettingCard>
      <SettingCard icon={<SafetyCertificateOutlined />} title="访问控制设置" description="限制允许访问管理端的来源地址">
        <label htmlFor="settings-allow-list">IP 白名单</label>
        <Input.TextArea id="settings-allow-list" rows={5} value={settings.allowList} onChange={(event) => patch('allowList', event.target.value)} />
        <p className="material-settings-help">每行填写一个 IP 或 CIDR 网段；留空表示不启用白名单。</p>
      </SettingCard>
    </div>
  );

  const aiModel = (
    <div className="material-settings-single">
      <SettingCard icon={<ApiOutlined />} title="AI 模型配置" description="配置咨询 Agent 使用的模型信息；密钥仍由服务端环境注入">
        <div className="material-settings-form-grid">
          <label><span>模型平台</span><Select value={settings.modelPlatform} onChange={(value) => patch('modelPlatform', value)} options={[{ value: 'DeepSeek', label: 'DeepSeek' }, { value: 'OpenAI Compatible', label: 'OpenAI Compatible' }]} /></label>
          <label><span>API 地址</span><Input value={settings.apiBaseUrl} onChange={(event) => patch('apiBaseUrl', event.target.value)} /></label>
          <label><span>API Key</span><Input.Password value="" placeholder="由服务端安全配置，不在页面回显" disabled prefix={<KeyOutlined />} /></label>
          <label htmlFor="settings-model-name"><span>模型名称</span><Input id="settings-model-name" value={settings.modelName} onChange={(event) => patch('modelName', event.target.value)} /></label>
        </div>
        <Alert showIcon type="info" message="本地配置" description="页面只保存非敏感显示配置；API Key 不写入浏览器。" />
      </SettingCard>
    </div>
  );

  const scenario = (
    <div className="material-settings-grid material-settings-grid--scenario">
      <SettingCard icon={<SettingOutlined />} title="任务并发配置" description="限制同一时间运行的任务数量">
        <SettingRow label="最大并发任务数"><InputNumber min={1} max={50} value={settings.maxConcurrentTasks} onChange={(value) => patch('maxConcurrentTasks', value ?? 5)} /></SettingRow>
      </SettingCard>
      <SettingCard icon={<KeyOutlined />} title="弱口令默认凭据" description="用于授权场景中的弱口令安全验证">
        <div className="material-credential-table">
          <div><strong>用户名</strong><strong>密码</strong><span>操作</span></div>
          {settings.weakCredentials.map((item, index) => <div key={`${item.username}-${index}`}><span>{item.username}</span><span>{item.password}</span><Button aria-label={`删除凭据 ${item.username}`} type="text" danger icon={<DeleteOutlined />} onClick={() => patch('weakCredentials', settings.weakCredentials.filter((_, row) => row !== index))} /></div>)}
        </div>
        <Button type="dashed" icon={<PlusOutlined />} onClick={() => patch('weakCredentials', [...settings.weakCredentials, { username: 'user', password: 'password' }])}>添加凭据</Button>
      </SettingCard>
      <SettingCard icon={<FileProtectOutlined />} title="通用弱口令字典" description="当前场景使用的字典来源">
        <Input value={settings.weakPasswordDictionary} onChange={(event) => patch('weakPasswordDictionary', event.target.value)} />
      </SettingCard>
      <SettingCard icon={<SafetyCertificateOutlined />} title="高风险端口" description="端口预查阶段重点关注的端口">
        <Input value={settings.highRiskPorts} onChange={(event) => patch('highRiskPorts', event.target.value)} />
      </SettingCard>
    </div>
  );

  const rules = (
    <div className="material-rules-layout">
      <SettingCard icon={<FileProtectOutlined />} title="规则配置" description="管理基础安全规则与阈值">
        <SettingRow label="不活跃账号阈值" hint="单位：天"><InputNumber min={1} max={365} value={settings.inactivityDays} onChange={(value) => patch('inactivityDays', value ?? 90)} /></SettingRow>
        <SettingRow label="最小密码长度" hint="单位：位"><InputNumber min={6} max={64} value={settings.minimumPasswordLength} onChange={(value) => patch('minimumPasswordLength', value ?? 8)} /></SettingRow>
        <SettingRow label="启用内置规则" hint="当前共 12 条安全规则"><Switch checked={settings.enabledRules} onChange={(value) => patch('enabledRules', value)} /></SettingRow>
      </SettingCard>
      <Card className="material-json-preview" variant="borderless"><header>规则 JSON 预览</header><pre>{JSON.stringify({ inactivity_days: settings.inactivityDays, minimum_password_length: settings.minimumPasswordLength, enabled: settings.enabledRules }, null, 2)}</pre></Card>
    </div>
  );

  const modules = (
    <div className="material-settings-single">
      <SettingCard icon={<AppstoreOutlined />} title="模块管理" description="控制平台导航中可使用的业务模块">
        {([
          ['pentest', '渗透测试', '资产发现、漏洞探测与验证利用'],
          ['incident', '应急响应', '安全事件分析与处置'],
          ['audit', '代码审计', '静态分析与逻辑漏洞挖掘'],
          ['analysis', '数据分析', '报告与安全数据洞察'],
        ] as const).map(([key, title, description]) => <SettingRow key={key} label={title} hint={description}><Switch checked={settings.modules[key]} onChange={(value) => patch('modules', { ...settings.modules, [key]: value })} /></SettingRow>)}
      </SettingCard>
    </div>
  );

  return (
    <div className="page management-page material-settings-page">
      <div className="material-page-heading"><div><h2>系统设置</h2><p>配置平台安全策略、AI 模型、扫描场景与业务模块。</p></div><Tag color="blue">本地配置</Tag></div>
      {(organization.isError || runtime.isError) && <Alert type="warning" showIcon message="部分服务端配置读取失败，本地设置仍可使用" />}
      <Tabs
        className="material-settings-tabs"
        items={[
          { key: 'security', label: '认证与安全', children: security },
          { key: 'ai', label: 'AI 模型', children: aiModel },
          { key: 'scenario', label: '场景配置', children: scenario },
          { key: 'rules', label: '规则配置', children: rules },
          { key: 'modules', label: '模块管理', children: modules },
        ]}
      />
      <div className="material-settings-actions"><span>修改仅保存到当前浏览器，不会改变服务端敏感配置。</span><div><Button onClick={reset}>恢复默认</Button><Button type="primary" onClick={save}>保存设置</Button></div></div>
    </div>
  );
}
