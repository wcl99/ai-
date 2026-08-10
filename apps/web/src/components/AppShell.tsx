import {
  AppstoreFilled,
  SearchOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Alert, Avatar, Dropdown, Input, Layout, Menu, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import expertAvatar from '../../../../素材/工作 (7) 3.png';
import { useAuth } from '../auth/AuthContext';
import { forgetPentestSession, readPentestSession } from '../pentestSessionRoute';

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

function menuItems(currentTaskRoute: string | null): MenuProps['items'] {
  return [
  { key: '/overview', icon: <NavIcon name="overview" />, label: '总览' },
  {
    key: 'workbench',
    icon: <NavIcon name="workbench" />,
    label: '工作台',
    children: [
      { key: '/pentest', label: '新建渗透测试' },
      ...(currentTaskRoute ? [{ key: currentTaskRoute, label: '当前任务' }] : []),
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
  {
    key: 'settings',
    icon: <NavIcon name="settings" />,
    label: '平台设置',
    children: [
      { key: '/settings', label: '系统设置' },
      { key: '/settings/team', label: '团队管理' },
      { key: '/settings/authorization', label: '授权管理' },
    ],
  },
  ];
}

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
  '/settings/team': '团队管理',
  '/settings/authorization': '授权管理',
};

const roleLabels: Record<string, string> = {
  admin: '管理员',
  security_expert: '安全专家',
  operator: '操作员',
  auditor: '审计员',
};

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const currentSessionPath = location.pathname.startsWith('/pentest/session/')
    ? location.pathname
    : readPentestSession(user?.id ?? '');
  const basePath = location.pathname.startsWith('/pentest/session') ? '/pentest' : location.pathname;
  const selectedPath = location.pathname.startsWith('/pentest/session')
    ? location.pathname
    : basePath;
  const title = pageTitles[basePath] ?? 'AI 安服平台';
  const openSection = basePath === '/pentest'
    ? 'workbench'
    : basePath === '/tasks'
      ? 'tasks'
      : basePath.startsWith('/vulnerabilities')
        ? 'vulnerability'
        : basePath.startsWith('/reports')
          ? 'report'
          : basePath.startsWith('/settings')
            ? 'settings'
            : undefined;
  const profileMenu: MenuProps = {
    items: [{ key: 'logout', label: '退出登录' }],
    onClick: async ({ key }) => {
      if (key !== 'logout') return;
      setLogoutError(null);
      try {
        await logout();
        forgetPentestSession(user?.id ?? '');
        navigate('/login', { replace: true });
      } catch (error) {
        setLogoutError(error instanceof Error ? error.message : '退出登录失败，请稍后重试');
      }
    },
  };

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
          selectedKeys={[selectedPath]}
          defaultOpenKeys={openSection ? [openSection] : []}
          items={menuItems(currentSessionPath)}
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
            <Dropdown menu={profileMenu} trigger={['click']}>
              <button type="button" className="profile" aria-label="用户菜单">
                <span className="profile-copy">
                  <strong>{user?.name ?? user?.username}</strong>
                  <span>{roleLabels[user?.role ?? ''] ?? user?.role}</span>
                </span>
                <Avatar size={42} src={expertAvatar} />
                <img className="profile-chevron" src="/ui-icons/arrow-down.png" alt="" />
                <i />
              </button>
            </Dropdown>
          </Space>
        </Header>
        {logoutError && (
          <Alert
            className="shell-error"
            type="error"
            showIcon
            closable
            message={logoutError}
            onClose={() => setLogoutError(null)}
          />
        )}
        <Content className={basePath === '/pentest' ? 'app-content pentest-content' : 'app-content'}>
          <div className="app-content-frame">{children}</div>
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
