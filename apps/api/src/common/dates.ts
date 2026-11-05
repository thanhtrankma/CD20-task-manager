// Ngày dạng "YYYY-MM-DD" theo giờ Việt Nam. Cột @db.Date lưu nửa đêm UTC nên đọc, ghi bằng UTC.
import { env } from '../env';

export const DAY_MS = 86_400_000;
export const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Cột ngày (nửa đêm UTC) → "YYYY-MM-DD". */
export const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** "YYYY-MM-DD" → giá trị cho cột ngày. */
export const dateOf = (s: string) => new Date(`${s}T00:00:00Z`);

export const addDays = (s: string, n: number) => ymd(new Date(dateOf(s).getTime() + n * DAY_MS));

/** Thứ trong tuần kiểu ISO: 1 = thứ Hai … 7 = Chủ nhật. */
export const isoWeekday = (s: string) => dateOf(s).getUTCDay() || 7;

export const daysBetween = (from: string, to: string) => Math.round((dateOf(to).getTime() - dateOf(from).getTime()) / DAY_MS);

/** Mọi ngày từ from đến to (gồm cả hai đầu). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: env.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Thời điểm → ngày và số phút trong ngày theo giờ địa phương. */
export function localDayMinute(t: Date): { day: string; minute: number; time: string } {
  const p = Object.fromEntries(parts.formatToParts(t).map((x) => [x.type, x.value]));
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    minute: Number(p.hour) * 60 + Number(p.minute),
    time: `${p.hour}:${p.minute}`,
  };
}

/** Hôm nay theo giờ địa phương. */
export const today = () => localDayMinute(new Date()).day;

/** Nửa đêm đầu ngày (giờ địa phương) dưới dạng thời điểm UTC. Múi giờ Việt Nam cố định, không đổi giờ theo mùa. */
export function localDayStart(s: string): Date {
  const guess = dateOf(s);
  const { day, minute } = localDayMinute(guess);
  const offset = (day === s ? minute : minute - 24 * 60) * 60_000;
  return new Date(guess.getTime() - offset);
}

/** "HH:mm" → số phút trong ngày. */
export const minuteOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
