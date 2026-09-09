import {
  LockOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button, Checkbox, Form, Input } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getCaptcha } from '../auth/api';

interface LoginValues {
  username: string;
  password: string;
  captcha: string;
  remember?: boolean;
}

export function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const [form] = Form.useForm<LoginValues>();
  const captcha = useQuery({
    queryKey: ['auth', 'captcha'],
    queryFn: getCaptcha,
    staleTime: 0,
    retry: false,
  });
  const location = useLocation();
  const navigate = useNavigate();
  const requestedLocation = (location.state as {
    from?: { pathname?: string; search?: string; hash?: string };
  } | null)?.from;
  const destination = requestedLocation?.pathname
    ? `${requestedLocation.pathname}${requestedLocation.search ?? ''}${requestedLocation.hash ?? ''}`
    : '/overview';

  const handleLogin = async (values: LoginValues) => {
    if (!captcha.data) return;
    try {
      await login({
        username: values.username,
        password: values.password,
        captcha_token: captcha.data.token,
        captcha_answer: values.captcha,
      });
      navigate(destination, { replace: true });
    } catch {
      form.setFieldValue('captcha', '');
      void captcha.refetch();
    }
  };

  const refreshCaptcha = () => {
    form.setFieldValue('captcha', '');
    void captcha.refetch();
  };

  return (
    <main className="login-page">
      <div className="material-login-brand">
        <div className="brand-mark"><SafetyCertificateOutlined /></div>
        <div><h1>AI 安服平台</h1><p>下一代安全服务平台</p></div>
      </div>
      <section className="login-form-panel">
        <div className="login-card material-login-card">
          <div className="login-card-heading"><h2>系统登录</h2><p>欢迎使用 AI 安服平台</p></div>
          {error && <Alert className="login-error" type="error" showIcon message={error.message} />}
          <Form form={form} layout="vertical" onFinish={handleLogin} initialValues={{ remember: true }}>
            <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input size="large" prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" />
            </Form.Item>
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
            </Form.Item>
            <Form.Item label="验证码" className="material-captcha-field" required>
              <div className="material-captcha-row">
                <Form.Item name="captcha" noStyle rules={[{ required: true, message: '请输入验证码' }]}>
                  <Input size="large" aria-label="验证码" placeholder="请输入验证码" inputMode="numeric" autoComplete="off" />
                </Form.Item>
                <button
                  className="material-captcha-challenge"
                  type="button"
                  aria-label="刷新验证码"
                  title="刷新验证码"
                  onClick={refreshCaptcha}
                  disabled={captcha.isFetching}
                >
                  <span>{captcha.data?.question ?? '加载中'}</span>
                  <ReloadOutlined spin={captcha.isFetching} />
                </button>
              </div>
            </Form.Item>
            <div className="material-login-options">
              <Form.Item name="remember" valuePropName="checked" noStyle><Checkbox>记住登录状态</Checkbox></Form.Item>
              <button type="button" disabled>忘记密码？</button>
            </div>
            <Button type="primary" size="large" htmlType="submit" block loading={isLoading} disabled={!captcha.data}>登 录</Button>
          </Form>
          <footer>© 2026 云盾智意 · 智能化渗透测试系统</footer>
        </div>
      </section>
      <section className="login-visual-panel" aria-label="平台介绍">
        <div className="login-brand" aria-hidden="true">
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
    </main>
  );
}
