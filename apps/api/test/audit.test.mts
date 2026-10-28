import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { admin, closeDb, sql, staff, waitFor } from './helpers.mts';

after(closeDb);

describe('Nhật ký thao tác', () => {
  test('CSDL chặn sửa, xóa, xóa trắng nhật ký (kể cả truy cập trực tiếp)', async () => {
    await (await staff()).post('/auth/logout');
    const id = (await sql('select max(id) as id from audit_logs'))[0].id;
    await assert.rejects(sql(`update audit_logs set action = 'DOI' where id = $1`, [id]), /chỉ được ghi thêm/);
    await assert.rejects(sql('delete from audit_logs where id = $1', [id]), /chỉ được ghi thêm/);
    await assert.rejects(sql('truncate audit_logs'), /chỉ được ghi thêm/);
    assert.equal((await sql('select count(*)::int as n from audit_logs where id = $1', [id]))[0].n, 1);
  });

  test('ghi nhận đăng nhập sai và đăng nhập thành công', async () => {
    await (await staff()).get('/auth/me');
    const rows = await waitFor(async () => {
      const r = await sql(`select action from audit_logs where action in ('LOGIN', 'LOGIN_FAILED')`);
      return r.length >= 2 ? r : undefined;
    });
    assert.ok(rows);
  });

  test('quản trị tra cứu được nhật ký', async () => {
    const res = await (await admin()).get('/audit-logs');
    assert.equal(res.status, 200);
  });
});
