import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { admin, closeDb, head, login, otherStaff, sql, staff, userId } from './helpers.mts';

after(closeDb);

// Ca mặc định 07:30–16:30, cho phép 5 phút, nghỉ trưa 11:30–13:30. 05/10/2026 là thứ Hai.
const hr = () => login('khoaso');
const at = (day: string, time: string) => `2026-10-${day}T${time}:00+07:00`;
const PUNCHES = [
  ['05', '07:25'], ['05', '16:35'], // đủ công
  ['06', '07:50'], ['06', '16:40'], // muộn 20 phút
  ['07', '07:28'], // thiếu giờ ra
  // 08: vắng
  ['09', '07:30'], ['09', '15:00'], // về sớm 90 phút
  ['10', '08:00'], ['10', '11:00'], // thứ Bảy
  ['12', '13:20'], ['12', '16:40'], // nghỉ buổi sáng theo đơn
].map(([d, t]) => ({ code: 'NV001', at: at(d, t) }));

before(async () => {
  await sql(`update users set hr_manager = true where username = 'khoaso'`);
});

describe('Chấm công', () => {
  test('nhập lượt chấm, ghép mã, tính công từng ngày', async () => {
    const h = await hr();
    const canbo = await userId('canbo');
    assert.equal((await h.patch(`/hr/staff/${canbo}`, { attendanceCode: 'NV001' })).status, 204);
    assert.equal((await h.patch(`/hr/staff/${await userId('canbopdt')}`, { attendanceCode: 'NV001' })).status, 409, 'mã đã gán');

    const s = await staff();
    const types = (await s.get('/hr/catalog')).body.leaveTypes as { id: number; code: string }[];
    const leave = await s.post('/leave', {
      typeId: types.find((t) => t.code === 'OM')!.id,
      startDate: '2026-10-12',
      endDate: '2026-10-12',
      startPart: 'MORNING',
      reason: 'Khám bệnh',
    });
    assert.equal((await (await head()).post(`/leave/${leave.body.id}/decide`, { decision: 'APPROVED' })).status, 204);
    assert.equal((await h.post('/hr/holidays', { date: '2026-10-13', name: 'Nghỉ bù' })).status, 201);

    const punches = [...PUNCHES, { code: 'NV999', at: at('05', '07:31') }];
    assert.equal((await s.post('/attendance/import', { fileName: 'x.csv', punches })).status, 403, 'chỉ phụ trách nhân sự');
    const first = await h.post('/attendance/import', { fileName: 'attlog.dat', punches });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.inserted, punches.length);
    assert.equal(first.body.unmatched, 1);
    const again = await h.post('/attendance/import', { fileName: 'attlog.dat', punches });
    assert.equal(again.body.inserted, 0, 'nhập lại không trùng');
    assert.equal(again.body.duplicates, punches.length);

    const me = await s.get('/attendance/me?from=2026-10-05&to=2026-10-13');
    assert.equal(me.status, 200, JSON.stringify(me.body));
    const day = (d: string) => me.body.days.find((x: { day: string }) => x.day === `2026-10-${d}`);
    assert.equal(day('05').status, 'OK');
    assert.equal(day('05').in, '07:25');
    assert.equal(day('06').status, 'LATE');
    assert.equal(day('06').late, 20);
    assert.equal(day('07').status, 'MISSING');
    assert.equal(day('08').status, 'ABSENT');
    assert.equal(day('09').status, 'EARLY');
    assert.equal(day('09').early, 90);
    assert.equal(day('10').status, 'WEEKEND');
    assert.equal(day('11').status, 'WEEKEND');
    assert.equal(day('12').status, 'OK', 'nghỉ buổi sáng: vào trước 13:30 là đúng giờ');
    assert.equal(day('12').work, 0.5);
    assert.equal(day('12').leave.part, 'MORNING');
    assert.equal(day('13').status, 'HOLIDAY');
    assert.deepEqual(
      { ...me.body.summary },
      { scheduled: 6, work: 3.5, leave: 0.5, lateCount: 1, lateMinutes: 20, earlyCount: 1, earlyMinutes: 90, missing: 1, absent: 1 },
    );

    const unmatched = (await h.get('/attendance/unmatched')).body as { code: string; count: number }[];
    assert.deepEqual(unmatched.map((u) => u.code), ['NV999']);
    const pdt = await userId('canbopdt');
    assert.equal((await h.patch(`/hr/staff/${pdt}`, { attendanceCode: 'NV999' })).status, 204);
    assert.equal((await h.get('/attendance/unmatched')).body.length, 0, 'ghép mã thì lượt chấm cũ được gắn');
    const other = (await h.get(`/attendance/users/${pdt}?from=2026-10-05&to=2026-10-05`)).body;
    assert.equal(other.days[0].in, '07:31');
    assert.ok((await h.get('/attendance/imports')).body.length >= 2);
  });

  test('phạm vi xem: của mình; chỉ huy xem đơn vị; quản trị không xem', async () => {
    const s = await staff();
    const h = await head();
    const canbo = await userId('canbo');
    assert.equal((await s.get(`/attendance/users/${await userId('canbopdt')}`)).status, 404);
    assert.equal((await s.get('/attendance/unit')).status, 403);
    assert.equal((await (await otherStaff()).get(`/attendance/users/${canbo}`)).status, 404);
    assert.equal((await h.get(`/attendance/users/${canbo}?from=2026-10-05&to=2026-10-09`)).status, 200);
    assert.equal((await (await admin()).get('/attendance/me')).status, 403);

    const unit = await h.get('/attendance/unit?from=2026-10-01&to=2026-10-31&export=1');
    assert.equal(unit.status, 200, JSON.stringify(unit.body));
    assert.equal(unit.body.days.length, 31);
    const names = unit.body.rows.map((r: { user: { id: number } }) => r.user.id);
    assert.ok(names.includes(canbo), 'bộ môn trực thuộc khoa');
    assert.ok(!names.includes(await userId('canbopdt')));
    assert.equal((await h.get('/attendance/unit?from=2026-01-01&to=2026-12-31')).status, 400, 'tối đa 62 ngày');
    const pdtUnit = (await sql(`select id from units where code = 'PDT'`))[0].id;
    assert.equal((await h.get(`/attendance/unit?unitId=${pdtUnit}`)).status, 404);
    const audit = await sql(`select 1 from audit_logs where action = 'EXPORT_ATTENDANCE'`);
    assert.equal(audit.length, 1);
  });
});
