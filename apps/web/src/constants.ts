import type { DayPart, DayStatus, LeaveStatus, Priority, Role, TaskStatus, TodoReason } from './api/types';
import type { DueTone } from './utils/due';

export interface Tone {
  label: string;
  /** Màu nền và chữ cho thẻ dạng viên thuốc. */
  bg: string;
  fg: string;
}

export const STATUS: Record<TaskStatus, Tone> = {
  NEW: { label: 'Mới giao', bg: '#eff6ff', fg: '#1d4ed8' },
  IN_PROGRESS: { label: 'Đang thực hiện', bg: '#eef2ff', fg: '#4338ca' },
  PENDING_REVIEW: { label: 'Chờ duyệt', bg: '#fffbeb', fg: '#b45309' },
  RETURNED: { label: 'Bị trả lại', bg: '#fff7ed', fg: '#c2410c' },
  DONE: { label: 'Hoàn thành', bg: '#ecfdf5', fg: '#047857' },
  CANCELLED: { label: 'Đã hủy', bg: '#f1f5f9', fg: '#64748b' },
};

export const PRIORITY: Record<Priority, Tone> = {
  LOW: { label: 'Thấp', bg: '#f1f5f9', fg: '#64748b' },
  NORMAL: { label: 'Bình thường', bg: '#f0f9ff', fg: '#0369a1' },
  HIGH: { label: 'Cao', bg: '#fff7ed', fg: '#c2410c' },
  URGENT: { label: 'Khẩn', bg: '#fff1f2', fg: '#be123c' },
};

export const OVERDUE: Tone = { label: 'Quá hạn', bg: '#fff1f2', fg: '#be123c' };

/** Màu hạn: quá hạn đỏ, hôm nay cam, sắp đến hạn vàng, còn hạn xám. */
export const DUE_TONE: Record<DueTone, Omit<Tone, 'label'>> = {
  overdue: { bg: '#fff1f2', fg: '#be123c' },
  today: { bg: '#fff7ed', fg: '#c2410c' },
  soon: { bg: '#fffbeb', fg: '#b45309' },
  normal: { bg: '#f1f5f9', fg: '#475569' },
};

/** Nhóm trong mục "Cần xử lý" (thứ tự do máy chủ sắp). */
export const TODO_REASON: Record<TodoReason, string> = {
  overdue: 'Quá hạn',
  today: 'Đến hạn hôm nay',
  review: 'Chờ đồng chí duyệt, xem xét',
  returned: 'Bị trả lại, cần làm tiếp',
  soon: 'Sắp đến hạn (3 ngày)',
  new: 'Mới được giao, chưa xác nhận',
};

export const ROLE: Record<Role, string> = {
  ADMIN: 'Quản trị hệ thống',
  LEADER: 'Lãnh đạo',
  UNIT_HEAD: 'Chỉ huy đơn vị',
  STAFF: 'Cán bộ',
};

export const DATE_FORMAT = 'DD/MM/YYYY';
export const DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';

export const LEAVE_STATUS: Record<LeaveStatus, Tone> = {
  PENDING_UNIT: { label: 'Chờ chỉ huy đơn vị', bg: '#fffbeb', fg: '#b45309' },
  PENDING_LEADER: { label: 'Chờ lãnh đạo', bg: '#fff7ed', fg: '#c2410c' },
  APPROVED: { label: 'Đã duyệt', bg: '#ecfdf5', fg: '#047857' },
  REJECTED: { label: 'Không duyệt', bg: '#fff1f2', fg: '#be123c' },
  CANCELLED: { label: 'Đã rút', bg: '#f1f5f9', fg: '#64748b' },
  REVOKED: { label: 'Đã hủy duyệt', bg: '#f1f5f9', fg: '#64748b' },
};

export const DAY_PART: Record<DayPart, string> = { FULL: 'Cả ngày', MORNING: 'Buổi sáng', AFTERNOON: 'Buổi chiều' };

/** Trạng thái ngày công: nhãn, ký hiệu trên bảng công, màu. */
export const DAY_STATUS: Record<DayStatus, Tone & { short: string }> = {
  OK: { label: 'Đủ công', short: '✓', bg: '#ecfdf5', fg: '#047857' },
  LATE: { label: 'Đi muộn', short: 'M', bg: '#fffbeb', fg: '#b45309' },
  EARLY: { label: 'Về sớm', short: 'S', bg: '#fffbeb', fg: '#b45309' },
  LATE_EARLY: { label: 'Muộn và về sớm', short: 'MS', bg: '#fff7ed', fg: '#c2410c' },
  MISSING: { label: 'Thiếu lượt chấm', short: '?', bg: '#fff7ed', fg: '#c2410c' },
  ABSENT: { label: 'Vắng', short: 'V', bg: '#fff1f2', fg: '#be123c' },
  LEAVE: { label: 'Nghỉ phép', short: 'P', bg: '#eff6ff', fg: '#1d4ed8' },
  HOLIDAY: { label: 'Ngày lễ', short: 'L', bg: '#f5f3ff', fg: '#6d28d9' },
  WEEKEND: { label: 'Nghỉ hằng tuần', short: '', bg: '#f8fafc', fg: '#94a3b8' },
  PENDING: { label: 'Chưa tới / đang trong ca', short: '', bg: '#ffffff', fg: '#94a3b8' },
};

export const WEEKDAY = ['', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
