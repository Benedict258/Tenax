import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const host = env.HOST || 'localhost';
  const port = Number(env.PORT || env.VITE_PORT || 3000);
  const proxyTarget = env.VITE_API_PROXY_TARGET || env.API_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      host,
      port,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host,
      port,
    },
    test: {
      globals: true,
      environment: 'jsdom',
    },
  };
});
