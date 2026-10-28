// Tiện ích dùng chung cho các file kiểm thử. Biến TEST_* do global-setup.mts đặt.
import { generate } from 'otplib';
import pg from 'pg';

export const API = process.env.TEST_API!;
export const ORIGIN = process.env.TEST_ORIGIN!;
export const PASSWORD = process.env.TEST_PASSWORD!;
export const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD!;

export type Res<T = any> = { status: number; body: T; headers: Headers };

type Init = { method?: string; body?: unknown; form?: FormData; origin?: string | null; headers?: Record<string, string> };

/** Gọi API, có thể kèm cookie phiên. Mặc định gửi Origin hợp lệ như trình duyệt. */
export async function request<T = any>(path: string, init: Init = {}, cookie?: string): Promise<Res<T>> {
  const headers: Record<string, string> = { ...init.headers };
  if (init.origin !== null) headers.Origin = init.origin ?? ORIGIN;
  if (cookie) headers.Cookie = cookie;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + path, {
    method: init.method ?? (init.body !== undefined || init.form ? 'POST' : 'GET'),
    headers,
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, body, headers: res.headers };
}

/** Một người dùng đã đăng nhập (giữ cookie phiên). */
export class Session {
  readonly username: string;
  readonly cookie: string;
  constructor(username: string, cookie: string) {
    this.username = username;
    this.cookie = cookie;
  }
  get<T = any>(path: string) {
    return request<T>(path, {}, this.cookie);
  }
  post<T = any>(path: string, body: unknown = {}) {
    return request<T>(path, { body }, this.cookie);
  }
  patch<T = any>(path: string, body: unknown) {
    return request<T>(path, { method: 'PATCH', body }, this.cookie);
  }
  upload<T = any>(path: string, name: string, content: string | Uint8Array) {
    const form = new FormData();
    form.append('file', new Blob([content]), name);
    return request<T>(path, { form }, this.cookie);
  }
}

/** Khóa OTP của các tài khoản đã bật sẵn xác thực hai lớp (admin, lanhdao). */
export const OTP_SECRETS: Record<string, string> = JSON.parse(process.env.TEST_OTP_SECRETS ?? '{}');

export async function login(username: string, password = PASSWORD, otp?: string) {
  if (!otp && OTP_SECRETS[username]) otp = await generate({ secret: OTP_SECRETS[username] });
  const res = await request('/auth/login', { body: { username, password, otp } });
  if (res.status !== 200) throw new Error(`Đăng nhập ${username} lỗi: ${res.status} ${JSON.stringify(res.body)}`);
  return new Session(username, res.headers.get('set-cookie')!.split(';')[0]);
}

export const leader = () => login('lanhdao');
export const head = () => login('truongkhoa');
export const staff = () => login('canbo');
/** Cán bộ ở Phòng Đào tạo: khác nhánh đơn vị với khoa CNTT. */
export const otherStaff = () => login('canbopdt');
export const admin = () => login('admin', ADMIN_PASSWORD);

let pool: pg.Pool | undefined;
/** Truy vấn trực tiếp CSDL kiểm thử (chuẩn bị dữ liệu, kiểm tra kết quả). */
export async function sql<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  pool ??= new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2 });
  return (await pool.query<T>(text, params)).rows;
}
export async function closeDb() {
  await pool?.end();
  pool = undefined;
}

export async function userId(username: string): Promise<number> {
  return (await sql('select id from users where username = $1', [username]))[0].id;
}

export async function unitId(code: string): Promise<number> {
  return (await sql('select id from units where code = $1', [code]))[0].id;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Chờ tới khi điều kiện đúng (gửi thông báo đẩy, thư chạy nền, không chặn request). */
export async function waitFor<T>(fn: () => T | Promise<T>, timeoutMs = 5000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) return v;
    await sleep(100);
  }
}

/** Tạo nhiệm vụ mới (mặc định lãnh đạo giao cho cán bộ canbo, hạn 5 ngày). */
export async function createTask(by: Session, data: Record<string, unknown> = {}) {
  const res = await by.post('/tasks', {
    title: `Nhiệm vụ kiểm thử ${Math.random().toString(36).slice(2, 8)}`,
    dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    assignees: [{ userId: await userId('canbo') }],
    ...data,
  });
  if (res.status !== 201) throw new Error(`Tạo nhiệm vụ lỗi: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: number; title: string };
}
