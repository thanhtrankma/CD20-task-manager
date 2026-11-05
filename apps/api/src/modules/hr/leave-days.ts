// Tính ngày nghỉ của một đơn: hàm thuần, dùng chung cho nghỉ phép và bảng công.
import type { DayPart } from '../../generated/prisma/client';
import { eachDay, isoWeekday } from '../../common/dates';

export interface LeaveSpan {
  start: string;
  end: string;
  startPart: DayPart;
  endPart: DayPart;
}

/** Ngày làm việc: thuộc ngày làm việc trong tuần của ca và không phải ngày lễ. */
export const workdayChecker = (workdays: number[], holidays: { has(day: string): boolean }) => (day: string) =>
  workdays.includes(isoWeekday(day)) && !holidays.has(day);

/** Phần nghỉ trong một ngày của đơn; null nếu ngày đó không nghỉ. */
export function leavePartOn(span: LeaveSpan, day: string): DayPart | null {
  if (day < span.start || day > span.end) return null;
  if (span.start === span.end) return span.startPart;
  if (day === span.start) return span.startPart === 'AFTERNOON' ? 'AFTERNOON' : 'FULL';
  if (day === span.end) return span.endPart === 'MORNING' ? 'MORNING' : 'FULL';
  return 'FULL';
}

/** Số ngày làm việc nghỉ (nửa ngày tính 0,5). */
export function countLeaveDays(span: LeaveSpan, isWorkday: (day: string) => boolean): number {
  let days = 0;
  for (const day of eachDay(span.start, span.end)) {
    if (!isWorkday(day)) continue;
    days += leavePartOn(span, day) === 'FULL' ? 1 : 0.5;
  }
  return days;
}

/** Lỗi về buổi nghỉ: đơn nhiều ngày chỉ bắt đầu buổi chiều, kết thúc buổi sáng. */
export function invalidParts(span: LeaveSpan): string | null {
  if (span.start > span.end) return 'Ngày kết thúc phải từ ngày bắt đầu trở đi';
  if (span.start === span.end) return null;
  if (span.startPart === 'MORNING') return 'Ngày đầu chỉ chọn cả ngày hoặc từ buổi chiều';
  if (span.endPart === 'AFTERNOON') return 'Ngày cuối chỉ chọn cả ngày hoặc đến hết buổi sáng';
  return null;
}
