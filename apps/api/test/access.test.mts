import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { admin, closeDb, createTask, head, leader, otherStaff, request, staff, unitId, userId } from './helpers.mts';

after(closeDb);

describe('Phân quyền theo vai trò', () => {
  test('cán bộ không giao được việc', async () => {
    const s = await staff();
    const res = await s.post('/tasks', {
      title: 'Không được phép',
      dueDate: new Date(Date.now() + 86_400_000).toISOString(),
      assignees: [{ userId: await userId('canbo') }],
    });
    assert.equal(res.status, 403);
  });

  test('cán bộ không xem được nhật ký, không quản lý tài khoản, đơn vị', async () => {
    const s = await staff();
    assert.equal((await s.get('/audit-logs')).status, 403);
    assert.equal((await s.get('/users')).status, 403);
    assert.equal((await s.post('/units', { code: 'X', name: 'Đơn vị lạ', parentId: 1 })).status, 403);
  });

  test('quản trị không đọc được nội dung công việc', async () => {
    const a = await admin();
    assert.equal((await a.get('/tasks')).status, 403);
    assert.equal((await a.get('/dashboard/summary')).status, 403);
  });

  test('danh sách tài khoản không lộ băm mật khẩu, khóa OTP', async () => {
    const a = await admin();
    const res = await a.get('/users');
    assert.equal(res.status, 200);
    const json = JSON.stringify(res.body);
    assert.doesNotMatch(json, /passwordHash|password_hash|totpSecret|\$argon2/);
  });
});

describe('Phạm vi dữ liệu theo đơn vị', () => {
  test('cán bộ đơn vị khác không thấy nhiệm vụ không giao cho mình (404, không lộ sự tồn tại)', async () => {
    const task = await createTask(await leader());
    const other = await otherStaff();
    assert.equal((await other.get(`/tasks/${task.id}`)).status, 404);
    const list = await other.get('/tasks');
    assert.ok(!list.body.items.some((t: { id: number }) => t.id === task.id));
    assert.equal((await other.post(`/tasks/${task.id}/comments`, { content: 'xen vào' })).status, 404);
  });

  test('chỉ huy khoa thấy việc giao cho cán bộ thuộc khoa', async () => {
    const task = await createTask(await leader());
    assert.equal((await (await head()).get(`/tasks/${task.id}`)).status, 200);
  });

  test('chỉ huy khoa không giao được việc cho đơn vị ngoài khoa', async () => {
    const h = await head();
    const res = await h.post('/tasks', {
      title: 'Giao sang phòng khác',
      dueDate: new Date(Date.now() + 86_400_000).toISOString(),
      assignees: [{ unitId: await unitId('PDT') }],
    });
    assert.equal(res.status, 403);
  });

  test('chỉ huy khoa giao được cho bộ môn trực thuộc', async () => {
    const task = await createTask(await head(), { assignees: [{ unitId: await unitId('BM-MMT') }] });
    assert.ok(task.id);
  });

  test('cán bộ được giao không sửa, hủy được nhiệm vụ', async () => {
    const task = await createTask(await leader());
    const s = await staff();
    assert.equal((await s.patch(`/tasks/${task.id}`, { title: 'Tự đổi tên' })).status, 403);
    assert.equal((await s.patch(`/tasks/${task.id}`, { status: 'CANCELLED' })).status, 403);
  });
});

describe('Chống tấn công', () => {
  test('request ghi dữ liệu từ nguồn lạ bị chặn (CSRF)', async () => {
    const task = await createTask(await leader());
    const s = await staff();
    const res = await request(`/tasks/${task.id}/comments`, { body: { content: 'x' }, origin: 'https://evil.example' }, s.cookie);
    assert.equal(res.status, 403);
  });

  test('trường lạ trong dữ liệu gửi lên bị từ chối', async () => {
    const task = await createTask(await leader());
    const s = await staff();
    assert.equal((await s.post(`/tasks/${task.id}/comments`, { content: 'x', userId: 1 })).status, 400);
  });

  test('không tự nâng quyền qua trang cá nhân', async () => {
    const s = await staff();
    assert.equal((await s.patch('/auth/profile', { email: null, role: 'LEADER' })).status, 400);
  });

  test('phản hồi API không được lưu đệm (máy dùng chung)', async () => {
    const res = await (await staff()).get('/tasks');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  test('tham số không hợp lệ → 400, không lỗi máy chủ', async () => {
    const s = await leader();
    assert.equal((await s.get('/tasks/abc')).status, 400);
    assert.equal((await s.get('/tasks?status=HACK')).status, 400);
    assert.equal((await s.get('/tasks?pageSize=100000')).status, 400);
  });
});
