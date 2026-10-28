// Lộ trình tuần 5: duyệt hàng loạt, tiến độ việc con, đơn vị dạng cây, tài khoản (mở khóa, đặt lại OTP, nhập Excel), nhật ký.
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { generate } from 'otplib';
import { PASSWORD, admin, closeDb, createTask, head, leader, login, request, sql, staff, unitId, userId } from './helpers.mts';

after(closeDb);

const unique = () => Math.random().toString(36).slice(2, 7);

describe('Duyệt nhanh, duyệt hàng loạt', () => {
  test('mục Chờ duyệt kèm báo cáo, đề nghị gia hạn đang chờ để duyệt ngay trên danh sách', async () => {
    const l = await leader();
    const s = await staff();
    const t1 = await createTask(l);
    const sub = await s.post(`/tasks/${t1.id}/submissions`, { content: 'Xong' });
    const t2 = await createTask(l);
    const ext = await s.post(`/tasks/${t2.id}/extensions`, { newDueDate: new Date(Date.now() + 9 * 86_400_000).toISOString(), reason: 'Chờ số liệu' });
    const items = (await l.get('/tasks?view=review&pageSize=100')).body.items as {
      id: number;
      submissions: { id: number }[];
      extensionRequests: { id: number }[];
    }[];
    assert.equal(items.find((t) => t.id === t1.id)?.submissions[0].id, sub.body.id);
    assert.equal(items.find((t) => t.id === t2.id)?.extensionRequests[0].id, ext.body.id);
  });

  test('duyệt "Đạt" nhiều báo cáo; báo cáo không có quyền thì báo lỗi riêng, các báo cáo khác vẫn duyệt', async () => {
    const l = await leader();
    const s = await staff();
    const mine = await Promise.all([createTask(l), createTask(l)]);
    const subs = await Promise.all(mine.map((t) => s.post(`/tasks/${t.id}/submissions`, { content: 'Xong' })));
    // Việc do chỉ huy khoa giao: lãnh đạo vẫn có quyền duyệt (lãnh đạo quản lý mọi việc), nên dùng việc của chỉ huy với
    // người duyệt là chỉ huy khoa để thử trường hợp không có quyền.
    const other = await createTask(l);
    const otherSub = await s.post(`/tasks/${other.id}/submissions`, { content: 'Xong' });

    const h = await head();
    const denied = await h.post('/submissions/approve-batch', { submissionIds: [otherSub.body.id] });
    assert.equal(denied.status, 200);
    assert.equal(denied.body.approved, 0);
    assert.equal(denied.body.failed.length, 1);

    const res = await l.post('/submissions/approve-batch', { submissionIds: [...subs.map((x) => x.body.id), otherSub.body.id] });
    assert.equal(res.status, 200);
    assert.equal(res.body.approved, 3);
    for (const t of mine) assert.equal((await l.get(`/tasks/${t.id}`)).body.status, 'DONE');

    const again = await l.post('/submissions/approve-batch', { submissionIds: [subs[0].body.id] });
    assert.equal(again.body.failed[0].message, 'Báo cáo này đã được xử lý');
    assert.equal((await s.post('/submissions/approve-batch', { submissionIds: [] })).status, 400);
  });
});

describe('Theo dõi việc giao cho đơn vị', () => {
  test('nhiệm vụ cha hiện việc con kèm người nhận, tiến độ, hạn', async () => {
    const l = await leader();
    const parent = await createTask(l, { assignees: [{ unitId: await unitId('KCNTT') }] });
    const child = await createTask(await head(), { parentId: parent.id });
    await (await staff()).post(`/tasks/${child.id}/progress`, { progress: 70 });
    const c = (await l.get(`/tasks/${parent.id}`)).body.children.find((x: { id: number }) => x.id === child.id);
    assert.equal(c.progress, 70);
    assert.equal(c.assignees[0].user.id, await userId('canbo'));
    assert.ok(c.assignees[0].acknowledgedAt);
    assert.equal(c.createdBy.id, await userId('truongkhoa'));
  });
});

describe('Đơn vị dạng cây', () => {
  test('sửa tên, chuyển đơn vị; ẩn khi không còn cán bộ; không ẩn được khi còn người hoặc đơn vị gốc', async () => {
    const a = await admin();
    const root = (await sql('select id from units where parent_id is null'))[0].id;
    const code = `T${unique()}`.toUpperCase();
    const unit = (await a.post('/units', { code, name: 'Tổ thử nghiệm', parentId: root })).body;
    const child = (await a.post('/units', { code: `${code}C`, name: 'Nhóm con', parentId: unit.id })).body;

    assert.equal((await a.patch(`/units/${unit.id}`, { name: 'Tổ thử nghiệm (đổi tên)' })).status, 200);
    assert.equal((await a.patch(`/units/${unit.id}`, { parentId: child.id })).status, 400, 'không chuyển vào đơn vị con của nó');
    assert.equal((await a.patch(`/units/${root}`, { isActive: false })).status, 400, 'không ẩn đơn vị gốc');

    const blocked = await a.patch(`/units/${unit.id}`, { isActive: false });
    assert.equal(blocked.status, 400, 'còn đơn vị con đang hoạt động');
    assert.equal((await a.patch(`/units/${child.id}`, { isActive: false })).status, 200);
    assert.equal((await a.patch(`/units/${unit.id}`, { isActive: false })).status, 200);

    const withPeople = await a.patch(`/units/${await unitId('BM-MMT')}`, { isActive: false });
    assert.equal(withPeople.status, 400);
    assert.match(withPeople.body.message, /cán bộ/);
    assert.equal((await (await staff()).patch(`/units/${unit.id}`, { name: 'x y' })).status, 403);
  });

  test('chuyển cán bộ sang đơn vị khác: thu hồi phiên, phạm vi đổi theo đơn vị mới', async () => {
    const a = await admin();
    const temp = 'TamThoi12345';
    const username = `chuyen${unique()}`;
    const created = await a.post('/users', { username, fullName: 'Cán bộ chuyển đơn vị', unitId: await unitId('BM-MMT'), role: 'STAFF', temporaryPassword: temp });
    const u = await login(username, temp);
    await u.post('/auth/change-password', { currentPassword: temp, newPassword: PASSWORD });
    const headUsers = async () => ((await (await head()).get('/users')).body as { id: number }[]).map((x) => x.id);
    assert.ok((await headUsers()).includes(created.body.id));
    assert.equal((await a.patch(`/users/${created.body.id}`, { unitId: await unitId('PDT') })).status, 200);
    assert.ok(!(await headUsers()).includes(created.body.id), 'không còn thuộc khoa');

    // Sửa thông tin (gửi lại vai trò cũ) không đăng xuất người dùng; đổi vai trò thì đăng xuất.
    const session = await login(username);
    assert.equal((await a.patch(`/users/${created.body.id}`, { email: `${username}@giaoviec.test`, role: 'STAFF' })).status, 200);
    assert.equal((await session.get('/auth/me')).status, 200);
    assert.equal((await a.patch(`/users/${created.body.id}`, { role: 'UNIT_HEAD' })).status, 200);
    assert.equal((await session.get('/auth/me')).status, 401);
  });
});

describe('Tài khoản', () => {
  test('nhập từ Excel: tạo tài khoản, mật khẩu tạm ngẫu nhiên, bắt buộc đổi ở lần đầu', async () => {
    const a = await admin();
    const u1 = `nhap${unique()}`;
    const u2 = `nhap${unique()}`;
    const res = await a.post('/users/import', {
      rows: [
        { username: u1, fullName: 'Nguyễn Văn Nhập', unitCode: 'pdt', role: 'STAFF', rank: 'Đại úy', position: 'Trợ lý' },
        { username: u2, fullName: 'Trần Văn Nhập', unitCode: 'KCNTT', role: 'UNIT_HEAD', email: `${u2}@giaoviec.test` },
      ],
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.created.length, 2);
    const first = res.body.created[0];
    assert.match(first.temporaryPassword, /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z2-9]{12}$/);
    assert.notEqual(first.temporaryPassword, res.body.created[1].temporaryPassword);

    const s = await login(u1, first.temporaryPassword);
    assert.equal((await s.get('/tasks')).body.code, 'PASSWORD_CHANGE_REQUIRED');
    const row = (await sql('select rank, position, role, password_hash from users where username = $1', [u1]))[0];
    assert.equal(row.rank, 'Đại úy');
    assert.match(row.password_hash, /^\$argon2id\$/);
  });

  test('nhập từ Excel: tệp có lỗi thì báo từng dòng, không tạo tài khoản nào', async () => {
    const a = await admin();
    const ok = `nhap${unique()}`;
    const res = await a.post('/users/import', {
      rows: [
        { username: ok, fullName: 'Hợp lệ', unitCode: 'PDT', role: 'STAFF' },
        { username: 'canbo', fullName: 'Trùng tên', unitCode: 'PDT', role: 'STAFF' },
        { username: ok, fullName: 'Trùng trong tệp', unitCode: 'PDT', role: 'STAFF' },
        { username: `nhap${unique()}`, fullName: 'Sai đơn vị', unitCode: 'KHONGCO', role: 'STAFF' },
      ],
    });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.errors.map((e: { row: number }) => e.row), [3, 4, 5]);
    assert.equal((await sql('select count(*)::int as n from users where username = $1', [ok]))[0].n, 0);

    const admins = await a.post('/users/import', { rows: [{ username: `qt${unique()}`, fullName: 'Quản trị', unitCode: 'PDT', role: 'ADMIN' }] });
    assert.equal(admins.status, 400, 'không nhập tài khoản quản trị bằng tệp');
    assert.equal((await (await leader()).post('/users/import', { rows: [] })).status, 403);
  });

  test('mở khóa tài khoản bị khóa do nhập sai', async () => {
    const a = await admin();
    const id = await userId('canbopdt');
    await sql(`update users set locked_until = now() + interval '10 minutes', failed_logins = 0 where id = $1`, [id]);
    assert.equal((await request('/auth/login', { body: { username: 'canbopdt', password: PASSWORD } })).status, 401);
    const listed = ((await a.get('/users')).body as { id: number; lockedUntil: string | null }[]).find((u) => u.id === id);
    assert.ok(listed?.lockedUntil);
    assert.equal((await a.post(`/users/${id}/unlock`)).status, 204);
    assert.ok(await login('canbopdt'));
  });

  test('đặt lại xác thực hai lớp: thu hồi phiên, lần sau phải bật lại', async () => {
    const a = await admin();
    const username = `lanhdao${unique()}`;
    const { created } = (await a.post('/users/import', {
      rows: [{ username, fullName: 'Lãnh đạo thử', unitCode: 'BGH', role: 'LEADER' }],
    })).body;
    const temp = created[0].temporaryPassword;
    const u = await login(username, temp);
    await u.post('/auth/change-password', { currentPassword: temp, newPassword: PASSWORD });
    const secret = new URL((await u.post('/auth/2fa/setup')).body.otpauthUrl).searchParams.get('secret')!;
    await u.post('/auth/2fa/enable', { code: await generate({ secret }) });
    assert.equal((await u.get('/tasks')).status, 200);

    const id = await userId(username);
    assert.equal((await a.post(`/users/${id}/reset-2fa`)).status, 204);
    assert.equal((await u.get('/auth/me')).status, 401, 'phiên cũ bị thu hồi');
    const again = await login(username); // không cần mã OTP nữa
    assert.equal((await again.get('/auth/me')).body.twoFactorRequired, true);
    assert.equal((await (await leader()).post(`/users/${id}/reset-2fa`)).status, 403);
  });
});

describe('Tra cứu nhật ký', () => {
  test('lọc theo kết quả, người dùng, thời gian', async () => {
    await request('/auth/login', { body: { username: 'canbo', password: 'sai-mat-khau-9' } });
    await staff();
    const a = await admin();
    const errors = (await a.get('/audit-logs?result=error&pageSize=200')).body.items as { action: string }[];
    assert.ok(errors.some((e) => e.action === 'LOGIN_FAILED'));
    assert.ok(!errors.some((e) => e.action === 'LOGIN'));
    const oks = (await a.get('/audit-logs?result=ok&pageSize=200')).body.items as { action: string }[];
    assert.ok(oks.some((e) => e.action === 'LOGIN'), 'đăng nhập thành công (không có detail) vẫn thuộc nhóm thành công');
    assert.ok(!oks.some((e) => e.action === 'LOGIN_FAILED'));

    const id = await userId('canbo');
    const mine = (await a.get(`/audit-logs?userId=${id}&pageSize=200`)).body.items as { user: { username: string } | null }[];
    assert.ok(mine.length && mine.every((e) => e.user?.username === 'canbo'));
    const future = new Date(Date.now() + 86_400_000).toISOString();
    assert.equal((await a.get(`/audit-logs?from=${encodeURIComponent(future)}`)).body.total, 0);
    assert.equal((await a.get('/audit-logs?result=maybe')).status, 400);
  });
});
