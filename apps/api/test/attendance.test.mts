import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { admin, closeDb, head, login, otherStaff, request, sql, staff, unitId, userId } from './helpers.mts';

after(closeDb);

// Ca mặc định: ca 1 07:00–11:00, ca 2 13:30–17:30, cho phép 5 phút; ca 3 làm thêm từ 17:30, tính khi từ 30 phút.
// 05/10/2026 là thứ Hai.
const hr = () => login('khoaso');
const at = (day: string, time: string) => `2026-10-${day}T${time}:00+07:00`;
/** Lượt chấm của một mã; lượt trùng thời điểm (ra ca 2, vào ca 3 cùng phút) đánh số như giao diện làm. */
function punches(code: string, rows: [string, string[]][]) {
  const seen = new Map<string, number>();
  return rows.flatMap(([day, times]) =>
    times.map((t) => {
      const seq = seen.get(at(day, t)) ?? 0;
      seen.set(at(day, t), seq + 1);
      return { code, at: at(day, t), seq };
    }),
  );
}

const NV001: [string, string[]][] = [
  ['05', ['06:58', '11:02', '13:25', '17:31', '17:31', '18:45']], // đủ 6 lần, làm thêm đã duyệt 17:30–19:00
  ['06', ['07:20', '11:00', '13:30', '17:30', '17:30', '17:50']], // muộn 20 phút ca 1; làm thêm 20 phút: chưa đủ 30
  ['07', ['07:00', '13:31', '17:35']], // ca 1 thiếu giờ ra (vẫn tính công)
  // 08: vắng cả ngày
  ['09', ['07:00', '10:00', '13:30', '17:30', '17:32', '19:00']], // về sớm 60 phút ca 1; làm thêm chưa đăng ký
  ['10', ['08:00', '11:00']], // thứ Bảy
  ['12', ['13:20', '17:40']], // nghỉ buổi sáng theo đơn
  // 13: ngày lễ
  ['14', ['06:55', '11:05']], // vắng ca 2
  ['15', ['07:00', '11:00']], // nghỉ buổi chiều theo đơn
  ['16', ['16:00']], // vắng ca 1, ca 2 chỉ có giờ ra
];

before(async () => {
  await sql(`update users set hr_manager = true where username = 'khoaso'`);
});

describe('Chấm công theo ca', () => {
  test('nhập lượt chấm, ghép mã, tính công từng ca, làm thêm đã duyệt', async () => {
    const h = await hr();
    const canbo = await userId('canbo');
    assert.equal((await h.patch(`/hr/staff/${canbo}`, { attendanceCode: 'NV001' })).status, 204);
    assert.equal((await h.patch(`/hr/staff/${await userId('canbopdt')}`, { attendanceCode: 'NV001' })).status, 409, 'mã đã gán');

    const s = await staff();
    const types = (await s.get('/hr/catalog')).body.leaveTypes as { id: number; code: string }[];
    const om = types.find((t) => t.code === 'OM')!.id;
    for (const [date, part] of [['2026-10-12', 'MORNING'], ['2026-10-15', 'AFTERNOON']]) {
      const leave = await s.post('/leave', { typeId: om, startDate: date, endDate: date, startPart: part, reason: 'Khám bệnh' });
      assert.equal(leave.status, 201, JSON.stringify(leave.body));
      assert.equal((await (await head()).post(`/leave/${leave.body.id}/decide`, { decision: 'APPROVED' })).status, 204);
    }
    assert.equal((await h.post('/hr/holidays', { date: '2026-10-13', name: 'Nghỉ bù' })).status, 201);
    // Đăng ký làm thêm đã duyệt (ngày đã qua nên ghi thẳng; luồng đăng ký kiểm thử ở overtime.test.mts).
    for (const day of ['05', '06']) {
      await sql(
        `insert into overtime_requests (user_id, date, start_time, end_time, reason, status) values ($1, $2, '17:30', '19:00', 'Chấm thi', 'APPROVED')`,
        [canbo, `2026-10-${day}`],
      );
    }

    const all = [...punches('NV001', NV001), { code: 'NV999', at: at('05', '07:01') }];
    assert.equal((await s.post('/attendance/import', { fileName: 'x.csv', punches: all })).status, 403, 'chỉ phụ trách nhân sự');
    // Tệp lớn gửi nhiều lô: lô sau nối vào lần nhập của lô đầu.
    const first = await h.post('/attendance/import', { fileName: 'attlog.dat', punches: all.slice(0, 10) });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const second = await h.post('/attendance/import', { fileName: 'attlog.dat', importId: first.body.id, punches: all.slice(10) });
    assert.equal(second.body.id, first.body.id);
    assert.equal(second.body.total, all.length);
    assert.equal(second.body.unmatched, 1);
    assert.equal((await s.post('/attendance/import', { fileName: 'x', importId: first.body.id, punches: all })).status, 403);
    const again = await h.post('/attendance/import', { fileName: 'attlog.dat', punches: all });
    assert.equal(again.body.inserted, 0, 'nhập lại không trùng');
    assert.equal(again.body.duplicates, all.length);

    const me = await s.get('/attendance/me?from=2026-10-05&to=2026-10-16');
    assert.equal(me.status, 200, JSON.stringify(me.body));
    const day = (d: string) => me.body.days.find((x: { day: string }) => x.day === `2026-10-${d}`);
    const ca = (d: string, k: number) => day(d).sessions.find((x: { key: number }) => x.key === k);

    assert.equal(day('05').status, 'OK');
    assert.deepEqual([ca('05', 1).in, ca('05', 1).out, ca('05', 2).in, ca('05', 2).out], ['06:58', '11:02', '13:25', '17:31']);
    assert.deepEqual([ca('05', 3).in, ca('05', 3).out], ['17:31', '18:45']);
    assert.equal(day('05').overtime, 74, 'làm thêm 17:31–18:45');
    assert.equal(day('05').work, 1);

    assert.equal(day('06').status, 'LATE');
    assert.equal(ca('06', 1).late, 20);
    assert.equal(day('06').overtimeActual, 20);
    assert.equal(day('06').overtime, 0, 'dưới 30 phút không tính');

    assert.equal(day('07').status, 'MISSING');
    assert.equal(ca('07', 1).status, 'MISSING');
    assert.equal(ca('07', 1).in, '07:00');
    assert.equal(day('07').work, 1, 'thiếu lượt vẫn tính công');

    assert.equal(day('08').status, 'ABSENT');
    assert.equal(day('09').status, 'EARLY');
    assert.equal(ca('09', 1).early, 60);
    assert.equal(day('09').overtimeActual, 88);
    assert.equal(day('09').overtime, 0, 'chưa đăng ký thì không tính');
    assert.equal(day('10').status, 'WEEKEND');
    assert.equal(day('12').status, 'OK', 'nghỉ sáng: chỉ xét ca 2');
    assert.equal(ca('12', 1).status, 'OFF');
    assert.equal(day('12').work, 0.5);
    assert.equal(day('13').status, 'HOLIDAY');
    assert.equal(day('14').status, 'ABSENT_HALF');
    assert.equal(day('14').work, 0.5);
    assert.equal(day('15').status, 'OK', 'nghỉ chiều: chỉ xét ca 1');
    assert.equal(ca('15', 2).status, 'OFF');
    assert.equal(day('16').status, 'ABSENT_HALF');
    assert.deepEqual([ca('16', 2).status, ca('16', 2).out, ca('16', 2).in], ['MISSING', '16:00', undefined]);
    assert.deepEqual(
      { ...me.body.summary },
      {
        scheduled: 9,
        work: 6,
        leave: 1,
        lateCount: 1,
        lateMinutes: 20,
        earlyCount: 1,
        earlyMinutes: 60,
        missing: 2,
        absent: 4,
        overtimeMinutes: 74,
      },
    );

    const unmatched = (await h.get('/attendance/unmatched')).body as { code: string; count: number }[];
    assert.deepEqual(unmatched.map((u) => u.code), ['NV999']);
    const pdt = await userId('canbopdt');
    assert.equal((await h.patch(`/hr/staff/${pdt}`, { attendanceCode: 'NV999' })).status, 204);
    assert.equal((await h.get('/attendance/unmatched')).body.length, 0, 'ghép mã thì lượt chấm cũ được gắn');
    const other = (await h.get(`/attendance/users/${pdt}?from=2026-10-05&to=2026-10-05`)).body;
    assert.equal(other.days[0].in, '07:01');
    assert.ok((await h.get('/attendance/imports')).body.length >= 2);
  });

  test('ca riêng của đơn vị: bộ môn theo ca của khoa', async () => {
    const h = await hr();
    const shift = await h.post('/hr/shifts', {
      name: 'Ca khoa',
      startTime: '07:30',
      breakStart: '11:30',
      breakEnd: '14:00',
      endTime: '17:00',
      graceMinutes: 0,
      workdays: [1, 2, 3, 4, 5],
      overtimeEnabled: false,
    });
    assert.equal(shift.status, 201, JSON.stringify(shift.body));
    const bad = await h.post('/hr/shifts', { ...shift.body, name: 'Sai', breakStart: '06:00', isDefault: undefined, id: undefined });
    assert.equal(bad.status, 400);
    assert.equal((await h.patch(`/hr/units/${await unitId('KCNTT')}/shift`, { workShiftId: shift.body.id })).status, 204);

    const me = (await (await staff()).get('/attendance/me?from=2026-10-06&to=2026-10-06')).body;
    assert.equal(me.shift.name, 'Ca khoa', 'bộ môn kế thừa ca của khoa');
    assert.equal(me.days[0].sessions[0].late, 0, '07:20 trước giờ vào 07:30');
    assert.equal(me.days[0].sessions.length, 2, 'ca không có làm thêm');
    assert.equal(me.days[0].status, 'EARLY', 'ra ca 2 lúc 17:50 tính là lượt ra muộn nhất; ra ca 1 lúc 11:00 sớm 30 phút');

    assert.equal((await h.patch(`/hr/units/${await unitId('KCNTT')}/shift`, { workShiftId: null })).status, 204);
    assert.equal((await (await staff()).get('/attendance/me?from=2026-10-06&to=2026-10-06')).body.shift.name, 'Giờ hành chính');
    assert.equal((await request(`/hr/shifts/${shift.body.id}`, { method: 'DELETE' }, h.cookie)).status, 204);
  });

  test('ghép mã, đối tượng từ tệp; khởi tạo quỹ phép năm mới', async () => {
    const h = await hr();
    const bad = await h.post('/hr/staff/import', {
      rows: [
        { username: 'canbo2x', attendanceCode: 'A1' },
        { username: 'truongkhoa', attendanceCode: 'NV001' },
        { username: 'lanhdao', category: 'Không có' },
      ],
    });
    assert.equal(bad.status, 400);
    assert.deepEqual(
      bad.body.errors.map((e: { row: number }) => e.row),
      [2, 3, 4],
      'lỗi theo từng dòng; mã đã gán cho người khác',
    );
    assert.equal((await sql(`select attendance_code from users where username = 'truongkhoa'`))[0].attendance_code, null, 'có lỗi thì không ghi');

    const ok = await h.post('/hr/staff/import', {
      rows: [
        { username: 'truongkhoa', attendanceCode: 'TK01', category: 'Sĩ quan' },
        { username: 'lanhdao', attendanceCode: 'LD01' },
      ],
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const rows = await sql(`select username, attendance_code, staff_category_id from users where username in ('truongkhoa', 'lanhdao') order by username`);
    assert.deepEqual(rows.map((r) => r.attendance_code), ['LD01', 'TK01']);
    assert.ok(rows[1].staff_category_id);

    const tk = await userId('truongkhoa');
    await h.patch(`/hr/balances/${tk}`, { year: 2030, entitledDays: 12, carriedDays: 0 });
    const r = await h.post('/hr/balances/rollover', { year: 2031, maxCarry: 5 });
    assert.equal(r.status, 200);
    const b = (await sql(`select carried_days from leave_balances where user_id = $1 and year = 2031`, [tk]))[0];
    assert.equal(b.carried_days, 5, 'còn 12 ngày, chuyển tối đa 5');
    assert.equal((await (await staff()).post('/hr/balances/rollover', { year: 2031, maxCarry: 5 })).status, 403);
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
    const row = unit.body.rows.find((r: { user: { id: number } }) => r.user.id === canbo);
    assert.ok(row, 'bộ môn trực thuộc khoa');
    assert.equal(row.summary.overtimeMinutes, 74);
    const pdt = await userId('canbopdt');
    assert.ok(!unit.body.rows.some((r: { user: { id: number } }) => r.user.id === pdt));
    assert.equal((await h.get('/attendance/unit?from=2026-01-01&to=2026-12-31')).status, 400, 'tối đa 62 ngày');
    assert.equal((await h.get(`/attendance/unit?unitId=${await unitId('PDT')}`)).status, 404);
    assert.equal((await sql(`select 1 from audit_logs where action = 'EXPORT_ATTENDANCE'`)).length, 1);
  });
});
