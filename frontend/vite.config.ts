import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3010',
        changeOrigin: true,
      },
      '/registry': {
        target: process.env.VITE_REGISTRY_PROXY_TARGET || 'http://localhost:4001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/registry/, ''),
      },
    },
  },
});
