// Chuẩn bị môi trường kiểm thử (chạy một lần trước mọi file *.test.mts):
//   CSDL kiểm thử riêng (xóa trắng, chạy migration, nạp dữ liệu mẫu) → khởi động API từ bản build → tạo tài khoản phụ.
// Không bao giờ đụng CSDL phát triển: tên CSDL kiểm thử bắt buộc kết thúc bằng "_test".
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { generate } from 'otplib';
import pg from 'pg';

const API_DIR = join(import.meta.dirname, '..');
const require = createRequire(join(API_DIR, 'package.json'));
const ORIGIN = 'http://giaoviec.test';

let server: ChildProcess | undefined;
let tmp: string | undefined;

/** CSDL kiểm thử: TEST_DATABASE_URL, hoặc lấy DATABASE_URL trong .env và thêm hậu tố _test vào tên CSDL. */
function testDatabaseUrl() {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const envFile = join(API_DIR, '.env');
  const base = process.env.DATABASE_URL ?? (existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')).DATABASE_URL : undefined);
  if (!base) throw new Error('Thiếu TEST_DATABASE_URL hoặc DATABASE_URL');
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/^\//, '')}_test`;
  return url.toString();
}

async function resetDatabase(url: string) {
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Từ chối xóa CSDL "${dbName}": tên CSDL kiểm thử phải kết thúc bằng _test`);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const c = new pg.Client({ connectionString: admin.toString() });
  await c.connect();
  const exists = await c.query('select 1 from pg_database where datname = $1', [dbName]);
  if (!exists.rowCount) await c.query(`create database "${dbName}"`);
  await c.end();

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  await db.query('drop schema if exists public cascade; create schema public;');
  await db.end();
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, cwd: string) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} lỗi:\n${r.stdout}\n${r.stderr}`);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

const password = () => `Kt${randomBytes(9).toString('base64url')}9`;

async function call(base: string, path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const res = await fetch(base + path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      ...(init.cookie ? { Cookie: init.cookie } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  const text = await res.text();
  return { cookie, body: text ? JSON.parse(text) : null };
}

export async function globalSetup() {
  if (!existsSync(join(API_DIR, 'dist/main.js'))) throw new Error('Chưa build API: chạy npm run build');

  const databaseUrl = testDatabaseUrl();
  await resetDatabase(databaseUrl);
  tmp = mkdtempSync(join(tmpdir(), 'giaoviec-test-'));

  // Chứng chỉ tự ký cho dịch vụ đẩy giả lập (máy chủ web-push luôn gửi qua HTTPS).
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost', '-keyout', join(tmp, 'push-key.pem'), '-out', join(tmp, 'push-cert.pem')],
    process.env, tmp);
  const vapid = require('web-push').generateVAPIDKeys() as { publicKey: string; privateKey: string };

  const [port, smtpPort, fcmPort, apnsPort] = [await freePort(), await freePort(), await freePort(), await freePort()];

  // Thông báo đẩy ứng dụng di động: khóa tài khoản dịch vụ Firebase (RSA), khóa APNs (EC P-256) giả lập.
  // Dịch vụ FCM, APNs giả chạy trong notifications.mobile.test.mts, kiểm tra chữ ký bằng khóa công khai.
  const fcmKey = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const apnsKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  writeFileSync(join(tmp, 'fcm-account.json'), JSON.stringify({
    type: 'service_account',
    project_id: 'giaoviec-test',
    client_email: 'push@giaoviec-test.iam.gserviceaccount.com',
    private_key: fcmKey.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    token_uri: `https://localhost:${fcmPort}/token`,
  }));
  writeFileSync(join(tmp, 'fcm-public.pem'), fcmKey.publicKey.export({ type: 'spki', format: 'pem' }));
  writeFileSync(join(tmp, 'apns-key.p8'), apnsKey.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  writeFileSync(join(tmp, 'apns-public.pem'), apnsKey.publicKey.export({ type: 'spki', format: 'pem' }));
  const adminPassword = password();
  const demoPassword = password();
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    TZ: 'Asia/Ho_Chi_Minh',
    DATABASE_URL: databaseUrl,
    APP_ORIGIN: ORIGIN,
    APP_SECRET: randomBytes(32).toString('hex'),
    COOKIE_SECURE: 'false',
    PORT: String(port),
    UPLOAD_DIR: join(tmp, 'uploads'),
    LOGIN_RATE_LIMIT: '1000',
    RATE_LIMIT: '100000',
    CHAT_MESSAGE_RATE_LIMIT: '100000',
    CHAT_SESSION_CHECK_MS: '500',
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: 'mailto:test@giaoviec.test',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtpPort),
    SMTP_SECURE: 'false',
    SMTP_FROM: 'Giao viec <no-reply@giaoviec.test>',
    PUSH_ALLOWED_HOSTS: 'localhost,fcm.googleapis.com',
    FCM_SERVICE_ACCOUNT_FILE: join(tmp, 'fcm-account.json'),
    FCM_BASE_URL: `https://localhost:${fcmPort}`,
    APNS_KEY_FILE: join(tmp, 'apns-key.p8'),
    APNS_KEY_ID: 'KEYID12345',
    APNS_TEAM_ID: 'TEAMID1234',
    APNS_HOST: `localhost:${apnsPort}`,
    NODE_EXTRA_CA_CERTS: join(tmp, 'push-cert.pem'),
    ADMIN_USERNAME: 'admin',
    ADMIN_PASSWORD: adminPassword,
    DEMO_PASSWORD: demoPassword,
  };

  // Chạy trong thư mục tạm để không nạp nhầm .env của máy phát triển.
  run(process.execPath, [join(API_DIR, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'], env, API_DIR);
  run(process.execPath, [join(API_DIR, 'dist/cli/seed.js'), '--demo'], env, tmp);

  const log = openSync(join(tmp, 'server.log'), 'a');
  server = spawn(process.execPath, [join(API_DIR, 'dist/main.js')], { cwd: tmp, env, stdio: ['ignore', log, log] });
  const base = `http://127.0.0.1:${port}/api`;
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {}
    if (i > 100 || server.exitCode !== null) {
      throw new Error(`API không khởi động được:\n${readFileSync(join(tmp, 'server.log'), 'utf8')}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // Quản trị, lãnh đạo bắt buộc xác thực hai lớp: bật sẵn, lưu khóa để các bài kiểm thử sinh mã khi đăng nhập.
  const otpSecrets: Record<string, string> = {};
  const enableOtp = async (username: string, cookie?: string) => {
    const setup = await call(base, '/auth/2fa/setup', { cookie, body: {} });
    const secret = new URL(setup.body.otpauthUrl).searchParams.get('secret')!;
    await call(base, '/auth/2fa/enable', { cookie, body: { code: await generate({ secret }) } });
    otpSecrets[username] = secret;
  };

  // Tài khoản phụ: quản trị đổi mật khẩu lần đầu, tạo cán bộ ở đơn vị khác nhánh (Phòng Đào tạo).
  const adminNew = password();
  const admin = await call(base, '/auth/login', { body: { username: 'admin', password: adminPassword } });
  await call(base, '/auth/change-password', { cookie: admin.cookie, body: { currentPassword: adminPassword, newPassword: adminNew } });
  await enableOtp('admin', admin.cookie);
  await enableOtp('lanhdao', (await call(base, '/auth/login', { body: { username: 'lanhdao', password: demoPassword } })).cookie);
  const units = (await call(base, '/units', { cookie: admin.cookie })).body as { id: number; code: string }[];
  const pdt = units.find((u) => u.code === 'PDT')!;
  for (const username of ['canbopdt', 'khoaso']) {
    const temp = password();
    await call(base, '/users', {
      cookie: admin.cookie,
      body: { username, fullName: `Cán bộ ${username}`, unitId: pdt.id, role: 'STAFF', temporaryPassword: temp },
    });
    const u = await call(base, '/auth/login', { body: { username, password: temp } });
    await call(base, '/auth/change-password', { cookie: u.cookie, body: { currentPassword: temp, newPassword: demoPassword } });
  }

  Object.assign(process.env, {
    TEST_API: base,
    TEST_ORIGIN: ORIGIN,
    TEST_DATABASE_URL: databaseUrl,
    TEST_PASSWORD: demoPassword,
    TEST_ADMIN_PASSWORD: adminNew,
    TEST_OTP_SECRETS: JSON.stringify(otpSecrets),
    TEST_TMP: tmp,
    TEST_SMTP_PORT: String(smtpPort),
    TEST_FCM_PORT: String(fcmPort),
    TEST_APNS_PORT: String(apnsPort),
    TEST_ENV_JSON: JSON.stringify(env),
  });
}

export async function globalTeardown() {
  server?.kill();
  if (tmp && !process.env.TEST_KEEP) rmSync(tmp, { recursive: true, force: true });
  else if (tmp) console.log(`Giữ thư mục kiểm thử (có server.log): ${tmp}`);
}
