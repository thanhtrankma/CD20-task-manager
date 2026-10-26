import { Menu } from 'lucide-react';
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { NotificationBell } from './NotificationBell';

interface ShellValue {
  openSidebar: () => void;
  openCreateTask: (parentId?: number) => void;
  showNotifications: boolean;
}

export const ShellContext = createContext<ShellValue>({
  openSidebar: () => undefined,
  openCreateTask: () => undefined,
  showNotifications: false,
});

export const useShell = () => useContext(ShellContext);

/** Thanh tiêu đề của mỗi trang: nổi, bo góc trên màn hình lớn; có nút mở menu trên điện thoại. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  const { openSidebar, showNotifications } = useShell();
  return (
    <header className="page-header">
      <div className="page-header-left">
        <button type="button" className="icon-btn menu-toggle" onClick={openSidebar} aria-label="Mở menu">
          <Menu size={22} />
        </button>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="page-header-right">
        {actions}
        {showNotifications && <NotificationBell />}
      </div>
    </header>
  );
}

/** Thẻ nội dung có tiêu đề (thay cho Card của antd, cùng phong cách viền mảnh). */
export function Panel({
  title,
  extra,
  children,
  flush,
  style,
}: {
  title?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  style?: CSSProperties;
}) {
  return (
    <section className="panel" style={style}>
      {(title || extra) && (
        <div className="panel-head">
          {title && <h2 className="panel-title">{title}</h2>}
          {extra}
        </div>
      )}
      <div className={flush ? 'panel-body flush' : 'panel-body'}>{children}</div>
    </section>
  );
}
