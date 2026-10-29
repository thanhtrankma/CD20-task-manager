// Trò chuyện nội bộ: nhắn riêng, nhóm tự tạo, nhóm theo đơn vị, quyền, thu hồi, chưa đọc, luồng sự kiện, thông báo đẩy.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import {
  admin,
  API,
  closeDb,
  head,
  leader,
  login,
  ORIGIN,
  otherStaff,
  request,
  type Session,
  sql,
  staff,
  unitId,
  userId,
  waitFor,
} from './helpers.mts';

const del = (s: Session, path: string) => request(path, { method: 'DELETE' }, s.cookie);
const items = async (s: Session) => (await s.get('/chat/conversations')).body as any[];
const unread = async (s: Session) => (await s.get('/chat/unread')).body.count as number;

/** Mở luồng sự kiện, gom các sự kiện nhận được. */
async function openStream(s: Session) {
  const controller = new AbortController();
  const res = await fetch(`${API}/chat/stream`, { headers: { Cookie: s.cookie, Origin: ORIGIN }, signal: controller.signal });
  const events: { event: string; data: any }[] = [];
  let ended = false;
  const done = (async () => {
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(frame)?.[1];
          const data = /^data: (.*)$/m.exec(frame)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data) });
        }
      }
    } catch {
      // Đóng chủ động
    }
    ended = true;
  })();
  return { res, events, isEnded: () => ended, close: () => controller.abort(), done };
}

let fcm: Server;
const fcmSent: { token: string; body: any }[] = [];

before(async () => {
  const TMP = process.env.TEST_TMP!;
  const tls = { key: readFileSync(join(TMP, 'push-key.pem')), cert: readFileSync(join(TMP, 'push-cert.pem')) };
  // Mã truy cập hết hạn ngay (expires_in 1 giây): API không giữ lại mã của máy chủ giả này cho các tệp kiểm thử sau.
  fcm = createServer(tls, (req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url === '/token') return res.end('{"access_token":"fcm-access-ok","expires_in":1}');
      const body = JSON.parse(raw);
      fcmSent.push({ token: body.message.token, body });
      res.end('{"name":"x"}');
    });
  });
  await new Promise<void>((r) => fcm.listen(Number(process.env.TEST_FCM_PORT), '127.0.0.1', r));
});

after(async () => {
  fcm?.close();
  await closeDb();
});

describe('Danh bạ, quyền tham gia', () => {
  test('cán bộ tìm được người khác; không có quản trị và chính mình', async () => {
    const s = await staff();
    const list = (await s.get('/chat/directory')).body as any[];
    assert.ok(list.length >= 3);
    const [me, adminId] = [await userId('canbo'), await userId('admin')];
    assert.ok(!list.some((u) => u.id === me || u.id === adminId));
    assert.ok(list.every((u) => 'avatarUrl' in u && u.unit?.name && !('username' in u)));
    const found = (await s.get(`/chat/directory?q=${encodeURIComponent('lãnh đạo')}`)).body as any[];
    const leaderId = await userId('lanhdao');
    assert.ok(found.some((u) => u.id === leaderId));
    assert.ok(found.every((u) => /lãnh đạo/i.test(u.fullName)));
  });

  test('quản trị không dùng được trò chuyện', async () => {
    const a = await admin();
    assert.equal((await a.get('/chat/conversations')).status, 403);
    assert.equal((await a.get('/chat/stream')).status, 403);
    const s = await staff();
    assert.equal((await s.post('/chat/direct', { userId: await userId('admin') })).status, 400);
  });
});

describe('Nhắn riêng', () => {
  test('mở hai lần vẫn một cuộc; gửi, chưa đọc, đã đọc; người ngoài không xem được', async () => {
    const a = await staff();
    const b = await otherStaff();
    const peer = await userId('canbopdt');
    const c1 = (await a.post('/chat/direct', { userId: peer })).body;
    const c2 = (await b.post('/chat/direct', { userId: await userId('canbo') })).body;
    assert.equal(c1.id, c2.id);
    assert.equal(c1.type, 'DIRECT');
    assert.equal(c1.name, 'Cán bộ canbopdt');
    assert.equal(c1.peer.id, peer);

    const before = await unread(b);
    const sent = await a.post(`/chat/conversations/${c1.id}/messages`, { body: '  Chào đồng chí  ' });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.body, 'Chào đồng chí');
    assert.equal(sent.body.sender.id, await userId('canbo'));
    assert.equal(await unread(b), before + 1);
    assert.equal(await unread(a), 0, 'tin của mình không tính chưa đọc');

    const item = (await items(b)).find((c) => c.id === c1.id);
    assert.equal(item.unread, 1);
    assert.equal(item.lastMessage.body, 'Chào đồng chí');

    assert.equal((await b.post(`/chat/conversations/${c1.id}/read`, { messageId: sent.body.id })).status, 204);
    assert.equal(await unread(b), before);
    const detail = (await a.get(`/chat/conversations/${c1.id}`)).body;
    assert.equal(detail.members.find((m: any) => m.id === peer).lastReadMessageId, sent.body.id);
    assert.equal(detail.canLeave, false);

    const outsider = await login('khoaso');
    assert.equal((await outsider.get(`/chat/conversations/${c1.id}`)).status, 404);
    assert.equal((await outsider.get(`/chat/conversations/${c1.id}/messages`)).status, 404);
    assert.equal((await outsider.post(`/chat/conversations/${c1.id}/messages`, { body: 'x' })).status, 404);
  });

  test('nội dung rỗng, quá dài bị từ chối; không nhắn cho chính mình', async () => {
    const a = await staff();
    const c = (await a.post('/chat/direct', { userId: await userId('canbopdt') })).body;
    assert.equal((await a.post(`/chat/conversations/${c.id}/messages`, { body: '   ' })).status, 400);
    assert.equal((await a.post(`/chat/conversations/${c.id}/messages`, { body: 'x'.repeat(4001) })).status, 400);
    assert.equal((await a.post('/chat/direct', { userId: await userId('canbo') })).status, 400);
  });
});

describe('Nhóm tự tạo', () => {
  test('tạo, đổi tên, thêm, bớt, rời nhóm; chỉ người quản lý được sửa', async () => {
    const owner = await staff();
    const m1 = await otherStaff();
    const m2 = await login('khoaso');
    const ids = { m1: await userId('canbopdt'), m2: await userId('khoaso'), lead: await userId('lanhdao') };

    assert.equal((await owner.post('/chat/groups', { name: 'X', memberIds: [await userId('admin')] })).status, 400);
    const g = (await owner.post('/chat/groups', { name: 'Tổ soạn đề', memberIds: [ids.m1, ids.m2] })).body;
    assert.equal(g.type, 'GROUP');
    assert.equal(g.memberCount, 3);
    assert.equal(g.lastMessage.kind, 'SYSTEM');
    assert.match(g.lastMessage.body, /đã tạo nhóm/);

    const asMember = (await m1.get(`/chat/conversations/${g.id}`)).body;
    assert.equal(asMember.canManage, false);
    assert.equal(asMember.canLeave, true);
    assert.equal((await m1.patch(`/chat/conversations/${g.id}`, { name: 'Đổi' })).status, 403);
    assert.equal((await m1.post(`/chat/conversations/${g.id}/members`, { userIds: [ids.lead] })).status, 403);
    assert.equal((await del(m1, `/chat/conversations/${g.id}/members/${ids.m2}`)).status, 403);

    assert.equal((await owner.patch(`/chat/conversations/${g.id}`, { name: 'Tổ soạn đề thi' })).body.name, 'Tổ soạn đề thi');
    assert.equal((await owner.patch(`/chat/conversations/${g.id}`, { includeSubunits: true })).status, 400);
    assert.equal((await owner.post(`/chat/conversations/${g.id}/members`, { userIds: [ids.lead] })).status, 204);
    assert.equal((await del(owner, `/chat/conversations/${g.id}/members/${ids.m2}`)).status, 204);
    assert.equal((await m2.get(`/chat/conversations/${g.id}`)).status, 404, 'người bị bớt không xem được nữa');

    const msgs = (await owner.get(`/chat/conversations/${g.id}/messages`)).body.items as any[];
    assert.deepEqual(
      msgs.map((m) => m.body.replace(/^.*? đã /, 'đã ')).reverse(),
      ['đã tạo nhóm', 'đã đổi tên nhóm thành “Tổ soạn đề thi”', 'đã thêm Nguyễn Văn Lãnh Đạo', 'đã mời Cán bộ khoaso ra khỏi nhóm'],
    );

    // Người quản lý rời nhóm: người vào sớm nhất nhận quyền quản lý.
    assert.equal((await del(owner, `/chat/conversations/${g.id}/members/${await userId('canbo')}`)).status, 204);
    assert.equal((await m1.get(`/chat/conversations/${g.id}`)).body.canManage, true);
  });
});

describe('Nhóm theo đơn vị', () => {
  test('quyền tạo; thành viên theo đơn vị; gồm trực thuộc; mỗi đơn vị một nhóm', async () => {
    const khoa = await unitId('KCNTT');
    const pdt = await unitId('PDT');
    const s = await staff(); // Bộ môn Mạng máy tính, trực thuộc Khoa CNTT
    const h = await head(); // Chỉ huy Khoa CNTT
    const l = await leader();
    const p = await otherStaff(); // Phòng Đào tạo

    assert.equal((await s.post('/chat/unit-groups', { unitId: khoa })).status, 403);
    assert.equal((await h.post('/chat/unit-groups', { unitId: pdt })).status, 403);

    const g = (await h.post('/chat/unit-groups', { unitId: khoa })).body;
    assert.equal(g.type, 'UNIT');
    assert.equal(g.name, 'Khoa Công nghệ thông tin');
    assert.equal((await h.post('/chat/unit-groups', { unitId: khoa })).status, 409);
    assert.ok(!(await items(s)).some((c) => c.id === g.id), 'chưa gồm trực thuộc: bộ môn chưa vào nhóm');

    assert.equal((await h.patch(`/chat/conversations/${g.id}`, { includeSubunits: true })).status, 200);
    assert.ok((await items(s)).some((c) => c.id === g.id), 'gồm trực thuộc: cán bộ bộ môn vào nhóm');
    assert.equal((await s.post(`/chat/conversations/${g.id}/messages`, { body: 'Báo cáo khoa' })).status, 201);
    assert.equal((await s.patch(`/chat/conversations/${g.id}`, { name: 'Đổi' })).status, 403);
    assert.equal((await del(s, `/chat/conversations/${g.id}/members/${await userId('canbo')}`)).status, 400);
    assert.ok(!(await items(p)).some((c) => c.id === g.id), 'Phòng Đào tạo không thấy nhóm Khoa');

    const pg = (await l.post('/chat/unit-groups', { unitId: pdt })).body;
    assert.ok((await items(p)).some((c) => c.id === pg.id));

    // Chuyển đơn vị: tự ra khỏi nhóm cũ, vào nhóm mới.
    const a = await admin();
    const khoaso = await userId('khoaso');
    await a.patch(`/users/${khoaso}`, { unitId: khoa });
    const moved = await login('khoaso');
    let mine = await items(moved);
    assert.ok(mine.some((c) => c.id === g.id) && !mine.some((c) => c.id === pg.id));
    await a.patch(`/users/${khoaso}`, { unitId: pdt });
    mine = await items(await login('khoaso'));
    assert.ok(!mine.some((c) => c.id === g.id) && mine.some((c) => c.id === pg.id));

    const detail = (await h.get(`/chat/conversations/${g.id}`)).body;
    assert.equal(detail.canManage, true);
    const [canbo, adminId] = [await userId('canbo'), await userId('admin')];
    assert.ok(detail.members.some((m: any) => m.id === canbo));
    assert.ok(!detail.members.some((m: any) => m.id === adminId));
  });
});

describe('Tin nhắn', () => {
  test('phân trang, mới nhất trước', async () => {
    const a = await staff();
    const c = (await a.post('/chat/groups', { name: 'Phân trang', memberIds: [await userId('canbopdt')] })).body;
    await sql(
      `insert into messages (conversation_id, sender_id, body) select $1, $2, 'tin ' || g from generate_series(1, 60) g`,
      [c.id, await userId('canbo')],
    );
    const p1 = (await a.get(`/chat/conversations/${c.id}/messages?limit=50`)).body;
    assert.equal(p1.items.length, 50);
    assert.equal(p1.items[0].body, 'tin 60');
    assert.equal(p1.hasMore, true);
    const p2 = (await a.get(`/chat/conversations/${c.id}/messages?limit=50&before=${p1.items.at(-1).id}`)).body;
    assert.equal(p2.items.length, 11); // 10 tin còn lại + dòng "đã tạo nhóm"
    assert.equal(p2.hasMore, false);
    assert.equal((await a.get(`/chat/conversations/${c.id}/messages?limit=51`)).status, 400);
  });

  test('thu hồi tin của mình trong 24 giờ', async () => {
    const a = await staff();
    const b = await otherStaff();
    const c = (await a.post('/chat/direct', { userId: await userId('canbopdt') })).body;
    const m = (await a.post(`/chat/conversations/${c.id}/messages`, { body: 'gửi nhầm' })).body;
    assert.equal((await del(b, `/chat/messages/${m.id}`)).status, 403);
    assert.equal((await del(a, `/chat/messages/${m.id}`)).status, 204);
    const latest = (await b.get(`/chat/conversations/${c.id}/messages?limit=1`)).body.items[0];
    assert.equal(latest.body, '');
    assert.ok(latest.deletedAt);
    assert.equal((await sql('select body from messages where id = $1', [m.id]))[0].body, '', 'không còn nội dung trong CSDL');

    const old = (await a.post(`/chat/conversations/${c.id}/messages`, { body: 'tin cũ' })).body;
    await sql(`update messages set created_at = now() - interval '25 hours' where id = $1`, [old.id]);
    assert.equal((await del(a, `/chat/messages/${old.id}`)).status, 403);
  });

  test('tắt thông báo: không tính vào số chưa đọc trên menu', async () => {
    const a = await staff();
    const b = await otherStaff();
    const c = (await a.post('/chat/groups', { name: 'Tắt thông báo', memberIds: [await userId('canbopdt')] })).body;
    const before = await unread(b);
    await a.post(`/chat/conversations/${c.id}/messages`, { body: 'một' });
    assert.equal(await unread(b), before + 1);
    assert.equal((await b.post(`/chat/conversations/${c.id}/mute`, { muted: true })).status, 204);
    assert.equal(await unread(b), before);
    assert.equal((await items(b)).find((x) => x.id === c.id).muted, true);
  });
});

describe('Luồng sự kiện', () => {
  test('nhận tin mới tức thì; đăng xuất thì luồng đóng', async () => {
    const a = await staff();
    const b = await otherStaff();
    const c = (await a.post('/chat/direct', { userId: await userId('canbopdt') })).body;
    const stream = await openStream(b);
    assert.equal(stream.res.status, 200);
    assert.match(stream.res.headers.get('content-type')!, /text\/event-stream/);

    const m = (await a.post(`/chat/conversations/${c.id}/messages`, { body: 'tin tức thì' })).body;
    const got = await waitFor(() => stream.events.find((e) => e.event === 'message' && e.data.id === m.id));
    assert.equal(got.data.body, 'tin tức thì');
    await del(a, `/chat/messages/${m.id}`);
    assert.ok(await waitFor(() => stream.events.find((e) => e.event === 'message_deleted' && e.data.id === m.id)));

    assert.equal((await b.post('/auth/logout')).status, 204);
    assert.ok(await waitFor(() => stream.isEnded() || undefined), 'luồng đóng ngay khi đăng xuất');
  });

  test('người ngoài cuộc không nhận được tin', async () => {
    const a = await staff();
    const outsider = await login('khoaso');
    const stream = await openStream(outsider);
    const c = (await a.post('/chat/direct', { userId: await userId('canbopdt') })).body;
    const m = (await a.post(`/chat/conversations/${c.id}/messages`, { body: 'riêng tư' })).body;
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(!stream.events.some((e) => e.event === 'message' && e.data.id === m.id));
    stream.close();
  });
});

describe('Thông báo đẩy tin nhắn', () => {
  test('câu chung, không có nội dung; bỏ người đã tắt thông báo; không đẩy dồn dập', async () => {
    const a = await staff();
    const b = await otherStaff();
    const token = 'fcm-chat-token-' + 'f'.repeat(40);
    assert.equal((await b.post('/devices', { platform: 'ANDROID', provider: 'FCM', token })).status, 204);
    const c = (await a.post('/chat/groups', { name: 'Đẩy', memberIds: [await userId('canbopdt')] })).body;

    await a.post(`/chat/conversations/${c.id}/messages`, { body: 'nội dung không được lộ' });
    const pushed = await waitFor(() => fcmSent.find((m) => m.token === token && m.body.message.data.link === `/chat/${c.id}`));
    assert.equal(pushed.body.message.notification.body, 'Đồng chí có tin nhắn mới');
    assert.doesNotMatch(JSON.stringify(pushed.body), /không được lộ|canbo|Cán Bộ/);

    await a.post(`/chat/conversations/${c.id}/messages`, { body: 'tin thứ hai' });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(fcmSent.filter((m) => m.token === token && m.body.message.data.link === `/chat/${c.id}`).length, 1);

    const c2 = (await a.post('/chat/groups', { name: 'Im lặng', memberIds: [await userId('canbopdt')] })).body;
    await b.post(`/chat/conversations/${c2.id}/mute`, { muted: true });
    await a.post(`/chat/conversations/${c2.id}/messages`, { body: 'không đẩy' });
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(!fcmSent.some((m) => m.body.message.data.link === `/chat/${c2.id}`));
  });
});
