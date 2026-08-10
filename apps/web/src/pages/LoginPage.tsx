import { LockOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

interface LoginValues {
  username: string;
  password: string;
}

export function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedLocation = (location.state as {
    from?: { pathname?: string; search?: string; hash?: string };
  } | null)?.from;
  const destination = requestedLocation?.pathname
    ? `${requestedLocation.pathname}${requestedLocation.search ?? ''}${requestedLocation.hash ?? ''}`
    : '/overview';

  const handleLogin = async (values: LoginValues) => {
    try {
      await login(values);
      navigate(destination, { replace: true });
    } catch {
      // AuthProvider exposes the sanitized API error for the alert below.
    }
  };

  return (
    <main className="login-page">
      <section className="login-visual-panel" aria-label="平台介绍">
        <div className="login-brand">
          <div className="brand-mark"><SafetyCertificateOutlined /></div>
          <div><h1>AI 安服平台</h1><p>下一代安全服务平台</p></div>
        </div>
        <div className="login-visual-copy">
          <span>INTELLIGENT SECURITY OPERATIONS</span>
          <h2>让每一次安全验证<br />都有据可循</h2>
          <p>从资产确认、授权边界到渗透执行与报告交付，统一在可信工作流中完成。</p>
        </div>
        <div className="login-orbit" aria-hidden="true"><i /><i /><i /></div>
      </section>
      <section className="login-form-panel">
        <div className="login-card">
          <div className="login-card-heading"><span>欢迎回来</span><h2>系统登录</h2><p>登录后进入智能化渗透测试工作台</p></div>
          {error && <Alert className="login-error" type="error" showIcon message={error.message} />}
          <Form layout="vertical" onFinish={handleLogin}>
            <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input size="large" prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
            </Form.Item>
            <Button type="primary" size="large" htmlType="submit" block loading={isLoading}>登录</Button>
          </Form>
          <footer>© 2026 云盾智意 · 智能化渗透测试系统</footer>
        </div>
      </section>
    </main>
  );
}
