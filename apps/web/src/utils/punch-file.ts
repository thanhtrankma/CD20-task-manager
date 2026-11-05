// Đọc tệp xuất từ máy hoặc phần mềm chấm công: Excel (.xlsx), CSV, TXT/DAT (attlog của ZKTeco, cột cách bằng Tab).
// Mỗi dòng có mã nhân viên và thời điểm (một cột ngày giờ, hoặc cột ngày cùng một/nhiều cột giờ). Giờ hiểu theo giờ Việt Nam.

export type Cell = string | number | boolean | Date | null;
export type Grid = Cell[][];

const VN_OFFSET = '+07:00';
const pad = (n: number | string) => String(n).padStart(2, '0');

export async function readGrid(file: File): Promise<Grid> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    return (await readSheet(file)) as Grid;
  }
  const text = (await file.text()).replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sample = lines.slice(0, 20).join('\n');
  const sep = sample.includes('\t') ? '\t' : (sample.match(/;/g)?.length ?? 0) > (sample.match(/,/g)?.length ?? 0) ? ';' : ',';
  return lines.map((l) => splitLine(l, sep).map((c) => c.trim()));
}

/** Tách một dòng CSV có ngoặc kép. */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

interface Parts {
  y: number;
  mo: number;
  d: number;
  h?: number;
  mi?: number;
  s?: number;
}

/** Ô ngày hoặc ngày giờ → các thành phần; null nếu không phải ngày. */
export function parseDateCell(v: Cell): Parts | null {
  if (v instanceof Date) {
    // Excel không có múi giờ: thư viện trả giờ ghi trong ô dưới dạng UTC.
    return { y: v.getUTCFullYear(), mo: v.getUTCMonth() + 1, d: v.getUTCDate(), h: v.getUTCHours(), mi: v.getUTCMinutes(), s: v.getUTCSeconds() };
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Số ngày kiểu Excel (từ 30/12/1899), phần lẻ là giờ.
    const ms = Math.round((v - 25569) * 86_400_000);
    return parseDateCell(new Date(ms));
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return build(+m[1], +m[2], +m[3], m[4], m[5], m[6]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return build(+m[3], +m[2], +m[1], m[4], m[5], m[6]);
  return null;
}

function build(y: number, mo: number, d: number, h?: string, mi?: string, s?: string): Parts | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d, ...(h !== undefined ? { h: +h, mi: +(mi ?? 0), s: +(s ?? 0) } : {}) };
}

/** Ô giờ "07:25", "7:25:31", số lẻ kiểu Excel (0,3) hoặc ô Date chỉ có giờ → [giờ, phút, giây]. */
export function parseTimeCell(v: Cell): [number, number, number] | null {
  if (v instanceof Date) return [v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds()];
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const total = Math.round(v * 86_400);
    return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  }
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return [+m[1], +m[2], +(m[3] ?? 0)];
}

const iso = (p: Parts, t: [number, number, number]) =>
  `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(t[0])}:${pad(t[1])}:${pad(t[2])}${VN_OFFSET}`;

export const cellText = (v: Cell) =>
  v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ') : v === null || v === undefined ? '' : String(v).trim();

export interface Mapping {
  /** Dòng đầu là tiêu đề. */
  header: boolean;
  codeCol: number;
  /** Cột ngày (hoặc ngày giờ). */
  dateCol: number;
  /** Các cột giờ riêng (ví dụ Giờ vào, Giờ ra); trống khi cột ngày đã có giờ. */
  timeCols: number[];
}

export interface Punch {
  code: string;
  at: string;
}

/** Chuyển bảng thành lượt chấm theo cách ghép cột; dòng không đọc được đếm vào skipped. */
export function toPunches(grid: Grid, m: Mapping): { punches: Punch[]; skipped: number[] } {
  const punches: Punch[] = [];
  const skipped: number[] = [];
  grid.forEach((row, i) => {
    if (m.header && i === 0) return;
    const code = cellText(row[m.codeCol] ?? null).replace(/\.0$/, '');
    const date = parseDateCell(row[m.dateCol] ?? null);
    if (!code || !date) {
      if (row.some((c) => cellText(c))) skipped.push(i + 1);
      return;
    }
    if (!m.timeCols.length) {
      if (date.h === undefined) skipped.push(i + 1);
      else punches.push({ code, at: iso(date, [date.h, date.mi!, date.s!]) });
      return;
    }
    let any = false;
    for (const c of m.timeCols) {
      const t = parseTimeCell(row[c] ?? null);
      if (t) {
        punches.push({ code, at: iso(date, t) });
        any = true;
      }
    }
    if (!any && !m.timeCols.every((c) => !cellText(row[c] ?? null))) skipped.push(i + 1);
  });
  return { punches, skipped };
}

/** Đoán cách ghép cột: cột ngày là cột đầu tiên đọc được ngày; cột mã là cột ngắn đứng trước; giờ: các cột "HH:mm". */
export function guessMapping(grid: Grid): Mapping {
  const sample = grid.slice(0, 30);
  const header = sample.length > 1 && !sample[0].some((c) => parseDateCell(c)) && sample.slice(1).some((r) => r.some((c) => parseDateCell(c)));
  const body = header ? sample.slice(1) : sample;
  const width = Math.max(0, ...sample.map((r) => r.length));
  const ratio = (col: number, ok: (c: Cell) => boolean) =>
    body.filter((r) => ok(r[col] ?? null)).length / Math.max(1, body.filter((r) => cellText(r[col] ?? null)).length);
  const cols = Array.from({ length: width }, (_, c) => c);
  /** Cột có tỉ lệ ô hợp lệ cao nhất (bỏ qua vài dòng lỗi, dòng tổng cộng trong tệp). */
  const best = (candidates: number[], ok: (c: Cell) => boolean) =>
    candidates.reduce((b, c) => (ratio(c, ok) > ratio(b, ok) ? c : b), candidates[0] ?? 0);
  const dateCol = best(cols, (v) => !!parseDateCell(v));
  const hasTime = body.some((r) => parseDateCell(r[dateCol] ?? null)?.h !== undefined);
  const timeCols = hasTime ? [] : cols.filter((c) => c !== dateCol && ratio(c, (v) => !!parseTimeCell(v)) > 0.6);
  const codeCol = best(
    cols.filter((c) => c !== dateCol && !timeCols.includes(c)),
    (v) => /^[A-Za-z0-9._-]{1,32}$/.test(cellText(v)),
  );
  return { header, codeCol, dateCol, timeCols };
}
