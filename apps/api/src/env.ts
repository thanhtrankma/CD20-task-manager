// Nạp và kiểm tra biến môi trường. Phải được import đầu tiên (xem main.ts, cli/seed.ts).
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name} (xem .env.example)`);
  return value;
}

function appSecret(): string {
  const value = required('APP_SECRET');
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error('APP_SECRET phải gồm 64 ký tự hex. Tạo bằng: openssl rand -hex 32');
  }
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  appOrigin: required('APP_ORIGIN'),
  appSecret: appSecret(),
  cookieSecure: process.env.COOKIE_SECURE !== 'false',
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 8),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 20),
  /** Số lần gọi /auth/login tối đa mỗi phút mỗi IP. */
  loginRateLimit: Number(process.env.LOGIN_RATE_LIMIT ?? 5),
  port: Number(process.env.PORT ?? 3000),
  timezone: process.env.TZ ?? 'Asia/Ho_Chi_Minh',
};
