// Ảnh đại diện: kiểm tra loại, kích thước; xóa siêu dữ liệu (EXIF, chú thích); chỉ xem khi đăng nhập; quản trị gỡ ảnh.
import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { admin, closeDb, otherStaff, request, type Session, staff, userId } from './helpers.mts';

after(closeDb);

const seg = (marker: number, payload: Buffer) => {
  const head = Buffer.alloc(4);
  head.writeUInt16BE(0xff00 | marker, 0);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
};

/** JPEG tối giản đúng cấu trúc: JFIF, EXIF có tọa độ GPS, chú thích, SOF0 (kích thước), SOS, dữ liệu, EOI. */
function jpeg(width: number, height: number) {
  const sof = Buffer.alloc(9);
  sof[0] = 8;
  sof.writeUInt16BE(height, 1);
  sof.writeUInt16BE(width, 3);
  sof[5] = 1;
  sof.set([1, 0x11, 0], 6);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    seg(0xe1, Buffer.from('Exif\0\0GPSLatitude 21.0285 Nikon D750', 'latin1')),
    seg(0xfe, Buffer.from('chu thich bi mat', 'latin1')),
    seg(0xdb, Buffer.alloc(65, 1)),
    seg(0xc0, sof),
    seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x12, 0x34, 0x56, 0xff, 0x00, 0x78]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
};

function png(width: number, height: number) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('Comment\0vi tri doanh trai', 'latin1')),
    chunk('eXIf', Buffer.from('MM\0*GPS', 'latin1')),
    chunk('IDAT', Buffer.from([0x78, 0x9c, 1, 2, 3])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const upload = (s: Session, name: string, data: Buffer) => s.upload('/users/me/avatar', name, new Uint8Array(data));
const fetchAvatar = async (url: string, cookie?: string) => {
  const res = await fetch(process.env.TEST_API!.replace(/\/api$/, '') + url, { headers: cookie ? { Cookie: cookie } : {} });
  return { res, body: Buffer.from(await res.arrayBuffer()) };
};

describe('Ảnh đại diện', () => {
  test('JPEG: lưu được, bỏ EXIF, chú thích; giữ phần hình', async () => {
    const s = await staff();
    const r = await upload(s, 'anh.jpg', jpeg(400, 300));
    assert.equal(r.status, 201);
    assert.match(r.body.avatarUrl, /^\/api\/users\/\d+\/avatar\?v=[0-9a-f]{8}$/);
    assert.equal((await s.get('/auth/me')).body.avatarUrl, r.body.avatarUrl);

    const { res, body } = await fetchAvatar(r.body.avatarUrl, s.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.match(res.headers.get('cache-control')!, /private/);
    const text = body.toString('latin1');
    assert.doesNotMatch(text, /Exif|GPS|Nikon|chu thich/);
    assert.match(text, /JFIF/);
    assert.ok(body.subarray(0, 2).equals(Buffer.from([0xff, 0xd8])) && body.subarray(-2).equals(Buffer.from([0xff, 0xd9])));

    // Người khác thấy ảnh trong danh bạ, xem được khi đã đăng nhập; chưa đăng nhập thì không.
    const other = await otherStaff();
    const me = await userId('canbo');
    const entry = ((await other.get('/chat/directory')).body as any[]).find((u) => u.id === me);
    assert.equal(entry.avatarUrl, r.body.avatarUrl);
    assert.equal((await fetchAvatar(r.body.avatarUrl, other.cookie)).res.status, 200);
    assert.equal((await fetchAvatar(r.body.avatarUrl)).res.status, 401);
  });

  test('PNG: bỏ chữ, EXIF; đổi ảnh thì đổi đường dẫn', async () => {
    const s = await staff();
    const first = (await s.get('/auth/me')).body.avatarUrl;
    const r = await upload(s, 'anh.png', png(256, 256));
    assert.equal(r.status, 201);
    assert.notEqual(r.body.avatarUrl, first);
    const { res, body } = await fetchAvatar(r.body.avatarUrl, s.cookie);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const text = body.toString('latin1');
    assert.doesNotMatch(text, /tEXt|eXIf|doanh trai|GPS/);
    assert.match(text, /IHDR[\s\S]*IDAT[\s\S]*IEND/);
  });

  test('từ chối tệp không phải ảnh, ảnh quá nhỏ, quá lớn, hỏng', async () => {
    const s = await staff();
    const pdf = Buffer.from('%PDF-1.7 giả làm ảnh');
    assert.equal((await upload(s, 'anh.jpg', pdf)).status, 400);
    assert.equal((await upload(s, 'anh.jpg', jpeg(16, 16))).status, 400);
    assert.equal((await upload(s, 'anh.png', png(5000, 100))).status, 400);
    assert.equal((await upload(s, 'anh.jpg', jpeg(400, 300).subarray(0, 40))).status, 400);
    const big = await upload(s, 'anh.jpg', Buffer.concat([jpeg(400, 300), Buffer.alloc(2.5 * 1024 * 1024)]));
    assert.equal(big.status, 400);
    assert.match(big.body.message, /2 MB/);
  });

  test('tự xóa ảnh; quản trị gỡ ảnh người khác, cán bộ thì không', async () => {
    const s = await staff();
    const other = await otherStaff();
    const me = await userId('canbo');
    const url = (await upload(s, 'anh.jpg', jpeg(100, 100))).body.avatarUrl;
    assert.equal((await request(`/users/${me}/avatar`, { method: 'DELETE' }, other.cookie)).status, 403);
    assert.equal((await request(`/users/${me}/avatar`, { method: 'DELETE' }, (await admin()).cookie)).status, 204);
    assert.equal((await s.get('/auth/me')).body.avatarUrl, null);
    assert.equal((await fetchAvatar(url, s.cookie)).res.status, 404);

    await upload(other, 'anh.jpg', jpeg(100, 100));
    assert.equal((await request('/users/me/avatar', { method: 'DELETE' }, other.cookie)).status, 204);
    assert.equal((await other.get('/auth/me')).body.avatarUrl, null);
  });
});
