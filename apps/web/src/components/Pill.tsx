import type { Priority, TaskStatus } from '../api/types';
import { DUE_TONE, OVERDUE, PRIORITY, STATUS } from '../constants';
import { dueInfo } from '../utils/due';

export function Pill({ tone }: { tone: { label: string; bg: string; fg: string } }) {
  return (
    <span className="pill" style={{ background: tone.bg, color: tone.fg }}>
      {tone.label}
    </span>
  );
}

export const StatusPill = ({ status }: { status: TaskStatus }) => <Pill tone={STATUS[status]} />;
export const PriorityPill = ({ priority }: { priority: Priority }) => <Pill tone={PRIORITY[priority]} />;
export const OverduePill = () => <Pill tone={OVERDUE} />;

/** Hạn tương đối có màu ("Trễ 2 ngày", "Còn 3 ngày"); di chuột xem ngày cụ thể. */
export function DueTag({ dueDate, status }: { dueDate: string; status: TaskStatus }) {
  const due = dueInfo(dueDate, status);
  if (!due.tone) return <span className="muted">{due.date}</span>;
  return (
    <span className="pill" title={`Hạn ${due.date}`} style={{ background: DUE_TONE[due.tone].bg, color: DUE_TONE[due.tone].fg }}>
      {due.label}
    </span>
  );
}
