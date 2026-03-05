import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/amino/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/_matrix': {
        target: 'https://app.aminoimmigration.com',
        changeOrigin: true,
        secure: true,
      },
      '/webhook': {
        target: 'https://n8n.intelechia.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
