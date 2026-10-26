// Cấu hình Prisma CLI (migrate, generate). Prisma 7 không tự đọc .env nên nạp tại đây.
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` lúc build Docker không cần CSDL nên cho phép thiếu biến này.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
