import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev: chuyển /api sang NestJS để cookie phiên dùng chung một origin như production.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
