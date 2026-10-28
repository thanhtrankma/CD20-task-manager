import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { generate } from 'otplib';
import { ADMIN_PASSWORD, OTP_SECRETS, PASSWORD, admin, closeDb, leader, login, request, sql, staff, unitId } from './helpers.mts';

after(closeDb);

describe('Đăng nhập, phiên', () => {
  test('health không cần đăng nhập', async () => {
    assert.equal((await request('/health')).status, 200);
  });

  test('chưa đăng nhập → 401', async () => {
    assert.equal((await request('/tasks')).status, 401);
  });

  test('sai mật khẩu → 401, thông báo chung không lộ tài khoản có tồn tại', async () => {
    const wrong = await request('/auth/login', { body: { username: 'canbo', password: 'sai-mat-khau-1' } });
    const ghost = await request('/auth/login', { body: { username: 'khongtontai', password: 'sai-mat-khau-1' } });
    assert.equal(wrong.status, 401);
    assert.equal(ghost.status, 401);
    assert.equal(wrong.body.message, ghost.body.message);
  });

  test('cookie phiên: HttpOnly, SameSite=Strict, không chứa thông tin người dùng', async () => {
    const res = await request('/auth/login', { body: { username: 'canbo', password: PASSWORD } });
    assert.equal(res.status, 200);
    const cookie = res.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.doesNotMatch(cookie, /canbo/);
  });

  test('CSDL chỉ lưu băm của mã phiên', async () => {
    const s = await staff();
    const token = decodeURIComponent(s.cookie.split('=')[1]);
    const rows = await sql('select id from sessions where id = $1', [token]);
    assert.equal(rows.length, 0);
  });

  test('đăng xuất thu hồi phiên', async () => {
    const s = await staff();
    assert.equal((await s.get('/auth/me')).status, 200);
    assert.equal((await s.post('/auth/logout')).status, 204);
    assert.equal((await s.get('/auth/me')).status, 401);
  });

  test('khóa tài khoản sau 5 lần sai, đúng mật khẩu cũng không vào được', async () => {
    for (let i = 0; i < 5; i++) {
      await request('/auth/login', { body: { username: 'khoaso', password: `sai-mat-khau-${i}` } });
    }
    const locked = await request('/auth/login', { body: { username: 'khoaso', password: PASSWORD } });
    assert.equal(locked.status, 401);
    assert.match(locked.body.message, /tạm khóa/);
    await sql(`update users set locked_until = null, failed_logins = 0 where username = 'khoaso'`);
    assert.ok(await login('khoaso'));
  });

  test('vô hiệu hóa tài khoản → mọi phiên của tài khoản đó bị thu hồi', async () => {
    const victim = await login('khoaso');
    const adm = await login('admin', ADMIN_PASSWORD);
    const id = (await sql(`select id from users where username = 'khoaso'`))[0].id;
    assert.equal((await adm.patch(`/users/${id}`, { isActive: false })).status, 200);
    assert.equal((await victim.get('/auth/me')).status, 401);
    assert.equal((await request('/auth/login', { body: { username: 'khoaso', password: PASSWORD } })).status, 401);
    assert.equal((await adm.patch(`/users/${id}`, { isActive: true })).status, 200);
  });
});

describe('Đổi mật khẩu lần đầu', () => {
  test('tài khoản mới bị chặn mọi chức năng cho tới khi đổi mật khẩu', async () => {
    const adm = await login('admin', ADMIN_PASSWORD);
    const pdt = (await sql(`select id from units where code = 'PDT'`))[0].id;
    const temp = 'TamThoi12345';
    const created = await adm.post('/users', {
      username: 'moitao', fullName: 'Cán bộ mới', unitId: pdt, role: 'STAFF', temporaryPassword: temp,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.passwordHash, undefined, 'không trả băm mật khẩu');

    const u = await login('moitao', temp);
    const blocked = await u.get('/tasks');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'PASSWORD_CHANGE_REQUIRED');
    assert.equal((await u.get('/auth/me')).status, 200);

    assert.equal((await u.post('/auth/change-password', { currentPassword: temp, newPassword: 'yeu' })).status, 400);
    assert.equal((await u.post('/auth/change-password', { currentPassword: temp, newPassword: PASSWORD })).status, 204);
    assert.equal((await u.get('/tasks')).status, 200);
  });
});

describe('Xác thực hai lớp', () => {
  test('bật OTP: sau đó đăng nhập phải có mã đúng', async () => {
    const s = await login('khoaso');
    const setup = await s.post('/auth/2fa/setup');
    assert.equal(setup.status, 201);
    const secret = new URL(setup.body.otpauthUrl).searchParams.get('secret')!;
    assert.equal((await s.post('/auth/2fa/enable', { code: '000000' })).status, 400);
    assert.equal((await s.post('/auth/2fa/enable', { code: await generate({ secret }) })).status, 204);

    const stored = (await sql(`select totp_secret from users where username = 'khoaso'`))[0].totp_secret;
    assert.ok(!stored.includes(secret), 'khóa OTP được mã hóa trong CSDL');

    const noOtp = await request('/auth/login', { body: { username: 'khoaso', password: PASSWORD } });
    assert.equal(noOtp.status, 401);
    assert.equal(noOtp.body.code, 'OTP_REQUIRED');
    const badOtp = await request('/auth/login', { body: { username: 'khoaso', password: PASSWORD, otp: '123456' } });
    assert.equal(badOtp.status, 401);
    const ok = await login('khoaso', PASSWORD, await generate({ secret }));

    assert.equal((await ok.post('/auth/2fa/disable', { password: PASSWORD, code: await generate({ secret }) })).status, 204);
    await sql(`update users set failed_logins = 0 where username = 'khoaso'`);
  });
});

describe('Bắt buộc xác thực hai lớp cho lãnh đạo, quản trị', () => {
  test('lãnh đạo mới: đổi mật khẩu → bị chặn tới khi bật OTP → dùng được', async () => {
    const adm = await admin();
    const temp = 'TamThoi12345';
    const res = await adm.post('/users', {
      username: 'lanhdaomoi', fullName: 'Lãnh đạo mới', unitId: await unitId('BGH'), role: 'LEADER', temporaryPassword: temp,
    });
    assert.equal(res.status, 201);
    const u = await login('lanhdaomoi', temp);
    assert.equal((await u.post('/auth/change-password', { currentPassword: temp, newPassword: PASSWORD })).status, 204);

    const me = (await u.get('/auth/me')).body;
    assert.equal(me.twoFactorRequired, true);
    assert.equal(me.twoFactorMandatory, true);
    const blocked = await u.get('/tasks');
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.code, 'TWO_FACTOR_REQUIRED');
    assert.equal((await u.get('/dashboard/summary')).status, 403);

    const setup = await u.post('/auth/2fa/setup');
    assert.equal(setup.status, 201);
    const secret = new URL(setup.body.otpauthUrl).searchParams.get('secret')!;
    assert.equal((await u.post('/auth/2fa/enable', { code: await generate({ secret }) })).status, 204);
    assert.equal((await u.get('/tasks')).status, 200);
    assert.equal((await u.get('/auth/me')).body.twoFactorRequired, false);

    const off = await u.post('/auth/2fa/disable', { password: PASSWORD, code: await generate({ secret }) });
    assert.equal(off.status, 400, 'không được tự tắt');
  });

  test('cán bộ thường không bắt buộc', async () => {
    const me = (await (await staff()).get('/auth/me')).body;
    assert.equal(me.twoFactorRequired, false);
    assert.equal(me.twoFactorMandatory, false);
  });

  test('lãnh đạo đã bật OTP đăng nhập thiếu mã → yêu cầu mã', async () => {
    assert.ok(OTP_SECRETS.lanhdao);
    const res = await request('/auth/login', { body: { username: 'lanhdao', password: PASSWORD } });
    assert.equal(res.body.code, 'OTP_REQUIRED');
    assert.ok(await leader());
  });
});
