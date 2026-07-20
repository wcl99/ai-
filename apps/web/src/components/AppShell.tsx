import {
  AppstoreOutlined,
  BellOutlined,
  BugOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  SearchOutlined,
  SettingOutlined,
  SunOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Avatar, Input, Layout, Menu, Space, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import expertAvatar from '../../../../素材/工作 (7) 3.png';

const { Header, Sider, Content } = Layout;

const menuItems: MenuProps['items'] = [
  { key: '/overview', icon: <DashboardOutlined />, label: '总览' },
  {
    key: 'workbench',
    icon: <ThunderboltOutlined />,
    label: '工作台',
    children: [{ key: '/pentest', label: '渗透测试' }],
  },
  { key: '/tasks', icon: <UnorderedListOutlined />, label: '任务中心' },
  { key: '/assets', icon: <DatabaseOutlined />, label: '资产中心' },
  {
    key: 'vulnerability',
    icon: <BugOutlined />,
    label: '漏洞中心',
    children: [{ key: '/vulnerabilities', label: '漏洞列表' }],
  },
  {
    key: 'report',
    icon: <FileTextOutlined />,
    label: '报告中心',
    children: [{ key: '/reports', label: '报告列表' }],
  },
  { key: '/settings', icon: <SettingOutlined />, label: '平台设置' },
];

const pageTitles: Record<string, string> = {
  '/overview': '平台总览',
  '/tasks': '全部任务',
  '/assets': '资产中心',
  '/vulnerabilities': '漏洞列表',
  '/reports': '报告列表',
  '/pentest': 'AI 渗透测试',
};

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/pentest/session') ? '/pentest' : location.pathname;
  const title = pageTitles[basePath] ?? 'AI 安服平台';

  return (
    <Layout className="app-shell">
      <Sider width={260} theme="light" className="app-sider">
        <div className="brand">
          <div className="brand-mark">盾</div>
          <div>
            <Typography.Title level={4}>AI 安服平台</Typography.Title>
            <span>下一代安全服务平台</span>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[basePath]}
          defaultOpenKeys={['workbench', 'vulnerability', 'report']}
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
            <ThunderboltOutlined />
            <SunOutlined />
            <BellOutlined />
            <div className="profile">
              <div>
                <strong>安全专家</strong>
                <span>Aiscanner</span>
              </div>
              <Avatar size={42} src={expertAvatar} />
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
      <AppstoreOutlined />
      <h2>{title}正在接入</h2>
      <p>当前验证版本优先完成渗透任务黄金路径。</p>
    </div>
  );
}
