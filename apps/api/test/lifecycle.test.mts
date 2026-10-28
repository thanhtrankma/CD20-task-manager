// Vòng đời nhiệm vụ (lộ trình tuần 4): xác nhận nhận, người theo dõi, đôn đốc, căn cứ giao, gia hạn, sửa/hủy, dòng hoạt động.
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { closeDb, createTask, head, leader, otherStaff, sql, staff, unitId, userId } from './helpers.mts';

after(closeDb);

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const PDF = '%PDF-1.4\n% kiem thu\n';
type S = Awaited<ReturnType<typeof staff>>;
const detail = async (s: S, id: number) => (await s.get(`/tasks/${id}`)).body;
const activityTypes = async (s: S, id: number) => (await detail(s, id)).activities.map((a: { type: string }) => a.type);
/** Thông báo trong hệ thống mới nhất của người dùng cho nhiệm vụ. */
const notified = async (s: S, id: number, title: string) =>
  ((await s.get('/notifications')).body as { title: string; link: string }[]).some(
    (n) => n.link === `/tasks/${id}` && n.title === title,
  );

describe('Xác nhận đã nhận nhiệm vụ', () => {
  test('người được giao xác nhận → Đang thực hiện, ghi thời điểm; không xác nhận lần hai', async () => {
    const l = await leader();
    const s = await staff();
    const task = await createTask(l, { dueDate: inDays(10) });
    assert.equal((await detail(s, task.id)).permissions.acknowledge, true);

    assert.equal((await s.post(`/tasks/${task.id}/acknowledge`)).status, 204);
    const d = await detail(l, task.id);
    assert.equal(d.status, 'IN_PROGRESS');
    assert.ok(d.assignees[0].acknowledgedAt);
    assert.equal(d.assignees[0].acknowledgedBy.id, await userId('canbo'));
    assert.equal((await detail(s, task.id)).permissions.acknowledge, false);
    assert.equal((await s.post(`/tasks/${task.id}/acknowledge`)).status, 400);
    assert.ok((await activityTypes(l, task.id)).includes('ACKNOWLEDGED'));

    // Đã nhận, còn xa hạn: không còn trong mục Cần xử lý.
    const todo = (await s.get('/tasks/todo')).body.items as { id: number }[];
    assert.ok(!todo.some((t) => t.id === task.id));
  });

  test('người giao, người ngoài không xác nhận thay', async () => {
    const l = await leader();
    const task = await createTask(l);
    assert.equal((await l.post(`/tasks/${task.id}/acknowledge`)).status, 403);
    assert.equal((await (await otherStaff()).post(`/tasks/${task.id}/acknowledge`)).status, 404);
  });

  test('chỉ huy đơn vị xác nhận thay đơn vị được giao', async () => {
    const task = await createTask(await leader(), { assignees: [{ unitId: await unitId('KCNTT') }] });
    const h = await head();
    assert.equal((await h.post(`/tasks/${task.id}/acknowledge`)).status, 204);
    assert.equal((await detail(h, task.id)).assignees[0].acknowledgedBy.id, await userId('truongkhoa'));
  });

  test('cập nhật tiến độ cũng tính là đã nhận', async () => {
    const task = await createTask(await leader());
    const s = await staff();
    await s.post(`/tasks/${task.id}/progress`, { progress: 20 });
    const d = await detail(s, task.id);
    assert.ok(d.assignees[0].acknowledgedAt);
    assert.equal(d.permissions.acknowledge, false);
  });
});

describe('Người theo dõi', () => {
  test('người giao thêm người theo dõi ngoài đơn vị; người theo dõi chỉ xem, nhận thông báo', async () => {
    const l = await leader();
    const s = await staff();
    const watcher = await otherStaff();
    const task = await createTask(l, { followerIds: [await userId('canbopdt')] });

    assert.equal((await watcher.get(`/tasks/${task.id}`)).status, 200);
    assert.equal((await detail(watcher, task.id)).following, true);
    assert.ok(await notified(watcher, task.id, 'Đồng chí được thêm theo dõi một nhiệm vụ'));
    const list = (await watcher.get('/tasks?view=following&pageSize=100')).body.items as { id: number }[];
    assert.ok(list.some((t) => t.id === task.id));
    assert.ok((await watcher.get('/tasks/counts')).body.following >= 1);

    // Chỉ xem: không cập nhật tiến độ, không nộp báo cáo, không tải tệp, không nhận việc.
    assert.equal((await watcher.post(`/tasks/${task.id}/progress`, { progress: 10 })).status, 403);
    assert.equal((await watcher.post(`/tasks/${task.id}/submissions`, { content: 'x' })).status, 403);
    assert.equal((await watcher.upload(`/files?taskId=${task.id}`, 'a.pdf', PDF)).status, 403);
    assert.equal((await watcher.post(`/tasks/${task.id}/acknowledge`)).status, 403);
    assert.ok(!((await watcher.get('/tasks/todo')).body.items as { id: number }[]).some((t) => t.id === task.id));

    await s.post(`/tasks/${task.id}/submissions`, { content: 'Xong' });
    assert.ok(await notified(watcher, task.id, 'Nhiệm vụ đồng chí theo dõi đã có báo cáo kết quả'));
  });

  test('chỉ huy khoa không thêm được người theo dõi ngoài khoa', async () => {
    const h = await head();
    const res = await h.post('/tasks', {
      title: 'Thêm người ngoài theo dõi',
      dueDate: inDays(5),
      assignees: [{ userId: await userId('canbo') }],
      followerIds: [await userId('canbopdt')],
    });
    assert.equal(res.status, 403);
  });

  test('lãnh đạo tự theo dõi, bỏ theo dõi; người không xem được thì không tự theo dõi được', async () => {
    const task = await createTask(await head());
    const l = await leader();
    assert.equal((await l.post(`/tasks/${task.id}/follow`)).status, 204);
    assert.equal((await detail(l, task.id)).following, true);
    assert.equal((await l.post(`/tasks/${task.id}/unfollow`)).status, 204);
    assert.equal((await detail(l, task.id)).following, false);
    assert.equal((await (await otherStaff()).post(`/tasks/${task.id}/follow`)).status, 404);
  });

  test('chỉ người giao thêm người theo dõi sau khi giao', async () => {
    const task = await createTask(await leader());
    const s = await staff();
    assert.equal((await s.post(`/tasks/${task.id}/followers`, { userIds: [await userId('canbopdt')] })).status, 403);
    assert.equal((await (await leader()).post(`/tasks/${task.id}/followers`, { userIds: [await userId('canbopdt')] })).status, 204);
    assert.equal((await (await otherStaff()).get(`/tasks/${task.id}`)).status, 200);
  });
});

describe('Đôn đốc', () => {
  test('người giao nhắc ngay; tối đa 3 lần mỗi ngày; người thực hiện không tự đôn đốc', async () => {
    const l = await leader();
    const s = await staff();
    const task = await createTask(l);
    const first = await l.post(`/tasks/${task.id}/nudge`);
    assert.equal(first.status, 200);
    assert.equal(first.body.remaining, 2);
    assert.ok(await notified(s, task.id, 'Đồng chí được nhắc khẩn trương thực hiện nhiệm vụ'));
    assert.equal((await s.post(`/tasks/${task.id}/nudge`)).status, 403);
    await l.post(`/tasks/${task.id}/nudge`);
    await l.post(`/tasks/${task.id}/nudge`);
    assert.equal((await l.post(`/tasks/${task.id}/nudge`)).status, 429);
    const nudges = (await activityTypes(l, task.id)).filter((t: string) => t === 'NUDGED');
    assert.equal(nudges.length, 3);
  });

  test('không đôn đốc khi đã nộp báo cáo chờ duyệt', async () => {
    const l = await leader();
    const task = await createTask(l);
    await (await staff()).post(`/tasks/${task.id}/submissions`, { content: 'Xong' });
    assert.equal((await l.post(`/tasks/${task.id}/nudge`)).status, 400);
  });
});

describe('Căn cứ giao nhiệm vụ', () => {
  test('lưu, hiển thị, sửa được; quá dài bị từ chối', async () => {
    const l = await leader();
    const source = 'Kết luận giao ban tuần 43 (Thông báo số 125/TB-CĐN20 ngày 27/10/2026)';
    const task = await createTask(l, { source });
    assert.equal((await detail(await staff(), task.id)).source, source);
    assert.equal((await l.patch(`/tasks/${task.id}`, { source: 'Kế hoạch số 30/KH-CĐN20' })).status, 200);
    assert.equal((await detail(l, task.id)).source, 'Kế hoạch số 30/KH-CĐN20');
    const tooLong = await l.post('/tasks', {
      title: 'Căn cứ quá dài',
      dueDate: inDays(3),
      source: 'x'.repeat(501),
      assignees: [{ userId: await userId('canbo') }],
    });
    assert.equal(tooLong.status, 400);
  });
});

describe('Xin gia hạn', () => {
  test('cán bộ đề nghị → người giao thấy trong Chờ duyệt → chấp thuận đổi hạn', async () => {
    const l = await leader();
    const s = await staff();
    const task = await createTask(l, { dueDate: inDays(2) });
    const oldDue = (await detail(l, task.id)).dueDate;

    assert.equal((await s.post(`/tasks/${task.id}/extensions`, { newDueDate: inDays(1), reason: 'Hạn sớm hơn' })).status, 400);
    const req = await s.post(`/tasks/${task.id}/extensions`, { newDueDate: inDays(7), reason: 'Chờ số liệu từ phòng Đào tạo' });
    assert.equal(req.status, 201);
    assert.equal((await s.post(`/tasks/${task.id}/extensions`, { newDueDate: inDays(8), reason: 'Lần hai' })).status, 400);
    assert.ok(await notified(l, task.id, 'Có đề nghị gia hạn nhiệm vụ chờ đồng chí xem xét'));

    const todo = (await l.get('/tasks/todo')).body.items as { id: number; reason: string }[];
    assert.equal(todo.find((t) => t.id === task.id)?.reason, 'review');
    assert.ok(((await l.get('/tasks?view=review&pageSize=100')).body.items as { id: number }[]).some((t) => t.id === task.id));

    assert.equal((await s.post(`/tasks/extensions/${req.body.id}/decide`, { decision: 'APPROVED' })).status, 403);
    assert.equal((await l.post(`/tasks/extensions/${req.body.id}/decide`, { decision: 'APPROVED', note: 'Đồng ý' })).status, 204);
    assert.equal((await l.post(`/tasks/extensions/${req.body.id}/decide`, { decision: 'REJECTED' })).status, 400);

    const d = await detail(l, task.id);
    assert.equal(new Date(d.dueDate).getTime(), new Date(req.body.newDueDate).getTime());
    assert.equal(d.extensionRequests[0].status, 'APPROVED');
    assert.equal(new Date(d.extensionRequests[0].oldDueDate).getTime(), new Date(oldDue).getTime());
    assert.ok(await notified(s, task.id, 'Nhiệm vụ đã được gia hạn'));
    assert.ok((await activityTypes(l, task.id)).includes('EXTENSION_APPROVED'));
  });

  test('không chấp thuận: hạn giữ nguyên, người đề nghị nhận thông báo', async () => {
    const l = await leader();
    const s = await staff();
    const task = await createTask(l, { dueDate: inDays(2) });
    const due = (await detail(l, task.id)).dueDate;
    const req = await s.post(`/tasks/${task.id}/extensions`, { newDueDate: inDays(9), reason: 'Bận đi công tác' });
    assert.equal((await l.post(`/tasks/extensions/${req.body.id}/decide`, { decision: 'REJECTED', note: 'Cần đúng hạn' })).status, 204);
    assert.equal((await detail(l, task.id)).dueDate, due);
    assert.ok(await notified(s, task.id, 'Đề nghị gia hạn không được chấp thuận'));
  });

  test('người ngoài không xin gia hạn được', async () => {
    const task = await createTask(await leader());
    assert.equal((await (await otherStaff()).post(`/tasks/${task.id}/extensions`, { newDueDate: inDays(9), reason: 'abc' })).status, 404);
  });
});

describe('Sửa, hủy, tệp kèm khi giao, dòng hoạt động', () => {
  test('đổi hạn: ghi hạn cũ, mới; người thực hiện nhận thông báo', async () => {
    const l = await leader();
    const s = await staff();
    const task = await createTask(l, { dueDate: inDays(3) });
    assert.equal((await l.patch(`/tasks/${task.id}`, { dueDate: inDays(6), priority: 'HIGH' })).status, 200);
    const updated = (await detail(l, task.id)).activities.find((a: { type: string }) => a.type === 'UPDATED');
    assert.ok(updated.detail.oldDueDate && updated.detail.newDueDate);
    assert.deepEqual(updated.detail.fields, ['priority']);
    assert.ok(await notified(s, task.id, 'Hạn nhiệm vụ đã thay đổi'));
  });

  test('hủy nhiệm vụ: người thực hiện nhận thông báo', async () => {
    const l = await leader();
    const task = await createTask(l);
    await l.patch(`/tasks/${task.id}`, { status: 'CANCELLED' });
    assert.ok(await notified(await staff(), task.id, 'Nhiệm vụ đã được hủy'));
    assert.ok((await activityTypes(l, task.id)).includes('CANCELLED'));
  });

  test('người giao đính kèm tệp ngay khi giao', async () => {
    const l = await leader();
    const task = await createTask(l);
    const file = await l.upload(`/files?taskId=${task.id}`, 'ke-hoach.pdf', PDF);
    assert.equal(file.status, 201);
    const d = await detail(await staff(), task.id);
    assert.ok(d.attachments.some((a: { id: number }) => a.id === file.body.id));
  });

  test('dòng hoạt động theo thời gian, đủ các bước', async () => {
    const l = await leader();
    const s = await staff();
    const task = await createTask(l);
    await s.post(`/tasks/${task.id}/acknowledge`);
    await s.post(`/tasks/${task.id}/progress`, { progress: 60 });
    const sub = await s.post(`/tasks/${task.id}/submissions`, { content: 'Xong' });
    await l.post(`/submissions/${sub.body.id}/review`, { decision: 'APPROVED' });
    assert.deepEqual(await activityTypes(l, task.id), ['CREATED', 'ACKNOWLEDGED', 'PROGRESS', 'SUBMITTED', 'APPROVED']);
    const rows = await sql('select detail from task_activities where task_id = $1 and type = $2', [task.id, 'PROGRESS']);
    assert.equal(rows[0].detail.progress, 60);
  });
});
