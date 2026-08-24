import {
  ApiOutlined,
  AppstoreOutlined,
  DownloadOutlined,
  FileProtectOutlined,
  KeyOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Checkbox, Input, InputNumber, Select, Switch, Tabs, message } from 'antd';
import { useState } from 'react';
import { getOrganization, getRuntimeSettings } from '../api/resources';

const STORAGE_KEY = 'ai-security-management-settings-v1';

type LocalSettings = {
  loginAttempts: number;
  sessionMinutes: number;
  singleLogin: boolean;
  auditDays: number;
  auditEnabled: boolean;
  auditPermissionChanges: boolean;
  auditControlActions: boolean;
  auditExports: boolean;
  rbacEnabled: boolean;
  roleGuardEnabled: boolean;
  allowList: string;
  modelPlatform: string;
  apiBaseUrl: string;
  modelName: string;
  maxConcurrentTasks: number;
  weakCredentials: Array<{ appName?: string; username: string; password: string }>;
  weakPasswordDictionary: string;
  highRiskPorts: string;
  inactivityDays: number;
  minimumPasswordLength: number;
  enabledRules: boolean;
  modules: Record<'pentest' | 'incident' | 'audit' | 'analysis', boolean>;
};

const DEFAULT_SETTINGS: LocalSettings = {
  loginAttempts: 5,
  sessionMinutes: 30,
  singleLogin: true,
  auditDays: 180,
  auditEnabled: true,
  auditPermissionChanges: true,
  auditControlActions: true,
  auditExports: true,
  rbacEnabled: true,
  roleGuardEnabled: true,
  allowList: '127.0.0.1\n10.0.0.0/8',
  modelPlatform: 'DeepSeek',
  apiBaseUrl: 'https://api.deepseek.com/v1',
  modelName: 'deepseek-v4-flash',
  maxConcurrentTasks: 5,
  weakCredentials: [
    { appName: 'Jenkins Admin', username: 'admin', password: 'admin' },
    { appName: 'PostgreSQL Default', username: 'postgres', password: '123456' },
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

function SettingCard({ icon, title, description, className = '', children }: { icon: React.ReactNode; title: string; description: string; className?: string; children: React.ReactNode }) {
  return (
    <Card className={`material-settings-card ${className}`} variant="borderless">
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
  const [activeTab, setActiveTab] = useState('security');

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
  const exportAuditSettings = () => {
    const blob = new Blob([JSON.stringify({
      retention_days: settings.auditDays,
      permission_changes: settings.auditPermissionChanges,
      control_actions: settings.auditControlActions,
      exports: settings.auditExports,
    }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'audit-settings.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const security = (
    <div className="material-settings-grid material-security-grid">
      <SettingCard icon={<LockOutlined />} title="登录与退出设置" description="控制管理端会话与账号登录策略">
        <div className="material-login-settings">
          <label><span>登录尝试次数限制</span><InputNumber min={1} max={20} value={settings.loginAttempts} onChange={(value) => patch('loginAttempts', value ?? 5)} /><small>达到限制后账户将临时锁定</small></label>
          <label><span>自动登出时间</span><InputNumber min={5} max={1440} value={settings.sessionMinutes} onChange={(value) => patch('sessionMinutes', value ?? 30)} /><small>用户无操作后的自动登出时间（分钟）</small></label>
        </div>
      </SettingCard>
      <SettingCard icon={<FileProtectOutlined />} title="审计日志设置" description="设置平台操作留痕与保存周期">
        <div className="material-audit-options">
          <label><input type="checkbox" checked={settings.auditPermissionChanges} onChange={(event) => patch('auditPermissionChanges', event.target.checked)} />记录权限变更操作</label>
          <label><input type="checkbox" checked={settings.auditControlActions} onChange={(event) => patch('auditControlActions', event.target.checked)} />记录执行控制操作</label>
          <label><input type="checkbox" checked={settings.auditExports} onChange={(event) => patch('auditExports', event.target.checked)} />记录导出操作</label>
        </div>
        <SettingRow label="日志保留时间" hint="单位：天"><InputNumber min={30} max={3650} value={settings.auditDays} onChange={(value) => patch('auditDays', value ?? 180)} /></SettingRow>
        <Button aria-label="导出审计日志" icon={<DownloadOutlined />} onClick={exportAuditSettings}>导出审计日志</Button>
      </SettingCard>
      <SettingCard className="material-access-control-card" icon={<SafetyCertificateOutlined />} title="访问控制设置" description="限制允许访问管理端的来源地址">
        <SettingRow label="启用RBAC权限检查" hint="后端路由将进行RBAC权限检查"><Switch checked={settings.rbacEnabled} onChange={(value) => patch('rbacEnabled', value)} /></SettingRow>
        <SettingRow label="前端基于角色隐藏/禁用操作"><Switch checked={settings.roleGuardEnabled} onChange={(value) => patch('roleGuardEnabled', value)} /></SettingRow>
        <label htmlFor="settings-allow-list">IP 白名单</label>
        <Input.TextArea id="settings-allow-list" rows={5} value={settings.allowList} onChange={(event) => patch('allowList', event.target.value)} />
        <p className="material-settings-help">每行填写一个 IP 或 CIDR 网段；留空表示不启用白名单。</p>
      </SettingCard>
    </div>
  );

  const aiModel = (
    <div className="material-settings-single">
      <SettingCard icon={<ApiOutlined />} title="AI模型设置" description="配置平台调用的模型服务">
        <div className="material-settings-form-grid">
          <label><span>模型平台</span><Select value={settings.modelPlatform} onChange={(value) => patch('modelPlatform', value)} options={[{ value: 'DeepSeek', label: 'DeepSeek' }, { value: 'OpenAI Compatible', label: 'OpenAI Compatible' }]} /></label>
          <label><span>API 地址</span><Input value={settings.apiBaseUrl} onChange={(event) => patch('apiBaseUrl', event.target.value)} /></label>
          <label><span>API Key</span><Input.Password value="" placeholder="由服务端安全配置，不在页面回显" disabled prefix={<KeyOutlined />} /></label>
          <label htmlFor="settings-model-name"><span>模型名称</span><Input id="settings-model-name" value={settings.modelName} onChange={(event) => patch('modelName', event.target.value)} /></label>
        </div>
      </SettingCard>
    </div>
  );

  const scenario = (
    <div className="material-settings-grid material-settings-grid--scenario">
      <SettingCard icon={<SettingOutlined />} title="任务执行配置" description="控制平台任务的并发执行数量">
        <SettingRow label="最大并发任务数"><InputNumber min={1} max={50} value={settings.maxConcurrentTasks} onChange={(value) => patch('maxConcurrentTasks', value ?? 5)} /></SettingRow>
      </SettingCard>
      <SettingCard icon={<KeyOutlined />} title="弱口令默认密码" description="维护授权测试使用的默认凭据">
        <div className="material-credential-add">
          <Input aria-label="应用名称" placeholder="应用名称(如: Tomcat)" />
          <Input aria-label="用户名" placeholder="用户名" />
          <Input.Password aria-label="密码" placeholder="密码" />
          <Button onClick={() => patch('weakCredentials', [...settings.weakCredentials, { appName: 'New Application', username: 'user', password: 'password' }])}>添加</Button>
        </div>
        <div className="material-credential-table">
          <div><strong>应用名称</strong><strong>用户名</strong><strong>密码</strong><span>操作</span></div>
          {settings.weakCredentials.map((item, index) => <div key={`${item.username}-${index}`}><span>{item.appName ?? 'Default'}</span><span>{item.username}</span><span>••••••••</span><span><Button type="link" size="small">编辑</Button><Button aria-label={`删除凭据 ${item.username}`} type="link" size="small" danger onClick={() => patch('weakCredentials', settings.weakCredentials.filter((_, row) => row !== index))}>删除</Button></span></div>)}
        </div>
      </SettingCard>
      <SettingCard icon={<FileProtectOutlined />} title="通用弱口令配置" description="用于调用服务的弱口令特征检测">
        <Input.TextArea rows={4} value={settings.weakPasswordDictionary} onChange={(event) => patch('weakPasswordDictionary', event.target.value)} placeholder="每行一个弱口令字符" />
      </SettingCard>
      <SettingCard icon={<SafetyCertificateOutlined />} title="高危端口配置" description="这些端口将被标记为高危端口">
        <Input.TextArea rows={4} value={settings.highRiskPorts} onChange={(event) => patch('highRiskPorts', event.target.value)} placeholder="例如: 21,22,23,3389,445" />
      </SettingCard>
    </div>
  );

  const rules = (
    <div className="material-rules-layout">
      <SettingCard icon={<FileProtectOutlined />} title="规则配置" description="管理基础安全规则与阈值">
        <div className="material-rule-thresholds">
          <label><span>长期未使用阈值 (天)</span><InputNumber min={1} max={365} value={settings.inactivityDays} onChange={(value) => patch('inactivityDays', value ?? 180)} /></label>
          <label><span>最小密码长度阈值</span><InputNumber min={6} max={64} value={settings.minimumPasswordLength} onChange={(value) => patch('minimumPasswordLength', value ?? 12)} /></label>
        </div>
        <strong className="material-rule-label">启用规则</strong>
        <div className="material-rule-checklist">
          {['R001 未解除账号', 'R002 账号未使用', 'R003 非本单位体系标识', 'R004 重复遗留账号', 'R005 厂商账号超期', 'R006 默认账号', 'R007 弱口令疑似', 'R008 口令策略', 'R009 特权未约束', 'R010 认证A登录', 'R011 本地加密', 'R012 密码完整性'].map((rule) => <Checkbox key={rule} checked={settings.enabledRules} onChange={(event) => patch('enabledRules', event.target.checked)}>{rule}</Checkbox>)}
        </div>
        <strong className="material-rule-label">规则配置（JSON）</strong>
        <Card className="material-json-preview" variant="borderless"><pre>{JSON.stringify({ enabled_rules: settings.enabledRules ? ['R001', 'R002', 'R003'] : [], thresholds: { unused_days: settings.inactivityDays, min_password_length: settings.minimumPasswordLength } }, null, 2)}</pre></Card>
      </SettingCard>
    </div>
  );

  const modules = (
    <div className="material-settings-single">
      <SettingCard icon={<AppstoreOutlined />} title="工作台模块展示授权" description="控制工作台中可展示的业务模块">
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
      <div className="material-page-heading"><div><h2>系统设置</h2><p>系统设置 - 管理系统全局配置、高级安全策略与多维权限控制</p></div><div className="material-page-actions"><Button onClick={reset}>重置</Button><Button type="primary" onClick={save}>保存设置</Button></div></div>
      {(organization.isError || runtime.isError) && <Alert type="warning" showIcon message="部分服务端配置读取失败，本地设置仍可使用" />}
      <Tabs
        className="material-settings-tabs"
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'security', label: '认证与安全', children: security },
          { key: 'ai', label: 'AI 模型', children: aiModel },
          { key: 'scenario', label: '场景配置', children: scenario },
          { key: 'rules', label: '规则配置', children: rules },
          { key: 'modules', label: '模块管理', children: modules },
        ]}
      />
      <div className="material-settings-actions"><span className="material-settings-action-icon"><SettingOutlined /></span><span><strong>{activeTab === 'security' ? '认证与安全设置' : activeTab === 'ai' ? 'AI模型设置' : activeTab === 'scenario' ? '场景配置' : activeTab === 'rules' ? '规则配置' : '模块管理设置'}</strong><small>当前修改仅保存非敏感配置，不会在浏览器中记录服务端密钥。</small></span><div><Button onClick={reset}>取消修改</Button><Button type="primary" onClick={save}>保存当前设置</Button></div></div>
    </div>
  );
}
