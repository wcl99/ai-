import { LockOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Checkbox, Form, Input } from 'antd';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const navigate = useNavigate();
  return (
    <main className="login-page">
      <div className="login-brand">
        <div className="brand-mark"><SafetyCertificateOutlined /></div>
        <div><h1>AI 安服平台</h1><p>下一代安全服务平台</p></div>
      </div>
      <section className="login-card">
        <h2>系统登录</h2>
        <Form layout="vertical" onFinish={() => navigate('/overview')}>
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input size="large" prefix={<UserOutlined />} placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" />
          </Form.Item>
          <Form.Item label="验证码" required>
            <div className="captcha-row">
              <Form.Item name="captcha" noStyle rules={[{ required: true, message: '请输入验证码' }]}>
                <Input size="large" prefix={<SafetyCertificateOutlined />} placeholder="输入验证码" />
              </Form.Item>
              <span className="captcha-code">8K4P</span>
            </div>
          </Form.Item>
          <Checkbox>记住我</Checkbox>
          <Button type="primary" size="large" htmlType="submit" block>登录</Button>
        </Form>
      </section>
      <footer>© 2026 云盾智意 · 智能化渗透测试系统</footer>
    </main>
  );
}
