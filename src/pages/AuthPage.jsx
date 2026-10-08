import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, Tabs } from 'antd';
import { useState } from 'react';
import { api } from '../api.js';

const USERNAME_RULES = [
  { required: true, message: '请输入用户名' },
  { pattern: /^[a-zA-Z0-9_]{3,20}$/, message: '3-20 位字母、数字或下划线' },
];

export default function AuthPage({ onSuccess }) {
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm();
  const isRegister = mode === 'register';

  const submit = async (values) => {
    setError('');
    setLoading(true);
    try {
      const r = await api(`/api/auth/${mode}`, {
        method: 'POST',
        body: { username: values.username.trim(), password: values.password },
      });
      onSuccess(r.username);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const changeMode = (key) => {
    setMode(key);
    setError('');
    form.resetFields(['password', 'confirm']);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <h1>Move Home</h1>
          <p>简单、安全的个人网盘</p>
        </div>

        <Tabs
          centered
          activeKey={mode}
          onChange={changeMode}
          items={[
            { key: 'login', label: '登录' },
            { key: 'register', label: '注册' },
          ]}
        />

        <Form form={form} layout="vertical" requiredMark={false} onFinish={submit}>
          <Form.Item name="username" rules={USERNAME_RULES}>
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名（字母 / 数字 / 下划线）"
              autoComplete="username"
              size="large"
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              ...(isRegister ? [{ min: 8, max: 128, message: '密码长度需为 8-128 位' }] : []),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={isRegister ? '密码（至少 8 位）' : '密码'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              size="large"
            />
          </Form.Item>
          {isRegister && (
            <Form.Item
              name="confirm"
              dependencies={['password']}
              rules={[
                { required: true, message: '请再次输入密码' },
                ({ getFieldValue }) => ({
                  validator: (_, v) =>
                    !v || getFieldValue('password') === v
                      ? Promise.resolve()
                      : Promise.reject(new Error('两次输入的密码不一致')),
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="确认密码"
                autoComplete="new-password"
                size="large"
              />
            </Form.Item>
          )}

          {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            {isRegister ? '注册并登录' : '登录'}
          </Button>
        </Form>
      </div>
    </div>
  );
}
