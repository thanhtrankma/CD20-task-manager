import type { Priority, Role, TaskStatus, TodoReason } from './api/types';
import type { DueTone } from './utils/due';

interface Tone {
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
  new: 'Mới được giao, chưa xác nhận nhận',
};

export const ROLE: Record<Role, string> = {
  ADMIN: 'Quản trị hệ thống',
  LEADER: 'Lãnh đạo',
  UNIT_HEAD: 'Chỉ huy đơn vị',
  STAFF: 'Cán bộ',
};

export const DATE_FORMAT = 'DD/MM/YYYY';
export const DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';
