import { Spin } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { api, setToken, setUnauthorizedHandler } from './api.js';
import AuthPage from './pages/AuthPage.jsx';
import FilesPage from './pages/FilesPage.jsx';

export default function App() {
  // undefined: 检查中；null: 未登录；string: 用户名
  const [user, setUser] = useState(undefined);

  // 登录 / 注册成功：把凭证存入 localStorage，用户手动退出才删除
  const login = useCallback((r) => {
    setToken(r.token);
    setUser(r.username);
  }, []);

  const logout = useCallback(async (all = false) => {
    await api(all ? '/api/auth/logout-all' : '/api/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api('/api/auth/me')
      .then((r) => {
        // 服务端判定凭证失效（被退出所有设备等）才清除；网络错误时保留，下次再试
        if (!r.username) setToken(null);
        setUser(r.username || null);
      })
      // 网络异常时不清除本地凭证，刷新后可恢复登录
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (user !== undefined) window.scrollTo(0, 0);
  }, [user]);

  if (user === undefined) {
    return (
      <div className="auth-page">
        <Spin size="large" />
      </div>
    );
  }
  return user ? (
    <FilesPage username={user} onLogout={logout} />
  ) : (
    <AuthPage onSuccess={login} />
  );
}
