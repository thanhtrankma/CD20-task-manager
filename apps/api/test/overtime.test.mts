import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { admin, closeDb, head, leader, otherStaff, sql, staff, unitId, userId } from './helpers.mts';

after(closeDb);

/** Ngày làm việc (thứ Hai – thứ Sáu, không phải ngày lễ) thứ n kể từ hôm nay. */
async function workday(n: number) {
  const holidays = new Set((await sql(`select to_char(date, 'YYYY-MM-DD') d from holidays`)).map((r) => r.d));
  const d = new Date();
  for (let left = n; left > 0; ) {
    d.setDate(d.getDate() + 1);
    const s = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    if (d.getDay() % 6 !== 0 && !holidays.has(s)) left--;
  }
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

async function saturday() {
  const d = new Date();
  do d.setDate(d.getDate() + 1);
  while (d.getDay() !== 6);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

const notified = async (username: string, link: string) =>
  (await sql('select 1 from notifications where user_id = $1 and link = $2', [await userId(username), link])).length > 0;

describe('Đăng ký làm thêm giờ', () => {
  test('cán bộ đăng ký, chỉ huy đơn vị duyệt', async () => {
    const s = await staff();
    const h = await head();
    const date = await workday(3);
    assert.equal((await s.post('/overtime', { date, endTime: '17:50', reason: 'Thử' })).status, 400, 'dưới 30 phút');
    assert.equal((await s.post('/overtime', { date, startTime: '16:00', endTime: '19:00', reason: 'Thử' })).status, 400, 'trước giờ ra ca 2');
    assert.equal((await s.post('/overtime', { date: await saturday(), endTime: '19:00', reason: 'Thử' })).status, 400, 'ngày nghỉ');

    const res = await s.post('/overtime', { date, endTime: '19:30', reason: 'Coi thi kết thúc học phần' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.startTime, '17:30', 'mặc định từ giờ ra ca 2');
    assert.equal(res.body.status, 'PENDING');
    assert.equal(res.body.approverUnitId, await unitId('KCNTT'));
    assert.equal((await s.post('/overtime', { date, endTime: '20:00', reason: 'Lặp' })).status, 400, 'mỗi ngày một đăng ký');
    assert.ok(await notified('truongkhoa', '/overtime?scope=approve'));

    assert.equal((await s.post(`/overtime/${res.body.id}/decide`, { decision: 'APPROVED' })).status, 403, 'không tự duyệt');
    assert.equal((await (await otherStaff()).post(`/overtime/${res.body.id}/decide`, { decision: 'APPROVED' })).status, 404);
    assert.equal((await h.get('/overtime/pending-count')).body.count >= 1, true);
    const pending = (await h.get('/overtime?scope=approve')).body.items as { id: number; permissions: { decide: boolean } }[];
    assert.ok(pending.find((r) => r.id === res.body.id)?.permissions.decide);
    assert.equal((await h.post(`/overtime/${res.body.id}/decide`, { decision: 'APPROVED' })).status, 204);
    assert.ok(await notified('canbo', '/overtime'));
    const mine = (await s.get('/overtime')).body.items.find((r: { id: number }) => r.id === res.body.id);
    assert.equal(mine.status, 'APPROVED');
    assert.equal(mine.decidedBy.fullName, 'Trần Văn Khoa');
    assert.equal(mine.permissions.cancel, true, 'chưa tới ngày thì rút được');
  });

  test('từ chối cần lý do; rút đăng ký; chỉ huy đăng ký thì lãnh đạo duyệt', async () => {
    const s = await staff();
    const h = await head();
    const date = await workday(4);
    const a = await s.post('/overtime', { date, endTime: '19:00', reason: 'Trực' });
    assert.equal((await h.post(`/overtime/${a.body.id}/decide`, { decision: 'REJECTED' })).status, 400);
    assert.equal((await h.post(`/overtime/${a.body.id}/decide`, { decision: 'REJECTED', note: 'Không cần thiết' })).status, 204);

    const b = await s.post('/overtime', { date, endTime: '19:00', reason: 'Trực lại' });
    assert.equal(b.status, 201, 'đơn bị từ chối không chặn đăng ký mới');
    assert.equal((await h.post(`/overtime/${b.body.id}/cancel`)).status, 403);
    assert.equal((await s.post(`/overtime/${b.body.id}/cancel`)).status, 204);
    assert.equal((await sql('select status from overtime_requests where id = $1', [b.body.id]))[0].status, 'CANCELLED');

    const mine = await h.post('/overtime', { date, endTime: '20:00', reason: 'Họp khoa' });
    assert.equal(mine.body.approverUnitId, null);
    assert.equal((await h.post(`/overtime/${mine.body.id}/decide`, { decision: 'APPROVED' })).status, 403);
    const l = await leader();
    assert.ok((await l.get('/overtime?scope=approve')).body.items.some((r: { id: number }) => r.id === mine.body.id));
    assert.equal((await l.post('/overtime/approve-batch', { ids: [mine.body.id] })).body.approved, 1);
    assert.equal((await (await admin()).get('/overtime')).status, 403);
  });
});
