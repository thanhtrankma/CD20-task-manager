// Bộ lọc nâng cao danh sách nhiệm vụ (lộ trình B3): mức ưu tiên, đơn vị nhận, người giao, khoảng hạn, quá hạn,
// tìm theo căn cứ, sắp xếp mới giao.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { closeDb, createTask, head, leader, otherStaff, sql, staff, unitId, userId } from './helpers.mts';

after(closeDb);

const tag = `loc${Date.now()}`;
const ids = (res: { body: { items: { id: number }[] } }) => res.body.items.map((t) => t.id);
let urgentKhoa: number, normalPdt: number, byHead: number, lateOne: number;

before(async () => {
  const l = await leader();
  urgentKhoa = (await createTask(l, { title: `${tag} khẩn khoa`, priority: 'URGENT', dueDate: '2031-03-10T10:00:00Z', assignees: [{ unitId: await unitId('KCNTT') }] })).id;
  normalPdt = (await createTask(l, { title: `${tag} phòng đào tạo`, source: `Kế hoạch số 77/KH-${tag}`, dueDate: '2031-03-20T10:00:00Z', assignees: [{ userId: await userId('canbopdt') }] })).id;
  byHead = (await createTask(await head(), { title: `${tag} chỉ huy giao`, dueDate: '2031-04-05T10:00:00Z' })).id;
  lateOne = (await createTask(l, { title: `${tag} quá hạn` })).id;
  await sql(`update tasks set due_date = now() - interval '3 days' where id = $1`, [lateOne]);
});

const list = async (qs: string) => ids(await (await leader()).get(`/tasks?q=${encodeURIComponent(tag)}&pageSize=100&${qs}`));

describe('Bộ lọc nâng cao', () => {
  test('mức ưu tiên', async () => {
    assert.deepEqual(await list('priority=URGENT'), [urgentKhoa]);
  });

  test('đơn vị nhận gồm đơn vị trực thuộc và cán bộ của đơn vị', async () => {
    const khoa = await list(`unitId=${await unitId('KCNTT')}`);
    assert.ok(khoa.includes(urgentKhoa), 'giao cho khoa');
    assert.ok(khoa.includes(byHead), 'giao cho cán bộ bộ môn thuộc khoa');
    assert.ok(!khoa.includes(normalPdt));
    assert.deepEqual(await list(`unitId=${await unitId('PDT')}`), [normalPdt]);
  });

  test('người giao', async () => {
    assert.deepEqual(await list(`createdById=${await userId('truongkhoa')}`), [byHead]);
  });

  test('khoảng hạn', async () => {
    const r = await list(`dueFrom=${encodeURIComponent('2031-03-01T00:00:00Z')}&dueTo=${encodeURIComponent('2031-03-31T23:59:59Z')}`);
    assert.deepEqual(r.sort(), [urgentKhoa, normalPdt].sort());
  });

  test('quá hạn: chỉ việc đang thực hiện đã qua hạn', async () => {
    assert.deepEqual(await list('overdue=1'), [lateOne]);
  });

  test('tìm theo căn cứ giao (số hiệu văn bản)', async () => {
    const r = ids(await (await leader()).get(`/tasks?q=${encodeURIComponent(`77/KH-${tag}`)}`));
    assert.deepEqual(r, [normalPdt]);
  });

  test('sắp xếp mới giao trước', async () => {
    const r = await list('sort=newest');
    assert.equal(r[0], lateOne, 'tạo sau cùng');
  });

  test('bộ lọc không mở rộng phạm vi xem', async () => {
    const r = ids(await (await otherStaff()).get(`/tasks?q=${encodeURIComponent(tag)}&unitId=${await unitId('KCNTT')}`));
    assert.deepEqual(r, [], 'cán bộ phòng đào tạo không thấy việc của khoa dù lọc theo khoa');
    const s = ids(await (await staff()).get(`/tasks?q=${encodeURIComponent(tag)}&pageSize=100`));
    assert.ok(!s.includes(normalPdt));
  });

  test('giá trị không hợp lệ bị từ chối', async () => {
    const l = await leader();
    assert.equal((await l.get('/tasks?priority=RAT_GAP')).status, 400);
    assert.equal((await l.get('/tasks?unitId=abc')).status, 400);
    assert.equal((await l.get('/tasks?dueFrom=hom-qua')).status, 400);
    assert.equal((await l.get('/tasks?overdue=yes')).status, 400);
    assert.equal((await l.get('/tasks?sort=random')).status, 400);
  });
});
