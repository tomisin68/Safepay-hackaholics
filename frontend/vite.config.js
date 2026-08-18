import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    proxy: {
      '/v1': { target: 'http://localhost:4600', changeOrigin: true },
      '/health': { target: 'http://localhost:4600', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
