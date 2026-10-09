import { ArrowRightOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { api } from '../api.js';
import travelCoast from '../assets/travel-coast-crop.jpg';
import travelDesert from '../assets/travel-desert.jpg';
import travelSnow from '../assets/travel-snow.jpg';
import Brand from '../components/Brand.jsx';

const SCENES = [
  {
    image: travelCoast,
    title: <>去过的地方，<br />都值得珍藏。</>,
    description: '将旅途中的每一帧风景、每一段故事，安放在属于你的私人空间。',
    label: '海岸 / 让回忆有处可寻',
  },
  {
    image: travelDesert,
    title: <>走过的远方，<br />终会成为故事。</>,
    description: '那些在风与沙之间定格的瞬间，值得被好好收藏。',
    label: '沙漠 / 收藏每一次出发',
  },
  {
    image: travelSnow,
    title: <>翻过雪山，<br />留住这一帧。</>,
    description: '把雪山、湖泊与路上的光，留在只属于你的旅途档案里。',
    label: '雪山 / 珍藏沿途的光',
  },
];

const USERNAME_RULES = [
  { required: true, message: '请输入用户名' },
  { pattern: /^[a-zA-Z0-9_]{3,20}$/, message: '3-20 位字母、数字或下划线' },
];

function getPasswordStrength(password) {
  if (!password) return { level: 0, label: '尚未输入', tip: '建议使用 12 位以上，并混合字母、数字和符号' };
  if (password.length < 8) return { level: 1, label: '较弱', tip: '密码至少需要 8 位' };

  const types = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((re) => re.test(password)).length;
  if (password.length >= 12 && types >= 3) {
    return { level: 3, label: '较强', tip: '请避免使用常见密码或在其他网站重复使用' };
  }
  if (types >= 2) return { level: 2, label: '中等', tip: '增加长度和字符类型可以进一步提升强度' };
  return { level: 1, label: '较弱', tip: '尝试混合字母、数字和符号' };
}

export default function AuthPage({ onSuccess }) {
  const [scene] = useState(() => SCENES[Math.floor(Math.random() * SCENES.length)]);
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form] = Form.useForm();
  const password = Form.useWatch('password', form);
  const isRegister = mode === 'register';
  const strength = getPasswordStrength(password);

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
    if (loading || mode === key) return;
    setMode(key);
    setError('');
    form.resetFields(['password', 'confirm']);
  };

  return (
    <div className={`auth-page${isRegister ? ' auth-page--register' : ''}`} style={{ '--auth-scene-image': `url("${scene.image}")` }}>
      <div className="auth-shell">
        <aside className="auth-visual">
          <div className="auth-visual-top">
            <Brand light />
          </div>
          <div className="auth-visual-content">
            <span className="auth-visual-kicker"><span className="auth-kicker-line" /> YOUR JOURNEY, KEPT CLOSE</span>
            <h2>{scene.title}</h2>
            <p>{scene.description}</p>
          </div>
          <div className="auth-visual-bottom">
            <span>{scene.label}</span>
            <span>EXPLORE · CAPTURE · KEEP</span>
          </div>
        </aside>

        <main className="auth-form-side">
          <div className="auth-form-content">
            <div className="auth-intro" key={mode}>
              <div className="auth-eyebrow">YOUR SPACE, YOUR STORY <span>✳</span></div>
              <h1>{isRegister ? '开启你的旅途档案' : '欢迎回来'}</h1>
              <p className="auth-subtitle">
                {isRegister ? '创建账号，让每一次出发都有迹可循。' : '那些美好的旅途瞬间，都在这里等你。'}
              </p>
            </div>

            <div className={`auth-switch${isRegister ? ' auth-switch--register' : ''}`} aria-label="登录或注册">
              <button type="button" className={isRegister ? '' : 'active'} aria-pressed={!isRegister} onClick={() => changeMode('login')}>登录</button>
              <button type="button" className={isRegister ? 'active' : ''} aria-pressed={isRegister} onClick={() => changeMode('register')}>注册</button>
            </div>

            <Form form={form} layout="vertical" requiredMark={false} onFinish={submit} className="auth-form">
              <Form.Item name="username" label="用户名" rules={USERNAME_RULES}>
                <Input
                  prefix={<UserOutlined />}
                  placeholder="字母、数字或下划线"
                  autoComplete="username"
                  size="large"
                />
              </Form.Item>
              <Form.Item
                name="password"
                label="密码"
                rules={[
                  { required: true, message: '请输入密码' },
                  ...(isRegister ? [{ min: 8, max: 128, message: '密码长度需为 8-128 位' }] : []),
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder={isRegister ? '至少 8 位密码' : '请输入密码'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  aria-describedby={isRegister ? 'password-strength-hint' : undefined}
                  size="large"
                />
              </Form.Item>
              <div
                className={`auth-register-fields${isRegister ? ' auth-register-fields--open' : ''}`}
                inert={!isRegister}
                aria-hidden={!isRegister}
              >
                <div className="auth-register-fields-inner">
                  <div className={`auth-strength auth-strength--${strength.level}`}>
                    <div className="auth-strength-heading">
                      <span>密码强度</span>
                      <span role="status" aria-live="polite">{strength.label}</span>
                    </div>
                    <div className="auth-strength-bars" aria-hidden="true">
                      {[1, 2, 3].map((step) => (
                        <span className={step <= strength.level ? 'active' : ''} key={step} />
                      ))}
                    </div>
                    <p id="password-strength-hint">{strength.tip} · 仅供参考</p>
                  </div>
                  <Form.Item
                    name="confirm"
                    label="确认密码"
                    dependencies={['password']}
                    rules={isRegister ? [
                      { required: true, message: '请再次输入密码' },
                      ({ getFieldValue }) => ({
                        validator: (_, v) =>
                          !v || getFieldValue('password') === v
                            ? Promise.resolve()
                            : Promise.reject(new Error('两次输入的密码不一致')),
                      }),
                    ] : []}
                  >
                    <Input.Password
                      prefix={<LockOutlined />}
                      placeholder="再次输入密码"
                      autoComplete="new-password"
                      disabled={!isRegister}
                      size="large"
                    />
                  </Form.Item>
                </div>
              </div>

              {error && <Alert className="auth-error" type="error" message={error} showIcon />}

              <Button className="auth-submit" type="primary" htmlType="submit" size="large" block loading={loading}>
                {isRegister ? '创建账号' : '进入我的空间'} {!loading && <ArrowRightOutlined />}
              </Button>
            </Form>

            <p className="auth-mode-hint">
              {isRegister ? '已经有账号了？' : '第一次来到这里？'}{' '}
              <button type="button" onClick={() => changeMode(isRegister ? 'login' : 'register')} disabled={loading}>
                {isRegister ? '返回登录' : '创建账号'} <ArrowRightOutlined />
              </button>
            </p>
          </div>
          <div className="auth-form-footer">为你的旅途素材，留一处安心的归档地。</div>
        </main>
      </div>
    </div>
  );
}
