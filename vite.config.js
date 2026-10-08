import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// 单独运行 `npm run dev` 时，把 /api 代理到 `edgeone makers dev`（默认 8088）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8088', changeOrigin: false },
    },
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
