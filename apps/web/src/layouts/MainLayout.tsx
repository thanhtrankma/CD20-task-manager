import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Plus,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { DashboardSummary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ORG } from '../config/org';
import { ROLE } from '../constants';
import { CreateTaskModal } from '../pages/tasks/CreateTaskModal';
import { syncPush } from '../push';
import { ShellContext } from './shell';

interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

function NavGroup({ label, items, onNavigate }: { label: string; items: NavEntry[]; onNavigate: () => void }) {
  return (
    <>
      <div className="nav-group">{label}</div>
      {items.map(({ to, label: text, icon: Icon, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={onNavigate}
          className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
        >
          <Icon size={17} />
          <span>{text}</span>
          {!!badge && <span className="nav-badge">{badge}</span>}
        </NavLink>
      ))}
    </>
  );
}

export function MainLayout() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [creating, setCreating] = useState<{ parentId?: number } | null>(null);

  // Gắn lại thiết bị đã bật thông báo cho người vừa đăng nhập.
  useEffect(() => {
    if (me) void syncPush();
  }, [me?.id]);

  const isAdmin = me?.role === 'ADMIN';
  const canAssign = me?.role === 'LEADER' || me?.role === 'UNIT_HEAD';
  const { data: summary } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardSummary>('/dashboard/summary'),
    enabled: !!me && !isAdmin,
  });
  if (!me) return null;

  const activeCount =
    (summary?.byStatus.NEW ?? 0) +
    (summary?.byStatus.IN_PROGRESS ?? 0) +
    (summary?.byStatus.RETURNED ?? 0) +
    (summary?.byStatus.PENDING_REVIEW ?? 0);
  const close = () => setSidebarOpen(false);

  return (
    <ShellContext.Provider
      value={{
        openSidebar: () => setSidebarOpen(true),
        openCreateTask: (parentId) => setCreating({ parentId }),
        showNotifications: !isAdmin,
      }}
    >
      <div className="shell">
        <div className={sidebarOpen ? 'sidebar-overlay open' : 'sidebar-overlay'} onClick={close} />
        <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
          <div className="brand">
            <img className="brand-logo" src={ORG.logo} alt={`Logo ${ORG.name}`} />
            <div style={{ minWidth: 0 }}>
              <div className="brand-name">{ORG.shortName}</div>
              <div className="brand-sub">{ORG.parent}</div>
            </div>
            <button type="button" className="icon-btn sidebar-close" onClick={close} aria-label="Đóng menu">
              <X size={20} />
            </button>
          </div>

          <div className="user-card">
            <div className="avatar">{initials(me.fullName)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="user-name">{me.fullName}</div>
              <div className="user-meta">
                {ROLE[me.role]} · {me.unit.name}
              </div>
            </div>
          </div>

          {canAssign && (
            <div className="sidebar-cta">
              <button
                type="button"
                className="btn-gradient"
                onClick={() => {
                  close();
                  setCreating({});
                }}
              >
                <Plus size={16} /> Giao việc mới
              </button>
            </div>
          )}

          <nav className="nav">
            {isAdmin ? (
              <NavGroup
                label="Quản trị"
                onNavigate={close}
                items={[
                  { to: '/admin/users', label: 'Tài khoản', icon: Users },
                  { to: '/admin/units', label: 'Đơn vị', icon: Building2 },
                  { to: '/admin/audit', label: 'Nhật ký hệ thống', icon: ScrollText },
                ]}
              />
            ) : (
              <NavGroup
                label="Công việc"
                onNavigate={close}
                items={[
                  { to: '/', label: 'Tổng quan', icon: LayoutDashboard },
                  { to: '/tasks', label: 'Danh sách công việc', icon: ClipboardList, badge: activeCount },
                ]}
              />
            )}
            <NavGroup
              label="Cá nhân"
              onNavigate={close}
              items={[{ to: '/profile', label: 'Tài khoản & nhắc việc', icon: ShieldCheck }]}
            />
          </nav>

          <div className="sidebar-foot">
            <div className="notice">
              <ShieldAlert size={15} />
              <span>Không soạn thảo, lưu trữ thông tin thuộc bí mật nhà nước trên hệ thống.</span>
            </div>
            <button
              type="button"
              className="logout"
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
            >
              <LogOut size={17} /> Đăng xuất
            </button>
          </div>
        </aside>

        <main className="shell-main">
          <Outlet />
        </main>
      </div>
      <CreateTaskModal
        open={creating !== null}
        parentId={creating?.parentId}
        onClose={() => setCreating(null)}
      />
    </ShellContext.Provider>
  );
}
