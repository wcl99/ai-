import {
  AppstoreFilled,
  SearchOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Avatar, Input, Layout, Menu, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import expertAvatar from '../../../../素材/工作 (7) 3.png';

const { Header, Sider, Content } = Layout;

type NavigationIcon =
  | 'overview'
  | 'workbench'
  | 'tasks'
  | 'assets'
  | 'vulnerabilities'
  | 'reports'
  | 'settings';

function NavIcon({ name }: { name: NavigationIcon }) {
  return (
    <span className="design-nav-icon" aria-hidden="true">
      <img src={'/ui-icons/nav-' + name + '.png'} alt="" />
      <img className="active" src={'/ui-icons/nav-' + name + '-active.png'} alt="" />
    </span>
  );
}

function HeaderIcon({ name, label }: { name: string; label: string }) {
  return (
    <button type="button" className="header-icon-button" aria-label={label}>
      <img src={'/ui-icons/header-' + name + '.png'} alt="" />
    </button>
  );
}

const menuItems: MenuProps['items'] = [
  { key: '/overview', icon: <NavIcon name="overview" />, label: '总览' },
  {
    key: 'workbench',
    icon: <NavIcon name="workbench" />,
    label: '工作台',
    children: [
      { key: '/pentest', label: '渗透测试' },
      { key: 'incident', label: '应急响应', disabled: true },
      { key: 'audit', label: '代码审计', disabled: true },
      { key: 'analysis', label: '数据分析', disabled: true },
    ],
  },
  {
    key: 'tasks',
    icon: <NavIcon name="tasks" />,
    label: '任务中心',
    children: [
      { key: '/tasks', label: '全部任务' },
      { key: 'task-running', label: '进行中', disabled: true },
      { key: 'task-queued', label: '排队中', disabled: true },
      { key: 'task-completed', label: '已完成', disabled: true },
    ],
  },
  { key: '/assets', icon: <NavIcon name="assets" />, label: '资产中心' },
  {
    key: 'vulnerability',
    icon: <NavIcon name="vulnerabilities" />,
    label: '漏洞中心',
    children: [
      { key: '/vulnerabilities/overview', label: '漏洞总览' },
      { key: '/vulnerabilities', label: '漏洞列表' },
    ],
  },
  {
    key: 'report',
    icon: <NavIcon name="reports" />,
    label: '报告中心',
    children: [
      { key: '/reports/overview', label: '报告总览' },
      { key: '/reports', label: '报告列表' },
      { key: 'report-exports', label: '导出记录', disabled: true },
    ],
  },
  { key: '/settings', icon: <NavIcon name="settings" />, label: '平台设置' },
];

const pageTitles: Record<string, string> = {
  '/overview': '平台总览',
  '/tasks': '全部任务',
  '/assets': '资产中心',
  '/vulnerabilities/overview': '漏洞总览',
  '/vulnerabilities': '漏洞列表',
  '/reports/overview': '报告总览',
  '/reports': '报告列表',
  '/pentest': 'AI 渗透测试',
  '/settings': '平台设置',
};

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/pentest/session') ? '/pentest' : location.pathname;
  const title = pageTitles[basePath] ?? 'AI 安服平台';
  const openSection = basePath === '/pentest'
    ? 'workbench'
    : basePath === '/tasks'
      ? 'tasks'
      : basePath.startsWith('/vulnerabilities')
        ? 'vulnerability'
        : basePath.startsWith('/reports')
          ? 'report'
          : undefined;

  return (
    <Layout className="app-shell">
      <Sider width={260} theme="light" className="app-sider">
        <div className="brand">
          <div className="brand-mark"><SafetyCertificateOutlined /></div>
          <div>
            <Typography.Title level={4}>AI 安服平台</Typography.Title>
            <span>下一代安全服务平台</span>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[basePath]}
          defaultOpenKeys={openSection ? [openSection] : []}
          items={menuItems}
          onClick={({ key }) => key.startsWith('/') && navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="app-header">
          <Typography.Title level={2}>{title}</Typography.Title>
          <Input
            className="global-search"
            prefix={<SearchOutlined />}
            placeholder="搜索资产、任务、漏洞、报告..."
          />
          <Space size={22} className="header-actions">
            <HeaderIcon name="ai" label="AI 助手" />
            <HeaderIcon name="theme" label="切换主题" />
            <HeaderIcon name="notification" label="通知" />
            <div className="profile">
              <div>
                <strong>安全专家</strong>
                <span>Aiscanner</span>
              </div>
              <Avatar size={42} src={expertAvatar} />
              <img className="profile-chevron" src="/ui-icons/arrow-down.png" alt="" />
              <i />
            </div>
          </Space>
        </Header>
        <Content className={basePath === '/pentest' ? 'app-content pentest-content' : 'app-content'}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

export function EmptyStatePage({ title }: { title: string }) {
  return (
    <div className="empty-state">
      <AppstoreFilled />
      <h2>{title}正在接入</h2>
      <p>当前验证版本优先完成渗透任务黄金路径。</p>
    </div>
  );
}
