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
  /** Vai trò bắt buộc bật xác thực hai lớp (phân cách bằng dấu phẩy; để trống = không bắt buộc). */
  require2faRoles: (process.env.REQUIRE_2FA_ROLES ?? 'ADMIN,LEADER')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean),
  /** Số request tối đa mỗi phút mỗi IP cho toàn bộ API. */
  rateLimit: Number(process.env.RATE_LIMIT ?? 120),
  port: Number(process.env.PORT ?? 3000),
  /** Số tin trò chuyện tối đa mỗi phút mỗi IP. */
  chatMessageRateLimit: Number(process.env.CHAT_MESSAGE_RATE_LIMIT ?? 30),
  /** Chu kỳ kiểm tra lại phiên của luồng trò chuyện (ms); chỉ đổi khi kiểm thử. */
  chatSessionCheckMs: Number(process.env.CHAT_SESSION_CHECK_MS ?? 60_000),
  timezone: process.env.TZ ?? 'Asia/Ho_Chi_Minh',
  /** Web Push. Thiếu khóa thì tắt thông báo đẩy. Tạo khóa: npx web-push generate-vapid-keys */
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@localhost',
  },
  /**
   * Thông báo đẩy về ứng dụng di động. FCM: tệp khóa tài khoản dịch vụ Firebase (JSON). APNs: khóa .p8 của Apple.
   * Thiếu cấu hình kênh nào thì tắt kênh đó. *_BASE_URL, APNS_HOST chỉ đổi khi kiểm thử.
   */
  fcm: {
    serviceAccountFile: process.env.FCM_SERVICE_ACCOUNT_FILE ?? '',
    baseUrl: process.env.FCM_BASE_URL ?? 'https://fcm.googleapis.com',
  },
  apns: {
    keyFile: process.env.APNS_KEY_FILE ?? '',
    keyId: process.env.APNS_KEY_ID ?? '',
    teamId: process.env.APNS_TEAM_ID ?? '',
    bundleId: process.env.APNS_BUNDLE_ID ?? 'vn.cdn20.giaoviec',
    host:
      process.env.APNS_HOST ??
      (process.env.APNS_ENV === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com'),
  },
  /** Gửi thư nhắc việc. Thiếu SMTP_HOST thì tắt thư điện tử. */
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'Hệ thống giao nhiệm vụ <no-reply@localhost>',
  },
};
