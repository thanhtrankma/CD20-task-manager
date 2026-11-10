// Tính công từng ngày từ các lượt chấm: hàm thuần, không đọc CSDL.
// Ca 1 (startTime – breakStart), ca 2 (breakEnd – endTime): mỗi ca chấm vào, ra; có chấm là được 0,5 công,
// thiếu một lượt vẫn tính công nhưng đánh dấu. Ca 3 làm thêm (từ endTime): phải chấm vào, ra riêng (người làm cả 3 ca
// chấm 6 lần) và có đăng ký được duyệt; chỉ tính phần nằm trong giờ đã duyệt, từ overtimeMinMinutes phút trở lên.
import type { DayPart, WorkShift } from '../../generated/prisma/client';
import { isoWeekday, minuteOf } from '../../common/dates';

export type DayStatus =
  | 'OK' // Đủ công
  | 'LATE' // Đi muộn
  | 'EARLY' // Về sớm
  | 'LATE_EARLY' // Đi muộn và về sớm
  | 'MISSING' // Có ca thiếu lượt chấm (vẫn tính công)
  | 'ABSENT_HALF' // Vắng một ca
  | 'ABSENT' // Ngày làm việc, không chấm ca nào, không có phép
  | 'LEAVE' // Nghỉ cả ngày theo đơn đã duyệt
  | 'HOLIDAY'
  | 'WEEKEND' // Nghỉ hằng tuần
  | 'PENDING'; // Ngày chưa tới, hoặc ca hôm nay chưa kết thúc

export type SessionStatus = 'OK' | 'MISSING' | 'ABSENT' | 'OFF' | 'PENDING';

export interface SessionResult {
  /** 1, 2: ca chính; 3: làm thêm. */
  key: 1 | 2 | 3;
  in?: string;
  out?: string;
  late: number;
  early: number;
  status: SessionStatus;
}

type Shift = Pick<
  WorkShift,
  'startTime' | 'endTime' | 'breakStart' | 'breakEnd' | 'graceMinutes' | 'workdays' | 'overtimeEnabled' | 'overtimeMinMinutes'
>;

export interface DayInput {
  day: string;
  /** Các lượt chấm trong ngày: số phút tính từ 0 giờ, tăng dần. */
  minutes: number[];
  shift: Shift;
  holiday?: string;
  leave?: { part: DayPart; type: string };
  /** Khung làm thêm đã được duyệt ("HH:mm"). */
  overtime?: { start: string; end: string };
  /** Hôm nay và giờ hiện tại, để không coi ca chưa kết thúc là thiếu công. */
  now: { day: string; minute: number };
}

export interface DayResult {
  day: string;
  weekday: number;
  status: DayStatus;
  holiday?: string;
  leave?: { part: DayPart; type: string };
  /** Giờ vào đầu tiên, giờ ra cuối cùng của ca chính. */
  in?: string;
  out?: string;
  punches: string[];
  sessions: SessionResult[];
  /** Tổng phút đi muộn, về sớm của các ca (đã vượt mức cho phép). */
  late: number;
  early: number;
  /** Ngày công: mỗi ca chính có chấm là 0,5. */
  work: number;
  /** Phút làm thêm được tính (đã duyệt, đủ tối thiểu). */
  overtime: number;
  /** Phút làm thêm theo lượt chấm ca 3 (kể cả chưa đăng ký). */
  overtimeActual: number;
  overtimeApproved?: { start: string; end: string };
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Chia lượt chấm theo ca: trước giữa giờ nghỉ trưa là ca 1; sau đó ca 2, rồi ca 3 (lượt thứ 3, 4 trở đi). */
function splitPunches(minutes: number[], shift: Shift) {
  const split = (minuteOf(shift.breakStart) + minuteOf(shift.breakEnd)) / 2;
  const ca1 = minutes.filter((m) => m < split);
  const rest = minutes.filter((m) => m >= split);
  if (!shift.overtimeEnabled || rest.length < 3) return { ca1, ca2: rest, ca3: [] as number[] };
  return { ca1, ca2: rest.slice(0, 2), ca3: rest.slice(2) };
}

function session(
  key: 1 | 2,
  punches: number[],
  start: number,
  end: number,
  grace: number,
  off: boolean,
  ongoing: boolean,
): SessionResult {
  if (off) return { key, late: 0, early: 0, status: 'OFF' };
  if (!punches.length) return { key, late: 0, early: 0, status: ongoing ? 'PENDING' : 'ABSENT' };
  const first = punches[0];
  const last = punches[punches.length - 1];
  const late = first > start + grace && first < end ? first - start : 0;
  if (punches.length === 1 || last - first < 2) {
    // Một lượt: trước giữa ca là giờ vào, sau là giờ ra.
    if (first < (start + end) / 2) return { key, in: hhmm(first), late, early: 0, status: ongoing ? 'PENDING' : 'MISSING' };
    return { key, out: hhmm(first), late: 0, early: 0, status: 'MISSING' };
  }
  const early = last < end - grace ? end - last : 0;
  return { key, in: hhmm(first), out: hhmm(last), late, early, status: 'OK' };
}

/** Ca 3: phút làm thêm thực tế (từ giờ ra ca 2) và phút được tính (trong giờ đã duyệt, đủ tối thiểu). */
function overtimeOf(ca3: number[], shift: Shift, approved?: { start: string; end: string }) {
  const res: SessionResult = { key: 3, late: 0, early: 0, status: 'OK' };
  if (!ca3.length) return { session: approved ? { ...res, status: 'ABSENT' as const } : null, actual: 0, counted: 0 };
  res.in = hhmm(ca3[0]);
  if (ca3.length < 2) return { session: { ...res, status: 'MISSING' as const }, actual: 0, counted: 0 };
  const last = ca3[ca3.length - 1];
  res.out = hhmm(last);
  const begin = Math.max(ca3[0], minuteOf(shift.endTime));
  const actual = Math.max(0, last - begin);
  if (!approved) return { session: res, actual, counted: 0 };
  const counted = Math.max(0, Math.min(last, minuteOf(approved.end)) - Math.max(begin, minuteOf(approved.start)));
  return { session: res, actual, counted: counted >= shift.overtimeMinMinutes ? counted : 0 };
}

export function calcDay(d: DayInput): DayResult {
  const weekday = isoWeekday(d.day);
  const base: DayResult = {
    day: d.day,
    weekday,
    status: 'OK',
    punches: d.minutes.map(hhmm),
    sessions: [],
    late: 0,
    early: 0,
    work: 0,
    overtime: 0,
    overtimeActual: 0,
    leave: d.leave,
    overtimeApproved: d.overtime,
  };
  if (d.holiday) return { ...base, status: 'HOLIDAY', holiday: d.holiday };
  if (!d.shift.workdays.includes(weekday)) return { ...base, status: 'WEEKEND' };
  if (d.leave?.part === 'FULL') return { ...base, status: 'LEAVE' };
  if (d.day > d.now.day) return { ...base, status: 'PENDING' };

  const s = d.shift;
  const today = d.day === d.now.day;
  const { ca1, ca2, ca3 } = splitPunches(d.minutes, s);
  const end1 = minuteOf(s.breakStart);
  const end2 = minuteOf(s.endTime);
  const sessions = [
    session(1, ca1, minuteOf(s.startTime), end1, s.graceMinutes, d.leave?.part === 'MORNING', today && d.now.minute < end1),
    session(2, ca2, minuteOf(s.breakEnd), end2, s.graceMinutes, d.leave?.part === 'AFTERNOON', today && d.now.minute < end2),
  ];
  const ot = s.overtimeEnabled ? overtimeOf(ca3, s, d.overtime) : { session: null, actual: 0, counted: 0 };
  if (ot.session) sessions.push(ot.session);

  const main = sessions.filter((x) => x.key !== 3 && x.status !== 'OFF');
  const absent = main.filter((x) => x.status === 'ABSENT').length;
  const present = main.filter((x) => x.in || x.out).length;
  const late = main.reduce((a, x) => a + x.late, 0);
  const early = main.reduce((a, x) => a + x.early, 0);
  const status: DayStatus =
    !present && absent === main.length
      ? 'ABSENT'
      : !present
        ? 'PENDING'
        : absent
          ? 'ABSENT_HALF'
          : main.some((x) => x.status === 'MISSING')
            ? 'MISSING'
            : late && early
              ? 'LATE_EARLY'
              : late
                ? 'LATE'
                : early
                  ? 'EARLY'
                  : main.some((x) => x.status === 'PENDING')
                    ? 'PENDING'
                    : 'OK';
  const firstIn = main.find((x) => x.in)?.in;
  const lastOut = [...main].reverse().find((x) => x.out)?.out;
  return {
    ...base,
    status,
    sessions,
    in: firstIn,
    out: lastOut,
    late,
    early,
    work: present * 0.5,
    overtime: ot.counted,
    overtimeActual: ot.actual,
  };
}

export interface Summary {
  /** Ngày làm việc theo lịch đã qua (trừ ngày lễ, nghỉ hằng tuần, chưa tới). */
  scheduled: number;
  work: number;
  leave: number;
  /** Số ca đi muộn, về sớm và tổng phút. */
  lateCount: number;
  lateMinutes: number;
  earlyCount: number;
  earlyMinutes: number;
  /** Số ca thiếu lượt chấm. */
  missing: number;
  /** Số ca vắng (không chấm, không phép). */
  absent: number;
  /** Phút làm thêm được tính (đã duyệt). */
  overtimeMinutes: number;
}

export function summarize(days: DayResult[]): Summary {
  const s: Summary = {
    scheduled: 0,
    work: 0,
    leave: 0,
    lateCount: 0,
    lateMinutes: 0,
    earlyCount: 0,
    earlyMinutes: 0,
    missing: 0,
    absent: 0,
    overtimeMinutes: 0,
  };
  for (const d of days) {
    if (d.status === 'HOLIDAY' || d.status === 'WEEKEND') continue;
    if (d.status !== 'PENDING' || d.work) s.scheduled++;
    s.work += d.work;
    if (d.leave) s.leave += d.leave.part === 'FULL' ? 1 : 0.5;
    for (const x of d.sessions) {
      if (x.key === 3) continue;
      if (x.late) {
        s.lateCount++;
        s.lateMinutes += x.late;
      }
      if (x.early) {
        s.earlyCount++;
        s.earlyMinutes += x.early;
      }
      if (x.status === 'MISSING') s.missing++;
      if (x.status === 'ABSENT') s.absent++;
    }
    s.overtimeMinutes += d.overtime;
  }
  return s;
}
