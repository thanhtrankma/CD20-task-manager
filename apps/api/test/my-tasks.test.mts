// Màn hình "Việc của tôi": mục Cần xử lý (nhóm theo lý do), Được giao, Đã giao, Chờ duyệt, số đếm.
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { admin, closeDb, createTask, head, leader, otherStaff, sql, staff, unitId } from './helpers.mts';

after(closeDb);

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
type TodoItem = { id: number; reason: string };
const todoOf = async (s: Awaited<ReturnType<typeof staff>>) => (await s.get<{ items: TodoItem[] }>('/tasks/todo')).body.items;
const reasonOf = (items: TodoItem[], id: number) => items.find((t) => t.id === id)?.reason;
const ids = (res: { body: { items: { id: number }[] } }) => res.body.items.map((t) => t.id);

describe('Mục Cần xử lý', () => {
  test('phân loại: quá hạn, sắp đến hạn, mới giao, bị trả lại; việc đang làm còn xa hạn không hiện', async () => {
    const l = await leader();
    const s = await staff();
    const overdue = await createTask(l, { dueDate: inDays(1) });
    await sql(`update tasks set due_date = now() - interval '1 day' where id = $1`, [overdue.id]);
    const soon = await createTask(l, { dueDate: inDays(2) });
    const fresh = await createTask(l, { dueDate: inDays(10) });
    const working = await createTask(l, { dueDate: inDays(10) });
    await s.post(`/tasks/${working.id}/progress`, { progress: 30 });
    const returned = await createTask(l, { dueDate: inDays(10) });
    const sub = await s.post(`/tasks/${returned.id}/submissions`, { content: 'Lần 1' });
    await l.post(`/submissions/${sub.body.id}/review`, { decision: 'RETURNED', note: 'Bổ sung' });

    const items = await todoOf(s);
    assert.equal(reasonOf(items, overdue.id), 'overdue');
    assert.equal(reasonOf(items, soon.id), 'soon');
    assert.equal(reasonOf(items, fresh.id), 'new');
    assert.equal(reasonOf(items, returned.id), 'returned');
    assert.equal(reasonOf(items, working.id), undefined, 'đang làm, còn 10 ngày: chưa cần xử lý');

    // Thứ tự: quá hạn trước, mới giao sau cùng.
    const order = ['overdue', 'today', 'review', 'returned', 'soon', 'new'];
    const ranks = items.map((t) => order.indexOf(t.reason));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  });

  test('việc đã nộp chờ duyệt, đã xong, đã hủy không nằm trong mục của người thực hiện', async () => {
    const l = await leader();
    const s = await staff();
    const pending = await createTask(l, { dueDate: inDays(1) });
    await s.post(`/tasks/${pending.id}/submissions`, { content: 'Xong' });
    const cancelled = await createTask(l, { dueDate: inDays(1) });
    await l.patch(`/tasks/${cancelled.id}`, { status: 'CANCELLED' });
    const items = await todoOf(s);
    assert.equal(reasonOf(items, pending.id), undefined);
    assert.equal(reasonOf(items, cancelled.id), undefined);
  });

  test('người giao thấy báo cáo chờ mình duyệt; lãnh đạo khác giao thì không hiện', async () => {
    const l = await leader();
    const s = await staff();
    const task = await createTask(l, { dueDate: inDays(10) });
    await s.post(`/tasks/${task.id}/submissions`, { content: 'Xong' });
    assert.equal(reasonOf(await todoOf(l), task.id), 'review');
    assert.ok(ids(await l.get('/tasks?view=review')).includes(task.id));

    const h = await head();
    const byHead = await createTask(h, { dueDate: inDays(10) });
    await s.post(`/tasks/${byHead.id}/submissions`, { content: 'Xong' });
    assert.equal(reasonOf(await todoOf(l), byHead.id), undefined, 'không phải việc lãnh đạo giao');
    assert.equal(reasonOf(await todoOf(h), byHead.id), 'review');
  });

  test('chỉ huy đơn vị thấy việc giao cho đơn vị mình cần phân tiếp', async () => {
    const task = await createTask(await leader(), { dueDate: inDays(10), assignees: [{ unitId: await unitId('KCNTT') }] });
    assert.equal(reasonOf(await todoOf(await head()), task.id), 'new');
    assert.equal(reasonOf(await todoOf(await staff()), task.id), undefined, 'cán bộ chưa được phân thì chưa hiện');
  });

  test('không lẫn việc của người khác', async () => {
    const task = await createTask(await leader(), { dueDate: inDays(1) });
    assert.equal(reasonOf(await todoOf(await otherStaff()), task.id), undefined);
  });

  test('số đếm trên menu khớp với danh sách', async () => {
    const s = await staff();
    const counts = (await s.get('/tasks/counts')).body;
    assert.equal(counts.todo, (await todoOf(s)).length);
    assert.equal(counts.review, 0);
    const l = await leader();
    const lc = (await l.get('/tasks/counts')).body;
    assert.equal(lc.review, (await l.get('/tasks?view=review&pageSize=100')).body.total);
  });
});

describe('Các mục khác', () => {
  test('Được giao: việc giao trực tiếp và việc giao cho đơn vị mình chỉ huy', async () => {
    const l = await leader();
    const direct = await createTask(l);
    const toUnit = await createTask(l, { assignees: [{ unitId: await unitId('KCNTT') }] });
    const staffIds = ids(await (await staff()).get('/tasks?view=assigned&pageSize=100'));
    assert.ok(staffIds.includes(direct.id));
    assert.ok(!staffIds.includes(toUnit.id));
    const headIds = ids(await (await head()).get('/tasks?view=assigned&pageSize=100'));
    assert.ok(headIds.includes(toUnit.id));
  });

  test('Đã giao: chỉ việc mình giao', async () => {
    const h = await head();
    const mine = await createTask(h);
    const byLeader = await createTask(await leader());
    const list = ids(await h.get('/tasks?view=created&pageSize=100'));
    assert.ok(list.includes(mine.id));
    assert.ok(!list.includes(byLeader.id));
  });

  test('mục không hợp lệ bị từ chối; quản trị không dùng được', async () => {
    assert.equal((await (await staff()).get('/tasks?view=all')).status, 400);
    assert.equal((await (await admin()).get('/tasks/todo')).status, 403);
    assert.equal((await (await admin()).get('/tasks/counts')).status, 403);
  });
});
