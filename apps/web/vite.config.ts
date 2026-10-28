import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev: chuyển /api sang NestJS để cookie phiên dùng chung một origin như production.
    // API_PORT: đổi khi cổng 3000 đã bị dự án khác dùng (vd. API_PORT=3100 npm run dev).
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 3000}` },
  },
  build: {
    // Không nhúng phông chữ vào CSS dạng data: (CSP production chỉ cho tải phông từ chính máy chủ: default-src 'self').
    assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
});
