import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Thẻ số liệu: nhãn, biểu tượng màu, con số; có `to` thì bấm sang trang liên quan. */
export function Stat({
  label,
  value,
  icon: Icon,
  tone,
  to,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  tone: string;
  to?: string;
}) {
  const body = (
    <>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={`icon-tile ${tone}`}>
          <Icon size={20} />
        </span>
      </div>
      <span className="stat-value">{value ?? '–'}</span>
    </>
  );
  return to ? (
    <Link to={to} className="stat">
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}

