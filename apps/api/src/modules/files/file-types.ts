const ZIP = [0x50, 0x4b, 0x03, 0x04]; // docx, xlsx, pptx là tệp zip
const OLE = [0xd0, 0xcf, 0x11, 0xe0]; // doc, xls đời cũ

/** Danh sách loại tệp được phép: đuôi tệp → MIME trả về khi tải xuống và chữ ký đầu tệp. */
export const ALLOWED_FILE_TYPES: Record<string, { mime: string; magic: number[] }> = {
  '.pdf': { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  '.png': { mime: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47] },
  '.jpg': { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  '.jpeg': { mime: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  '.docx': {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: ZIP,
  },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: ZIP },
  '.pptx': {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    magic: ZIP,
  },
  '.doc': { mime: 'application/msword', magic: OLE },
  '.xls': { mime: 'application/vnd.ms-excel', magic: OLE },
};

/** Kiểm tra nội dung thật của tệp, không tin vào đuôi tệp hay Content-Type trình duyệt gửi. */
export const matchesSignature = (buffer: Buffer, magic: number[]) =>
  buffer.length >= magic.length && magic.every((byte, i) => buffer[i] === byte);

/** Multer giải mã tên tệp theo latin1; chuyển lại UTF-8 cho tên tiếng Việt và làm sạch. */
export function normalizeFileName(name: string): string {
  const decoded = /[^\u0000-ÿ]/.test(name) ? name : Buffer.from(name, 'latin1').toString('utf8');
  return decoded
    .replace(/[\\/]/g, '_')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 200);
}
