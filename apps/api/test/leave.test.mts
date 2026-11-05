import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { admin, closeDb, head, leader, login, otherStaff, sql, staff, unitId, userId } from './helpers.mts';

after(closeDb);

// Dùng năm 2027: 01/03/2027 là thứ Hai. Ngày lễ dương lịch 2027 có sẵn từ seed.
let PHEP_NAM: number;
let OM: number;
const hr = () => login('khoaso');

before(async () => {
  await sql(`update users set hr_manager = true where username = 'khoaso'`);
  const types = (await (await staff()).get('/hr/catalog')).body.leaveTypes as { id: number; code: string }[];
  PHEP_NAM = types.find((t) => t.code === 'PHEP_NAM')!.id;
  OM = types.find((t) => t.code === 'OM')!.id;
});

const notified = async (username: string, id: number) =>
  (await sql('select 1 from notifications where user_id = $1 and link = $2', [await userId(username), `/leave/${id}`])).length > 0;

describe('Nghỉ phép', () => {
  test('đơn ngắn: chỉ huy đơn vị duyệt là xong, trừ quỹ phép', async () => {
    const s = await staff();
    const h = await head();
    const before = (await s.get('/leave/balance?year=2027')).body;

    const res = await s.post('/leave', { typeId: PHEP_NAM, startDate: '2027-03-01', endDate: '2027-03-02', reason: 'Việc gia đình' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, 'PENDING_UNIT');
    assert.equal(res.body.days, 2);
    assert.equal(res.body.approverUnitId, await unitId('KCNTT'), 'bộ môn không có chỉ huy: lên khoa');
    assert.equal(res.body.needsLeader, false);
    assert.ok(await notified('truongkhoa', res.body.id));
    assert.equal((await s.get('/leave/balance?year=2027')).body.pending, before.pending + 2);

    assert.equal((await s.post(`/leave/${res.body.id}/decide`, { decision: 'APPROVED' })).status, 403, 'không tự duyệt');
    assert.equal((await (await otherStaff()).get(`/leave/${res.body.id}`)).status, 404, 'khác đơn vị không thấy');
    assert.equal((await (await admin()).get('/leave')).status, 403);
    assert.equal((await h.get('/leave/pending-count')).body.count >= 1, true);

    assert.equal((await h.post(`/leave/${res.body.id}/decide`, { decision: 'APPROVED' })).status, 204);
    const detail = (await s.get(`/leave/${res.body.id}`)).body;
    assert.equal(detail.status, 'APPROVED');
    assert.equal(detail.unitDecidedBy.id, await userId('truongkhoa'));
    assert.ok(await notified('canbo', res.body.id));
    const after = (await s.get('/leave/balance?year=2027')).body;
    assert.equal(after.used, before.used + 2);
    assert.equal(after.pending, before.pending);
    assert.equal((await h.post(`/leave/${res.body.id}/decide`, { decision: 'APPROVED' })).status, 400, 'đã xử lý');
  });

  test('đơn dài quá ngưỡng: chỉ huy đơn vị rồi lãnh đạo duyệt', async () => {
    const s = await staff();
    const h = await head();
    const l = await leader();
    const res = await s.post('/leave', { typeId: PHEP_NAM, startDate: '2027-03-08', endDate: '2027-03-12', reason: 'Về quê' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.days, 5);
    assert.equal(res.body.needsLeader, true);
    assert.equal((await l.post(`/leave/${res.body.id}/decide`, { decision: 'APPROVED' })).status, 204, 'lãnh đạo duyệt thay được');
    assert.equal((await s.get(`/leave/${res.body.id}`)).body.status, 'APPROVED');

    const res2 = await s.post('/leave', { typeId: OM, startDate: '2027-03-22', endDate: '2027-03-26', reason: 'Điều trị' });
    assert.equal((await h.post(`/leave/${res2.body.id}/decide`, { decision: 'APPROVED' })).status, 204);
    assert.equal((await s.get(`/leave/${res2.body.id}`)).body.status, 'PENDING_LEADER');
    assert.ok(await notified('lanhdao', res2.body.id));
    assert.equal((await h.post(`/leave/${res2.body.id}/decide`, { decision: 'APPROVED' })).status, 403, 'bước lãnh đạo');
    const pending = (await l.get('/leave?scope=approve')).body.items.map((r: { id: number }) => r.id);
    assert.ok(pending.includes(res2.body.id));
    assert.equal((await l.post(`/leave/${res2.body.id}/decide`, { decision: 'APPROVED' })).status, 204);
    const done = (await s.get(`/leave/${res2.body.id}`)).body;
    assert.equal(done.status, 'APPROVED');
    assert.equal(done.leaderDecidedBy.id, await userId('lanhdao'));
  });

  test('đếm ngày: bỏ cuối tuần, ngày lễ; nửa ngày tính 0,5; trùng ngày bị chặn', async () => {
    const s = await staff();
    // 29/4 (thứ Năm, từ chiều) → 3/5 (thứ Hai, hết sáng); 30/4, 1/5 là ngày lễ, 2/5 Chủ nhật.
    const res = await s.post('/leave', {
      typeId: OM,
      startDate: '2027-04-29',
      endDate: '2027-05-03',
      startPart: 'AFTERNOON',
      endPart: 'MORNING',
      reason: 'Khám bệnh',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.days, 1);

    const bad = await s.post('/leave', { typeId: OM, startDate: '2027-04-26', endDate: '2027-04-28', startPart: 'MORNING', reason: 'Thử' });
    assert.equal(bad.status, 400, 'đơn nhiều ngày không bắt đầu buổi sáng');
    const weekend = await s.post('/leave', { typeId: OM, startDate: '2027-03-06', endDate: '2027-03-07', reason: 'Thử' });
    assert.equal(weekend.status, 400, 'không có ngày làm việc');
    const overlap = await s.post('/leave', { typeId: OM, startDate: '2027-03-02', endDate: '2027-03-03', reason: 'Thử' });
    assert.equal(overlap.status, 400);
    assert.match(overlap.body.message, /Trùng ngày 02\/03/);

    const am = await s.post('/leave', { typeId: OM, startDate: '2027-03-15', endDate: '2027-03-15', startPart: 'MORNING', reason: 'Sáng' });
    const pm = await s.post('/leave', { typeId: OM, startDate: '2027-03-15', endDate: '2027-03-15', startPart: 'AFTERNOON', reason: 'Chiều' });
    assert.equal(am.status, 201);
    assert.equal(pm.status, 201, 'sáng, chiều cùng ngày là hai đơn được');
    assert.equal(am.body.days, 0.5);
    const again = await s.post('/leave', { typeId: OM, startDate: '2027-03-15', endDate: '2027-03-15', startPart: 'MORNING', reason: 'Lặp' });
    assert.equal(again.status, 400);
  });

  test('từ chối cần lý do; rút đơn; hủy đơn đã duyệt hoàn lại ngày phép', async () => {
    const s = await staff();
    const h = await head();
    const a = await s.post('/leave', { typeId: PHEP_NAM, startDate: '2027-06-07', endDate: '2027-06-07', reason: 'Việc riêng' });
    assert.equal((await h.post(`/leave/${a.body.id}/decide`, { decision: 'REJECTED' })).status, 400);
    assert.equal((await h.post(`/leave/${a.body.id}/decide`, { decision: 'REJECTED', note: 'Trùng lịch thi' })).status, 204);
    const rejected = (await s.get(`/leave/${a.body.id}`)).body;
    assert.equal(rejected.status, 'REJECTED');
    assert.equal(rejected.decisionNote, 'Trùng lịch thi');

    const b = await s.post('/leave', { typeId: PHEP_NAM, startDate: '2027-06-08', endDate: '2027-06-08', reason: 'Việc riêng' });
    assert.equal((await h.post(`/leave/${b.body.id}/cancel`)).status, 403);
    assert.equal((await s.post(`/leave/${b.body.id}/cancel`)).status, 204);
    assert.equal((await s.post(`/leave/${b.body.id}/cancel`)).status, 400);

    const c = await s.post('/leave', { typeId: PHEP_NAM, startDate: '2027-06-09', endDate: '2027-06-09', reason: 'Việc riêng' });
    await h.post(`/leave/${c.body.id}/decide`, { decision: 'APPROVED' });
    const used = (await s.get('/leave/balance?year=2027')).body.used;
    assert.equal((await s.post(`/leave/${c.body.id}/revoke`, { note: 'Đi làm lại' })).status, 403, 'người gửi không tự hủy duyệt');
    assert.equal((await h.post(`/leave/${c.body.id}/revoke`, { note: 'Đi làm lại sớm' })).status, 204);
    assert.equal((await s.get(`/leave/${c.body.id}`)).body.status, 'REVOKED');
    assert.equal((await s.get('/leave/balance?year=2027')).body.used, used - 1);
  });

  test('chỉ huy đơn vị cấp nhà trường và cán bộ đơn vị không có chỉ huy: lãnh đạo duyệt', async () => {
    const h = await head();
    const mine = await h.post('/leave', { typeId: OM, startDate: '2027-07-05', endDate: '2027-07-05', reason: 'Khám sức khỏe' });
    assert.equal(mine.status, 201);
    assert.equal(mine.body.status, 'PENDING_LEADER');
    assert.equal(mine.body.approverUnitId, null);
    assert.equal((await h.post(`/leave/${mine.body.id}/decide`, { decision: 'APPROVED' })).status, 403);

    const o = await otherStaff();
    const pdt = await o.post('/leave', { typeId: OM, startDate: '2027-07-05', endDate: '2027-07-05', reason: 'Khám sức khỏe' });
    assert.equal(pdt.body.status, 'PENDING_LEADER', 'Phòng Đào tạo chưa có chỉ huy');
    assert.equal((await h.get(`/leave/${pdt.body.id}`)).status, 404);
    assert.equal((await (await leader()).get(`/leave/${pdt.body.id}`)).status, 200);
  });

  test('quỹ phép: phụ trách nhân sự khai báo; không đủ phép thì không gửi được đơn phép năm', async () => {
    const h = await hr();
    const o = await otherStaff();
    const target = await userId('canbopdt');
    assert.equal((await o.patch(`/hr/balances/${target}`, { year: 2027, entitledDays: 1, carriedDays: 0 })).status, 403);
    const set = await h.patch(`/hr/balances/${target}`, { year: 2027, entitledDays: 1, carriedDays: 0.5, note: 'Mới tuyển' });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal(set.body.entitled, 1);
    assert.equal(set.body.source, 'custom');

    const res = await o.post('/leave', { typeId: PHEP_NAM, startDate: '2027-08-02', endDate: '2027-08-03', reason: 'Nghỉ phép' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /còn 1.5 ngày/);
    const ok = await o.post('/leave', { typeId: OM, startDate: '2027-08-02', endDate: '2027-08-03', reason: 'Nghỉ ốm' });
    assert.equal(ok.status, 201, 'loại không trừ quỹ vẫn gửi được');

    assert.equal((await o.get(`/leave/balance?userId=${await userId('canbo')}`)).status, 404);
    assert.equal((await (await head()).get(`/leave/balance?userId=${await userId('canbo')}`)).status, 200);
  });

  test('danh mục: ai cũng xem, phụ trách nhân sự mới sửa; quản trị không vào', async () => {
    const s = await staff();
    const h = await hr();
    assert.equal((await s.get('/hr/catalog')).status, 200);
    assert.equal((await (await admin()).get('/hr/catalog')).status, 403);
    assert.equal((await s.post('/hr/holidays', { date: '2027-02-06', name: 'Tết Nguyên đán' })).status, 403);
    assert.equal((await s.get('/hr/staff')).status, 403);
    const hol = await h.post('/hr/holidays', { date: '2027-02-06', name: 'Tết Nguyên đán' });
    assert.equal(hol.status, 201);
    assert.equal((await h.post('/hr/holidays', { date: '2027-02-06', name: 'Trùng' })).status, 409);
    assert.ok((await s.get('/hr/holidays?year=2027')).body.some((d: { date: string }) => d.date === '2027-02-06'));
    const staffList = (await h.get('/hr/staff?year=2027')).body as { username: string }[];
    assert.ok(staffList.some((u) => u.username === 'canbo'));
    assert.ok(!staffList.some((u) => u.username === 'admin'));
    assert.equal((await h.patch('/hr/settings', { leaveEscalateDays: 3 })).status, 200);
  });
});
