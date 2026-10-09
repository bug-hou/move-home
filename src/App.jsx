import { Spin } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import AuthPage from './pages/AuthPage.jsx';
import FilesPage from './pages/FilesPage.jsx';

export default function App() {
  // undefined: 检查中；null: 未登录；string: 用户名
  const [user, setUser] = useState(undefined);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api('/api/auth/me')
      .then((r) => setUser(r.username || null))
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
    <AuthPage onSuccess={setUser} />
  );
}
