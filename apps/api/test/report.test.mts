// Thống kê 4 nhóm (lộ trình B16). Dùng kỳ riêng năm 2025 để không lẫn nhiệm vụ của các file kiểm thử khác.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { closeDb, createTask, head, leader, otherStaff, sql, staff, unitId, userId } from './helpers.mts';

after(closeDb);

const FROM = '2025-01-01T00:00:00.000Z';
const TO = '2025-02-28T23:59:59.000Z';
const q = (from = FROM, to = TO) => `/dashboard/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

/** Đưa nhiệm vụ về quá khứ với trạng thái, thời điểm hoàn thành cho trước. */
async function setPast(id: number, due: string, status: string, completedAt: string | null = null) {
  await sql('update tasks set due_date = $2, status = $3, completed_at = $4 where id = $1', [id, due, status, completedAt]);
}

before(async () => {
  const l = await leader();
  const [a, b, c, d, e] = await Promise.all([
    createTask(l),
    createTask(l),
    createTask(l),
    createTask(l, { assignees: [{ unitId: await unitId('KCNTT') }] }),
    createTask(l),
  ]);
  await setPast(a.id, '2025-01-10T10:00:00Z', 'DONE', '2025-01-09T10:00:00Z'); // xong đúng hạn
  await setPast(b.id, '2025-01-15T10:00:00Z', 'DONE', '2025-01-20T10:00:00Z'); // xong trễ
  await setPast(c.id, '2025-02-05T10:00:00Z', 'IN_PROGRESS'); // đang làm, quá hạn
  await setPast(d.id, '2025-02-10T10:00:00Z', 'NEW'); // giao cho khoa, quá hạn
  await setPast(e.id, '2025-02-11T10:00:00Z', 'CANCELLED'); // đã hủy: không tính
});

describe('Thống kê kết quả thực hiện nhiệm vụ', () => {
  test('tổng 4 nhóm và tỷ lệ đúng hạn', async () => {
    const r = (await (await leader()).get(q())).body;
    assert.deepEqual(r.totals, {
      total: 4,
      doneOnTime: 1,
      doneLate: 1,
      inProgressOnTime: 0,
      inProgressLate: 2,
      onTimeRate: 25,
    });
  });

  test('theo đơn vị chủ trì, cá nhân chủ trì, tháng', async () => {
    const r = (await (await leader()).get(q())).body;
    const unit = (code: string) => r.byUnit.find((u: { name: string }) => u.name === code);
    assert.equal(unit('Bộ môn Mạng máy tính').total, 3);
    assert.equal(unit('Khoa Công nghệ thông tin').total, 1);
    const person = r.byPerson.find((p: { fullName: string }) => p.fullName === 'Lê Thị Cán Bộ');
    assert.equal(person.total, 3);
    assert.equal(person.unitName, 'Bộ môn Mạng máy tính');
    assert.ok(person.active >= 1, 'khối lượng đang thực hiện');
    assert.deepEqual(
      r.byMonth.map((m: { month: string; total: number }) => [m.month, m.total]),
      [
        ['2025-01', 2],
        ['2025-02', 2],
      ],
    );
  });

  test('việc còn hạn tính vào "đang thực hiện trong hạn"', async () => {
    const t = await createTask(await leader());
    await setPast(t.id, '2030-06-15T10:00:00Z', 'IN_PROGRESS');
    const r = (await (await leader()).get(q('2030-06-01T00:00:00Z', '2030-06-30T23:59:59Z'))).body;
    assert.equal(r.totals.inProgressOnTime, 1);
    assert.equal(r.totals.onTimeRate, null, 'chưa có việc nào đến hạn thì chưa tính tỷ lệ');
  });

  test('phạm vi: chỉ huy khoa thấy việc của khoa; cán bộ không xem thống kê', async () => {
    const r = (await (await head()).get(q())).body;
    assert.equal(r.totals.total, 4, 'các việc đều giao cho khoa hoặc cán bộ trong khoa');
    assert.equal((await (await staff()).get(q())).status, 403);
    assert.equal((await (await otherStaff()).get(q())).status, 403);
  });

  test('kỳ không hợp lệ bị từ chối', async () => {
    const l = await leader();
    assert.equal((await l.get(q(TO, FROM))).status, 400);
    assert.equal((await l.get(q('2024-01-01T00:00:00Z', '2025-12-31T00:00:00Z'))).status, 400);
    assert.equal((await l.get('/dashboard/report?from=abc&to=xyz')).status, 400);
  });
});

describe('Ghi nhật ký khi xuất Excel', () => {
  test('xuất thống kê, xuất danh sách nhiệm vụ được ghi lại (ai, bộ lọc)', async () => {
    const l = await leader();
    assert.equal((await l.get(`${q()}&export=1`)).status, 200);
    assert.equal((await l.get('/tasks?view=created&page=1&pageSize=100&export=1')).status, 200);
    assert.equal((await l.get('/tasks?view=created&page=2&pageSize=100&export=1')).status, 200);
    const id = await userId('lanhdao');
    const rows = await sql(`select action, detail from audit_logs where user_id = $1 and action like 'EXPORT_%' order by id`, [id]);
    assert.deepEqual(rows.map((r) => r.action), ['EXPORT_REPORT', 'EXPORT_TASKS'], 'mỗi lượt xuất chỉ ghi một dòng');
    assert.equal(rows[1].detail.view, 'created');
    assert.equal((await l.get('/tasks?export=yes')).status, 400);
  });
});
