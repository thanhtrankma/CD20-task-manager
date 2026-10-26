import type { Priority, TaskStatus } from '../api/types';
import { OVERDUE, PRIORITY, STATUS } from '../constants';

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
