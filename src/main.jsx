import { App as AntApp, ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#25443f',
          colorInfo: '#25443f',
          colorLink: '#315d52',
          colorLinkHover: '#1b3731',
          colorText: '#253e37',
          colorTextSecondary: '#526760',
          colorBorder: '#dce5dc',
          colorPrimaryBg: '#edf4ef',
          borderRadius: 8,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        },
        components: {
          Button: { primaryShadow: 'none', defaultShadow: 'none', controlHeight: 36 },
          Input: { controlHeight: 40 },
        },
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
