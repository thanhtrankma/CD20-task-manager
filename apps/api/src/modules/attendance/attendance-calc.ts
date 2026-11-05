// Tính công từng ngày từ các lượt chấm: hàm thuần, không đọc CSDL.
import type { DayPart, WorkShift } from '../../generated/prisma/client';
import { isoWeekday, minuteOf } from '../../common/dates';

export type DayStatus =
  | 'OK' // Đủ công
  | 'LATE' // Đi muộn
  | 'EARLY' // Về sớm
  | 'LATE_EARLY' // Đi muộn và về sớm
  | 'MISSING' // Thiếu lượt chấm (chỉ có giờ vào hoặc giờ ra)
  | 'ABSENT' // Ngày làm việc, không chấm, không có phép
  | 'LEAVE' // Nghỉ cả ngày theo đơn đã duyệt
  | 'HOLIDAY'
  | 'WEEKEND' // Nghỉ hằng tuần
  | 'PENDING'; // Hôm nay chưa hết giờ, hoặc ngày chưa tới

export interface DayInput {
  day: string;
  /** Các lượt chấm trong ngày: số phút tính từ 0 giờ, tăng dần. */
  minutes: number[];
  shift: Pick<WorkShift, 'startTime' | 'endTime' | 'breakStart' | 'breakEnd' | 'graceMinutes' | 'workdays'>;
  holiday?: string;
  leave?: { part: DayPart; type: string };
  /** Hôm nay và giờ hiện tại, để không coi ngày chưa kết thúc là thiếu công. */
  now: { day: string; minute: number };
}

export interface DayResult {
  day: string;
  weekday: number;
  status: DayStatus;
  holiday?: string;
  leave?: { part: DayPart; type: string };
  in?: string;
  out?: string;
  punches: string[];
  /** Số phút đi muộn, về sớm (đã vượt mức cho phép). */
  late: number;
  early: number;
  /** Ngày công: 1, 0,5 (nghỉ nửa ngày) hoặc 0. */
  work: number;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function calcDay(d: DayInput): DayResult {
  const weekday = isoWeekday(d.day);
  const punches = d.minutes.map(hhmm);
  const base: DayResult = { day: d.day, weekday, status: 'OK', punches, late: 0, early: 0, work: 0, leave: d.leave };
  if (d.holiday) return { ...base, status: 'HOLIDAY', holiday: d.holiday };
  if (!d.shift.workdays.includes(weekday)) return { ...base, status: 'WEEKEND' };
  if (d.leave?.part === 'FULL') return { ...base, status: 'LEAVE' };

  // Nghỉ buổi sáng: vào trước giờ hết nghỉ trưa. Nghỉ buổi chiều: ra sau giờ bắt đầu nghỉ trưa.
  const start = minuteOf(d.leave?.part === 'MORNING' ? d.shift.breakEnd : d.shift.startTime);
  const end = minuteOf(d.leave?.part === 'AFTERNOON' ? d.shift.breakStart : d.shift.endTime);
  const share = d.leave ? 0.5 : 1;
  const future = d.day > d.now.day;
  const ongoing = d.day === d.now.day && d.now.minute < end;

  if (future) return { ...base, status: 'PENDING' };
  if (!d.minutes.length) return { ...base, status: ongoing ? 'PENDING' : 'ABSENT' };

  const first = d.minutes[0];
  const last = d.minutes[d.minutes.length - 1];
  const late = first > start + d.shift.graceMinutes ? first - start : 0;
  if (d.minutes.length === 1 || last - first < 5) {
    // Một lượt: trước giữa ca là giờ vào, sau là giờ ra.
    const mid = (start + end) / 2;
    if (ongoing && first < mid) return { ...base, status: late ? 'LATE' : 'PENDING', in: hhmm(first), late };
    return first < mid
      ? { ...base, status: 'MISSING', in: hhmm(first), late }
      : { ...base, status: 'MISSING', out: hhmm(first) };
  }
  const early = last < end - d.shift.graceMinutes ? end - last : 0;
  const status: DayStatus = late && early ? 'LATE_EARLY' : late ? 'LATE' : early ? 'EARLY' : 'OK';
  return { ...base, status, in: hhmm(first), out: hhmm(last), late, early, work: share };
}

export interface Summary {
  /** Ngày làm việc theo lịch (trừ ngày lễ, nghỉ hằng tuần, chưa tới). */
  scheduled: number;
  work: number;
  leave: number;
  lateCount: number;
  lateMinutes: number;
  earlyCount: number;
  earlyMinutes: number;
  missing: number;
  absent: number;
}

export function summarize(days: DayResult[]): Summary {
  const s: Summary = { scheduled: 0, work: 0, leave: 0, lateCount: 0, lateMinutes: 0, earlyCount: 0, earlyMinutes: 0, missing: 0, absent: 0 };
  for (const d of days) {
    if (d.status === 'HOLIDAY' || d.status === 'WEEKEND') continue;
    if (d.status !== 'PENDING') s.scheduled++;
    s.work += d.work;
    if (d.leave) s.leave += d.leave.part === 'FULL' ? 1 : 0.5;
    if (d.late) {
      s.lateCount++;
      s.lateMinutes += d.late;
    }
    if (d.early) {
      s.earlyCount++;
      s.earlyMinutes += d.early;
    }
    if (d.status === 'MISSING') s.missing++;
    if (d.status === 'ABSENT') s.absent++;
  }
  return s;
}
