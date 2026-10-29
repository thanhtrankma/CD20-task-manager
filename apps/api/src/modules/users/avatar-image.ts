// Kiểm tra ảnh đại diện và xóa siêu dữ liệu (EXIF: vị trí GPS, loại máy, thời gian chụp; chú thích...) trước khi lưu.
// Không giải mã điểm ảnh: chỉ đọc cấu trúc tệp JPEG, PNG, giữ lại phần hình, bỏ các khối phụ.

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const MIN_SIDE = 32;
const MAX_SIDE = 4096;

export interface CleanImage {
  data: Buffer;
  mime: 'image/jpeg' | 'image/png';
  ext: '.jpg' | '.png';
  width: number;
  height: number;
}

export class InvalidImageError extends Error {}

export function cleanAvatar(input: Buffer): CleanImage {
  if (input.length > AVATAR_MAX_BYTES) throw new InvalidImageError('Ảnh quá lớn (tối đa 2 MB)');
  const image = isJpeg(input) ? cleanJpeg(input) : isPng(input) ? cleanPng(input) : null;
  if (!image) throw new InvalidImageError('Chỉ nhận ảnh JPEG hoặc PNG');
  const { width, height } = image;
  if (width < MIN_SIDE || height < MIN_SIDE || width > MAX_SIDE || height > MAX_SIDE) {
    throw new InvalidImageError(`Kích thước ảnh phải từ ${MIN_SIDE} đến ${MAX_SIDE} điểm ảnh mỗi chiều`);
  }
  return image;
}

const isJpeg = (b: Buffer) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isPng = (b: Buffer) => b.length > 8 && b.subarray(0, 8).equals(PNG_SIGNATURE);

/**
 * JPEG: giữ APP0 (JFIF), APP14 (Adobe, cần để hiển thị đúng màu) và các khối hình (bảng lượng tử, Huffman, SOF, SOS...);
 * bỏ APP1 – APP13, APP15 (EXIF, XMP, ICC, Photoshop...) và COM (chú thích).
 */
function cleanJpeg(b: Buffer): CleanImage {
  const out: Buffer[] = [b.subarray(0, 2)];
  let pos = 2;
  let size: { width: number; height: number } | null = null;
  while (pos < b.length) {
    if (b[pos] !== 0xff) throw new InvalidImageError('Tệp JPEG hỏng');
    while (b[pos] === 0xff) pos++; // Byte đệm 0xFF trước mã khối
    const marker = b[pos++];
    if (marker === 0xd9) break; // EOI không có dữ liệu ảnh trước SOS
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (pos + 2 > b.length) throw new InvalidImageError('Tệp JPEG hỏng');
    const len = b.readUInt16BE(pos);
    if (len < 2 || pos + len > b.length) throw new InvalidImageError('Tệp JPEG hỏng');
    const segment = b.subarray(pos - 2, pos + len);

    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && len >= 7) size = { height: b.readUInt16BE(pos + 3), width: b.readUInt16BE(pos + 5) };

    if (marker === 0xda) {
      // SOS: phần còn lại là dữ liệu ảnh nén, giữ nguyên đến hết tệp (cắt phần thừa sau EOI).
      if (!size) throw new InvalidImageError('Tệp JPEG hỏng');
      const eoi = b.lastIndexOf(Buffer.from([0xff, 0xd9]));
      if (eoi < pos) throw new InvalidImageError('Tệp JPEG hỏng');
      out.push(b.subarray(pos - 2, eoi + 2));
      return { data: Buffer.concat(out), mime: 'image/jpeg', ext: '.jpg', ...size };
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep = !(isApp && marker !== 0xe0 && marker !== 0xee) && marker !== 0xfe;
    if (keep) out.push(segment);
    pos += len;
  }
  throw new InvalidImageError('Tệp JPEG hỏng');
}

/** PNG: chỉ giữ các khối cần để vẽ ảnh; bỏ chữ (tEXt, iTXt, zTXt), EXIF (eXIf), thời gian, ảnh động (APNG)... */
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'pHYs']);

function cleanPng(b: Buffer): CleanImage {
  const out: Buffer[] = [PNG_SIGNATURE];
  let pos = 8;
  let size: { width: number; height: number } | null = null;
  let ended = false;
  while (pos + 12 <= b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString('latin1', pos + 4, pos + 8);
    const end = pos + 12 + len;
    if (end > b.length) throw new InvalidImageError('Tệp PNG hỏng');
    if (type === 'IHDR') {
      if (pos !== 8 || len !== 13) throw new InvalidImageError('Tệp PNG hỏng');
      size = { width: b.readUInt32BE(pos + 8), height: b.readUInt32BE(pos + 12) };
    }
    if (PNG_KEEP.has(type)) out.push(b.subarray(pos, end));
    pos = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!size || !ended) throw new InvalidImageError('Tệp PNG hỏng');
  return { data: Buffer.concat(out), mime: 'image/png', ext: '.png', ...size };
}
