// Thông báo đẩy về ứng dụng di động: đăng ký thiết bị, gửi qua FCM (HTTP v1), APNs (HTTP/2) giả lập.
// Dịch vụ giả kiểm tra chữ ký JWT bằng khóa công khai và ghi lại nội dung để kiểm tra không lộ nội dung nhiệm vụ.
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer as createHttpsServer, type Server } from 'node:https';
import { createSecureServer, type Http2SecureServer } from 'node:http2';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { admin, closeDb, createTask, leader, login, sql, staff, userId, waitFor } from './helpers.mts';

const TMP = process.env.TEST_TMP!;
const tls = { key: readFileSync(join(TMP, 'push-key.pem')), cert: readFileSync(join(TMP, 'push-cert.pem')) };
const fcmPublic = createPublicKey(readFileSync(join(TMP, 'fcm-public.pem')));
const apnsPublic = createPublicKey(readFileSync(join(TMP, 'apns-public.pem')));

type Fcm = { token: string; body: any };
type Apns = { token: string; headers: Record<string, string | string[] | undefined>; body: any; jwtValid: boolean };
const fcmSent: Fcm[] = [];
const apnsSent: Apns[] = [];
let fcmTokenRequests = 0;
let fcm: Server;
let apns: Http2SecureServer;

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
/** Kiểm tra JWT: RS256 (FCM, chữ ký PKCS#1) hoặc ES256 (APNs, chữ ký r||s). */
function verifyJwt(token: string, alg: 'RS256' | 'ES256') {
  const [h, c, s] = token.split('.');
  const data = Buffer.from(`${h}.${c}`);
  const sig = Buffer.from(s, 'base64url');
  const ok =
    alg === 'RS256'
      ? verify('RSA-SHA256', data, fcmPublic, sig)
      : verify('sha256', data, { key: apnsPublic, dsaEncoding: 'ieee-p1363' }, sig);
  return { ok, header: decode(h), claims: decode(c) };
}

const FCM_ANDROID = 'fcm-android-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:APA91b';
const APNS_IOS = 'a'.repeat(64);

before(async () => {
  fcm = createHttpsServer(tls, (req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      if (req.url === '/token') {
        const assertion = new URLSearchParams(raw).get('assertion')!;
        const jwt = verifyJwt(assertion, 'RS256');
        fcmTokenRequests++;
        const valid = jwt.ok && jwt.claims.scope === 'https://www.googleapis.com/auth/firebase.messaging';
        res.writeHead(valid ? 200 : 401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(valid ? { access_token: 'fcm-access-ok', expires_in: 3600 } : { error: 'invalid_grant' }));
        return;
      }
      if (req.url === '/v1/projects/giaoviec-test/messages:send' && req.headers.authorization === 'Bearer fcm-access-ok') {
        const body = JSON.parse(raw);
        fcmSent.push({ token: body.message.token, body });
        if (body.message.token.includes('gone')) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"name":"projects/giaoviec-test/messages/1"}');
        return;
      }
      res.writeHead(401);
      res.end();
    });
  });
  apns = createSecureServer(tls, (req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const token = req.url.replace('/3/device/', '');
      const bearer = String(req.headers.authorization ?? '').replace('bearer ', '');
      const jwt = verifyJwt(bearer, 'ES256');
      const jwtValid = jwt.ok && jwt.header.kid === 'KEYID12345' && jwt.claims.iss === 'TEAMID1234';
      apnsSent.push({ token, headers: req.headers, body: JSON.parse(raw), jwtValid });
      if (token.startsWith('b')) {
        res.writeHead(410, { 'content-type': 'application/json' });
        res.end('{"reason":"Unregistered"}');
        return;
      }
      res.writeHead(jwtValid ? 200 : 403);
      res.end();
    });
  });
  await new Promise<void>((r) => fcm.listen(Number(process.env.TEST_FCM_PORT), '127.0.0.1', r));
  await new Promise<void>((r) => apns.listen(Number(process.env.TEST_APNS_PORT), '127.0.0.1', r));
});

after(async () => {
  fcm?.close();
  apns?.close();
  await closeDb();
});

const register = (s: Awaited<ReturnType<typeof staff>>, platform: string, provider: string, token: string) =>
  s.post('/devices', { platform, provider, token, appVersion: '1.1.0' });

describe('Đăng ký điện thoại nhận thông báo', () => {
  test('máy chủ báo đã cấu hình kênh thông báo về ứng dụng', async () => {
    const st = (await (await staff()).get('/notifications/settings')).body;
    assert.equal(st.mobile.enabled, true);
  });

  test('dữ liệu không hợp lệ bị từ chối; quản trị không đăng ký được', async () => {
    const s = await staff();
    assert.equal((await register(s, 'WINDOWS', 'FCM', FCM_ANDROID)).status, 400);
    assert.equal((await register(s, 'ANDROID', 'FCM', 'ngắn')).status, 400);
    assert.equal((await register(s, 'ANDROID', 'FCM', 'x'.repeat(30) + '<script>')).status, 400);
    assert.equal((await register(await admin(), 'ANDROID', 'FCM', FCM_ANDROID)).status, 403);
  });

  test('giao việc → FCM và APNs nhận câu nhắc chung, có đường dẫn, không có tên nhiệm vụ; chữ ký hợp lệ', async () => {
    const s = await staff();
    assert.equal((await register(s, 'ANDROID', 'FCM', FCM_ANDROID)).status, 204);
    assert.equal((await register(s, 'IOS', 'APNS', APNS_IOS)).status, 204);
    assert.equal((await s.get('/notifications/settings')).body.mobile.devices, 2);

    const secret = `Nhiệm vụ không được lộ ${Date.now()}`;
    const task = await createTask(await leader(), { title: secret });

    const f = await waitFor(() => fcmSent.find((m) => m.token === FCM_ANDROID));
    assert.ok(f, 'FCM nhận được');
    assert.ok(fcmTokenRequests >= 1, 'đã xin mã truy cập bằng JWT ký RS256 hợp lệ');
    assert.deepEqual(f.body.message.notification, { title: 'Giao nhiệm vụ', body: 'Đồng chí được giao nhiệm vụ mới' });
    assert.equal(f.body.message.data.link, `/tasks/${task.id}`);
    assert.equal(f.body.message.android.notification.channel_id, 'nhac_viec');
    assert.doesNotMatch(JSON.stringify(f.body), /không được lộ/);

    const a = await waitFor(() => apnsSent.find((m) => m.token === APNS_IOS));
    assert.ok(a, 'APNs nhận được');
    assert.equal(a.jwtValid, true, 'JWT ES256 đúng kid, team');
    assert.equal(a.headers['apns-topic'], 'vn.cdn20.giaoviec');
    assert.equal(a.headers['apns-push-type'], 'alert');
    assert.equal(a.body.aps.alert.body, 'Đồng chí được giao nhiệm vụ mới');
    assert.ok(a.body.aps.badge >= 1, 'số chưa đọc trên biểu tượng');
    assert.equal(a.body.link, `/tasks/${task.id}`);
    assert.doesNotMatch(JSON.stringify(a.body), /không được lộ/);
  });

  test('thiết bị đã gỡ ứng dụng (FCM UNREGISTERED, APNs 410) tự bị xóa', async () => {
    const s = await staff();
    const goneFcm = 'fcm-gone-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const goneApns = 'b'.repeat(64);
    await register(s, 'ANDROID', 'FCM', goneFcm);
    await register(s, 'IOS', 'APNS', goneApns);
    await s.post('/notifications/test');
    const removed = await waitFor(async () => {
      const n = (await sql('select count(*)::int as n from devices where token in ($1, $2)', [goneFcm, goneApns]))[0].n;
      return n === 0 ? true : undefined;
    });
    assert.ok(removed);
  });

  test('máy dùng chung: người khác đăng nhập, cùng mã thì chuyển sang người đó', async () => {
    const shared = 'fcm-shared-token-cccccccccccccccccccccccccccccccccc';
    await register(await staff(), 'ANDROID', 'FCM', shared);
    await register(await leader(), 'ANDROID', 'FCM', shared);
    const row = (await sql('select user_id from devices where token = $1', [shared]))[0];
    assert.equal(row.user_id, await userId('lanhdao'));
  });

  test('chỉ gỡ được thiết bị của mình; đăng xuất thì thiết bị tự bị gỡ', async () => {
    const token = 'fcm-logout-token-dddddddddddddddddddddddddddddddddd';
    const s = await staff();
    await register(s, 'ANDROID', 'FCM', token);
    await (await leader()).post('/devices/unregister', { token });
    assert.equal((await sql('select count(*)::int as n from devices where token = $1', [token]))[0].n, 1);
    assert.equal((await s.post('/auth/logout')).status, 204);
    assert.equal((await sql('select count(*)::int as n from devices where token = $1', [token]))[0].n, 0);
  });

  test('tối đa 10 điện thoại mỗi người, bỏ máy lâu không dùng nhất', async () => {
    const u = await login('khoaso');
    for (let i = 0; i < 12; i++) await register(u, 'ANDROID', 'FCM', `fcm-many-${String(i).padStart(2, '0')}-${'e'.repeat(30)}`);
    const rows = await sql('select token from devices where user_id = $1', [await userId('khoaso')]);
    assert.equal(rows.length, 10);
    assert.ok(!rows.some((r) => r.token.startsWith('fcm-many-00')), 'máy cũ nhất bị bỏ');
  });
});
