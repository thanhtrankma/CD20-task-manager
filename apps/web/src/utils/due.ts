import dayjs from 'dayjs';
import type { TaskStatus } from '../api/types';
import { DATE_FORMAT } from '../constants';

export type DueTone = 'overdue' | 'today' | 'soon' | 'normal';

/** Số ngày coi là "sắp đến hạn" (cùng mốc với nhắc hạn của máy chủ). */
const SOON_DAYS = 3;

/**
 * Hạn hiển thị tương đối ("Trễ 3 ngày", "Hôm nay 17:00", "Còn 2 ngày") kèm mức màu.
 * Việc đã xong, đã hủy chỉ hiện ngày, không tô màu.
 */
export function dueInfo(dueDate: string, status: TaskStatus): { label: string; tone: DueTone | null; date: string } {
  const due = dayjs(dueDate);
  const date = due.format(DATE_FORMAT);
  if (status === 'DONE' || status === 'CANCELLED') return { label: date, tone: null, date };

  const now = dayjs();
  const days = due.startOf('day').diff(now.startOf('day'), 'day');
  if (due.isBefore(now)) {
    return { label: days < 0 ? `Trễ ${-days} ngày` : 'Quá hạn', tone: 'overdue', date };
  }
  if (days === 0) return { label: `Hôm nay ${due.format('HH:mm')}`, tone: 'today', date };
  if (days === 1) return { label: 'Ngày mai', tone: 'soon', date };
  return { label: `Còn ${days} ngày`, tone: days <= SOON_DAYS ? 'soon' : 'normal', date };
}
