// Nhắc việc: thông báo đẩy (dịch vụ đẩy giả lập, giải mã nội dung như trình duyệt), thư điện tử (máy chủ thư giả lập),
// chống SSRF, nhắc hạn hằng ngày gộp một lời nhắc mỗi người.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { SMTPServer } from 'smtp-server';
import { closeDb, createTask, leader, sql, staff, userId, waitFor } from './helpers.mts';

const require = createRequire(import.meta.url);
const ece = require('http_ece');
const TMP = process.env.TEST_TMP!;

type Push = { path: string; headers: Record<string, string | string[] | undefined>; body: Buffer };
type Mail = { to: string[]; raw: string };
const pushes: Push[] = [];
const mails: Mail[] = [];
let pushServer: Server;
let pushPort = 0;
let smtp: SMTPServer;

// Khóa của "trình duyệt" giả lập: máy chủ mã hóa bằng khóa công khai này.
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const authSecret = randomBytes(16);
const keys = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: authSecret.toString('base64url') };
const decrypt = (buf: Buffer) => JSON.parse(ece.decrypt(buf, { version: 'aes128gcm', privateKey: ecdh, authSecret }).toString('utf8'));
const endpoint = (name: string) => `https://localhost:${pushPort}/push/${name}`;
const pushesTo = (name: string) => pushes.filter((p) => p.path === `/push/${name}`);

before(async () => {
  pushServer = createServer({ key: readFileSync(join(TMP, 'push-key.pem')), cert: readFileSync(join(TMP, 'push-cert.pem')) }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      pushes.push({ path: req.url!, headers: req.headers, body: Buffer.concat(chunks) });
      res.statusCode = req.url!.includes('gone') ? 410 : 201;
      res.end();
    });
  });
  await new Promise<void>((r) => pushServer.listen(0, '127.0.0.1', r));
  pushPort = (pushServer.address() as { port: number }).port;

  smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onData(stream, session, cb) {
      let raw = '';
      stream.on('data', (c) => (raw += c));
      stream.on('end', () => {
        mails.push({ to: session.envelope.rcptTo.map((r) => r.address), raw });
        cb();
      });
    },
  });
  await new Promise<void>((r) => smtp.listen(Number(process.env.TEST_SMTP_PORT), '127.0.0.1', r));
});

after(async () => {
  pushServer?.close();
  await new Promise<void>((r) => smtp.close(() => r()));
  await closeDb();
});

/** Giải mã phần nội dung thư (quoted-printable) để tìm chuỗi tiếng Việt. */
const mailText = (m: Mail) =>
  Buffer.from(
    m.raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
    'latin1',
  ).toString('utf8');

describe('Đăng ký thiết bị nhận thông báo đẩy', () => {
  test('trả khóa công khai VAPID, trạng thái kênh', async () => {
    const res = await (await staff()).get('/notifications/settings');
    assert.equal(res.status, 200);
    assert.equal(res.body.push.enabled, true);
    assert.match(res.body.push.publicKey, /^[A-Za-z0-9_-]{80,}$/);
    assert.equal(res.body.email.enabled, true);
  });

  for (const bad of [
    'http://127.0.0.1:5432/x',
    'http://localhost/push/khong-https',
    'https://evil.example.com/p',
    'file:///etc/passwd',
    'https://fcm.googleapis.com.evil.com/x',
    'https://169.254.169.254/latest/meta-data',
  ]) {
    test(`chặn địa chỉ không phải dịch vụ đẩy (SSRF): ${bad}`, async () => {
      const res = await (await staff()).post('/notifications/push/subscribe', { endpoint: bad, keys });
      assert.equal(res.status, 400);
    });
  }
});

describe('Gửi nhắc việc', () => {
  test('giao việc → thông báo đẩy mã hóa, chỉ có câu chung và đường dẫn, không có tên nhiệm vụ', async () => {
    const s = await staff();
    assert.equal((await s.post('/notifications/push/subscribe', { endpoint: endpoint('canbo-1'), keys })).status, 204);
    const email = `canbo.${Date.now()}@giaoviec.test`;
    assert.equal((await s.patch('/auth/profile', { email })).status, 200);
    assert.equal((await s.patch('/auth/profile', { email: 'khong-phai-thu' })).status, 400);

    const secretTitle = `Nhiệm vụ tuyệt đối không lộ ${Date.now()}`;
    const task = await createTask(await leader(), { title: secretTitle });

    const push = await waitFor(() => pushesTo('canbo-1')[0]);
    assert.ok(push, 'thiết bị nhận được thông báo đẩy');
    assert.equal(push.headers['content-encoding'], 'aes128gcm');
    assert.match(String(push.headers.authorization), /^vapid t=.+, k=.+/);
    assert.ok(Number(push.headers.ttl) > 0);
    const payload = decrypt(push.body);
    assert.equal(payload.body, 'Đồng chí được giao nhiệm vụ mới');
    assert.equal(payload.url, `/tasks/${task.id}`);
    assert.doesNotMatch(JSON.stringify(payload), /tuyệt đối không lộ/);

    const mail = await waitFor(() => mails.find((m) => m.to.includes(email)));
    assert.ok(mail, 'nhận được thư nhắc việc');
    const text = mailText(mail);
    assert.match(text, /Đồng chí được giao nhiệm vụ mới/);
    assert.match(text, new RegExp(`/tasks/${task.id}`));
    assert.doesNotMatch(text, /tuyệt đối không lộ/);
  });

  test('chỉ người được giao nhận thông báo đẩy', async () => {
    const l = await leader();
    await l.post('/notifications/push/subscribe', { endpoint: endpoint('lanhdao-1'), keys });
    const before = pushesTo('lanhdao-1').length;
    await createTask(l);
    await waitFor(() => pushesTo('canbo-1').length >= 2);
    assert.equal(pushesTo('lanhdao-1').length, before);
    await l.post('/notifications/push/unsubscribe', { endpoint: endpoint('lanhdao-1') });
  });

  test('thiết bị đã hủy (410) tự bị xóa', async () => {
    const s = await staff();
    await s.post('/notifications/push/subscribe', { endpoint: endpoint('gone-1'), keys });
    const countBefore = (await s.get('/notifications/settings')).body.push.devices;
    assert.equal((await s.post('/notifications/test')).status, 204);
    const countAfter = await waitFor(async () => {
      const n = (await s.get('/notifications/settings')).body.push.devices;
      return n === countBefore - 1 ? n : 0;
    });
    assert.equal(countAfter, countBefore - 1);
  });

  test('hủy đăng ký thì không nhận nữa; người khác không gỡ được thiết bị của mình', async () => {
    const s = await staff();
    await s.post('/notifications/push/subscribe', { endpoint: endpoint('canbo-2'), keys });
    const l = await leader();
    await l.post('/notifications/push/unsubscribe', { endpoint: endpoint('canbo-2') });
    assert.equal((await sql('select 1 from push_subscriptions where endpoint = $1', [endpoint('canbo-2')])).length, 1);

    assert.equal((await s.post('/notifications/push/unsubscribe', { endpoint: endpoint('canbo-2') })).status, 204);
    const n = pushesTo('canbo-2').length;
    await s.post('/notifications/test');
    await waitFor(() => pushesTo('canbo-1').length >= 3);
    assert.equal(pushesTo('canbo-2').length, n);
  });

  test('nhắc hạn hằng ngày: mỗi người một thông báo đẩy và một thư gộp', async () => {
    const l = await leader();
    const due = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
    await createTask(l, { dueDate: due(20) });
    await createTask(l, { dueDate: due(22) });
    const overdue = await createTask(l, { dueDate: due(1) });
    await sql(`update tasks set due_date = now() - interval '2 hours' where id = $1`, [overdue.id]);

    const email = (await sql('select email from users where id = $1', [await userId('canbo')]))[0].email;
    const pushBefore = pushesTo('canbo-1').length;
    const mailBefore = mails.length;

    // Chạy tác vụ nhắc hạn ngay (không chờ 7h sáng) trong ngữ cảnh Nest của bản build.
    const apiDir = join(import.meta.dirname, '..');
    const script = `
      const { NestFactory } = require('@nestjs/core');
      const { AppModule } = require('./dist/app.module');
      const { TaskReminderService } = require('./dist/modules/tasks/task-reminder.service');
      (async () => {
        const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
        await app.get(TaskReminderService).run();
        await new Promise((r) => setTimeout(r, 2000));
        await app.close();
      })().catch((e) => { console.error(e); process.exit(1); });`;
    const env = { ...JSON.parse(process.env.TEST_ENV_JSON!), PORT: '0' };
    // Chạy bất đồng bộ: dịch vụ đẩy, máy chủ thư giả lập (cùng tiến trình này) phải trả lời được trong lúc chờ.
    let stderr = '';
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(process.execPath, ['-e', script], { cwd: apiDir, env });
      child.stderr.on('data', (c) => (stderr += c));
      child.on('exit', resolve);
    });
    assert.equal(code, 0, stderr);

    // Thông báo giao việc của 3 nhiệm vụ trên cũng gửi chạy nền nên chỉ đếm lời nhắc hạn.
    const isReminder = (text: string) => /Đồng chí có \d+ nhiệm vụ/.test(text);
    const reminderPushes = () => pushesTo('canbo-1').slice(pushBefore).filter((p) => isReminder(decrypt(p.body).body));
    await waitFor(() => reminderPushes().length);
    assert.equal(reminderPushes().length, 1, 'chỉ một thông báo đẩy gộp');
    assert.match(decrypt(reminderPushes()[0].body).body, /^Đồng chí có \d+ nhiệm vụ sắp đến hạn, \d+ nhiệm vụ quá hạn/);

    const reminderMails = () => mails.slice(mailBefore).filter((m) => m.to.includes(email) && isReminder(mailText(m)));
    await waitFor(() => reminderMails().length);
    assert.equal(reminderMails().length, 1, 'chỉ một thư gộp');
  });
});
