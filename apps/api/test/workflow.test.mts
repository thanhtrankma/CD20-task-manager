import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { closeDb, createTask, head, leader, otherStaff, sql, staff, unitId, userId, waitFor } from './helpers.mts';

after(closeDb);

const PDF = '%PDF-1.4\n% kiem thu\n';

describe('Quy trình giao việc → tiến độ → báo cáo → duyệt', () => {
  test('luồng đầy đủ: duyệt thì nhiệm vụ hoàn thành', async () => {
    const l = await leader();
    const s = await staff();
    const task = await createTask(l);

    assert.equal((await s.post(`/tasks/${task.id}/progress`, { progress: 120 })).status, 400);
    assert.equal((await s.post(`/tasks/${task.id}/progress`, { progress: 50, note: 'Đang làm' })).status, 201);
    let detail = (await l.get(`/tasks/${task.id}`)).body;
    assert.equal(detail.status, 'IN_PROGRESS');
    assert.equal(detail.progress, 50);

    const file = await s.upload(`/files?taskId=${task.id}`, 'báo cáo.pdf', PDF);
    assert.equal(file.status, 201);
    const sub = await s.post(`/tasks/${task.id}/submissions`, { content: 'Đã hoàn thành', attachmentIds: [file.body.id] });
    assert.equal(sub.status, 201);
    assert.equal((await l.get(`/tasks/${task.id}`)).body.status, 'PENDING_REVIEW');

    assert.equal((await s.post(`/submissions/${sub.body.id}/review`, { decision: 'APPROVED' })).status, 403, 'không tự duyệt');
    assert.equal((await l.post(`/submissions/${sub.body.id}/review`, { decision: 'APPROVED' })).status, 204);
    detail = (await l.get(`/tasks/${task.id}`)).body;
    assert.equal(detail.status, 'DONE');
    assert.ok(detail.completedAt);

    const dl = await l.get(`/files/${file.body.id}/download`);
    assert.equal(dl.status, 200);
    assert.equal(dl.body.trim(), PDF.trim());
    assert.equal((await l.patch(`/tasks/${task.id}`, { title: 'Sửa sau khi xong' })).status, 400);
  });

  test('trả lại báo cáo → cán bộ làm tiếp, nộp lại', async () => {
    const l = await leader();
    const s = await staff();
    const task = await createTask(l);
    const sub = await s.post(`/tasks/${task.id}/submissions`, { content: 'Lần 1' });
    assert.equal((await l.post(`/submissions/${sub.body.id}/review`, { decision: 'RETURNED', note: 'Bổ sung số liệu' })).status, 204);
    assert.equal((await l.get(`/tasks/${task.id}`)).body.status, 'RETURNED');
    assert.equal((await s.post(`/tasks/${task.id}/submissions`, { content: 'Lần 2' })).status, 201);
    assert.equal((await l.get(`/tasks/${task.id}`)).body.status, 'PENDING_REVIEW');
  });

  test('người giao hủy nhiệm vụ', async () => {
    const l = await leader();
    const task = await createTask(l);
    assert.equal((await l.patch(`/tasks/${task.id}`, { status: 'CANCELLED' })).status, 200);
    assert.equal((await l.patch(`/tasks/${task.id}`, { status: 'DONE' })).status, 400, 'không tự đặt hoàn thành');
  });

  test('chỉ huy đơn vị nhận việc rồi chia việc con cho cán bộ', async () => {
    const l = await leader();
    const h = await head();
    const parent = await createTask(l, { assignees: [{ unitId: await unitId('KCNTT') }] });
    const child = await createTask(h, { parentId: parent.id, assignees: [{ userId: await userId('canbo') }] });
    const detail = (await l.get(`/tasks/${parent.id}`)).body;
    assert.ok(detail.children.some((c: { id: number }) => c.id === child.id));
    const other = await otherStaff();
    assert.equal(
      (await other.post('/tasks', {
        title: 'Chia việc trái phép',
        dueDate: new Date(Date.now() + 86_400_000).toISOString(),
        parentId: parent.id,
        assignees: [{ userId: await userId('canbopdt') }],
      })).status,
      403,
    );
  });

  test('bình luận hiển thị trong chi tiết nhiệm vụ', async () => {
    const l = await leader();
    const s = await staff();
    const task = await createTask(l);
    assert.equal((await s.post(`/tasks/${task.id}/comments`, { content: 'Xin hướng dẫn thêm' })).status, 201);
    const detail = (await l.get(`/tasks/${task.id}`)).body;
    assert.equal(detail.comments.at(-1).content, 'Xin hướng dẫn thêm');
  });
});

describe('Tệp đính kèm', () => {
  test('tệp giả mạo đuôi .pdf bị từ chối', async () => {
    const task = await createTask(await leader());
    const res = await (await staff()).upload(`/files?taskId=${task.id}`, 'virus.pdf', 'MZ\x90\x00 day la file exe');
    assert.equal(res.status, 400);
  });

  test('tệp lưu bằng tên ngẫu nhiên, có mã băm', async () => {
    const task = await createTask(await leader());
    const res = await (await staff()).upload(`/files?taskId=${task.id}`, '../../etc/passwd.pdf', PDF);
    assert.equal(res.status, 201);
    const row = (await sql('select stored_name, sha256 from attachments where id = $1', [res.body.id]))[0];
    assert.doesNotMatch(row.stored_name, /passwd|\.\./);
    assert.match(row.sha256, /^[0-9a-f]{64}$/);
  });

  test('người ngoài nhiệm vụ không tải được tệp', async () => {
    const task = await createTask(await leader());
    const file = await (await staff()).upload(`/files?taskId=${task.id}`, 'a.pdf', PDF);
    const other = await otherStaff();
    assert.equal((await other.get(`/files/${file.body.id}/download`)).status, 404);
    assert.equal((await other.upload(`/files?taskId=${task.id}`, 'b.pdf', PDF)).status, 404);
  });
});

describe('Thông báo, bảng điều khiển, nhật ký', () => {
  test('người được giao nhận thông báo trong hệ thống, không thấy thông báo của người khác', async () => {
    const task = await createTask(await leader());
    const s = await staff();
    const list = (await s.get('/notifications')).body as { id: number; link: string }[];
    const mine = list.find((n) => n.link === `/tasks/${task.id}`);
    assert.ok(mine);
    const other = await otherStaff();
    await other.post(`/notifications/${mine.id}/read`);
    const still = (await sql('select read_at from notifications where id = $1', [mine.id]))[0];
    assert.equal(still.read_at, null, 'người khác không đánh dấu được thông báo của mình');
  });

  test('bảng điều khiển trả số liệu theo phạm vi', async () => {
    const res = await (await leader()).get('/dashboard/summary');
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.overdue === 'number');
    assert.ok(Array.isArray(res.body.byUnit));
  });

  test('thao tác ghi dữ liệu được ghi nhật ký (không lưu nội dung)', async () => {
    const task = await createTask(await leader());
    const s = await staff();
    await s.post(`/tasks/${task.id}/comments`, { content: 'Nội dung không được vào nhật ký' });
    // Nhật ký ghi chạy nền sau khi trả kết quả.
    const rows = await waitFor(async () => {
      const r = await sql('select user_id, action, detail from audit_logs where entity_id = $1', [String(task.id)]);
      return r.some((x) => x.action.includes('comments')) ? r : undefined;
    });
    assert.ok(rows);
    const row = rows.find((r) => r.action.includes('comments'))!;
    assert.equal(row.user_id, await userId('canbo'));
    assert.doesNotMatch(JSON.stringify(rows), /không được vào nhật ký/);
  });
});
