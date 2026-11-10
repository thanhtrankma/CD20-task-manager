import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Role } from './api/types';
import { useAuth } from './auth/AuthContext';
import { MainLayout } from './layouts/MainLayout';
import { AuditPage } from './pages/admin/AuditPage';
import { UnitsPage } from './pages/admin/UnitsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { MyAttendancePage } from './pages/attendance/MyAttendancePage';
import { UnitAttendancePage } from './pages/attendance/UnitAttendancePage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ChatPage } from './pages/chat/ChatPage';
import { DashboardPage } from './pages/DashboardPage';
import { HrImportPage } from './pages/hr/HrImportPage';
import { HrSettingsPage } from './pages/hr/HrSettingsPage';
import { HrStaffPage } from './pages/hr/HrStaffPage';
import { LeaveDetailPage } from './pages/leave/LeaveDetailPage';
import { LeavePage } from './pages/leave/LeavePage';
import { LoginPage } from './pages/LoginPage';
import { OvertimePage } from './pages/overtime/OvertimePage';
import { ProfilePage } from './pages/ProfilePage';
import { ReportsPage } from './pages/ReportsPage';
import { TaskDetailPage } from './pages/tasks/TaskDetailPage';
import { TasksPage } from './pages/tasks/TasksPage';
import { TwoFactorPage } from './pages/TwoFactorPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <Spin fullscreen />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.mustChangePassword) return <ChangePasswordPage forced />;
  if (me.twoFactorRequired) return <TwoFactorPage forced />;
  return children;
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { me } = useAuth();
  return me && roles.includes(me.role) ? children : <Navigate to="/" replace />;
}

/** Phụ trách nhân sự – chấm công (cờ trên tài khoản, không phải vai trò). */
function RequireHr({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  return me?.hrManager ? children : <Navigate to="/" replace />;
}

const WORKERS: Role[] = ['LEADER', 'UNIT_HEAD', 'STAFF'];

export function App() {
  const { me } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route
          index
          element={me?.role === 'ADMIN' ? <Navigate to="/admin/users" replace /> : <DashboardPage />}
        />
        <Route path="tasks" element={<RequireRole roles={WORKERS}><TasksPage /></RequireRole>} />
        <Route path="tasks/:id" element={<RequireRole roles={WORKERS}><TaskDetailPage /></RequireRole>} />
        <Route path="chat" element={<RequireRole roles={WORKERS}><ChatPage /></RequireRole>} />
        <Route path="chat/:id" element={<RequireRole roles={WORKERS}><ChatPage /></RequireRole>} />
        <Route path="reports" element={<RequireRole roles={['LEADER', 'UNIT_HEAD']}><ReportsPage /></RequireRole>} />
        <Route path="leave" element={<RequireRole roles={WORKERS}><LeavePage /></RequireRole>} />
        <Route path="leave/:id" element={<RequireRole roles={WORKERS}><LeaveDetailPage /></RequireRole>} />
        <Route path="overtime" element={<RequireRole roles={WORKERS}><OvertimePage /></RequireRole>} />
        <Route path="attendance" element={<RequireRole roles={WORKERS}><MyAttendancePage /></RequireRole>} />
        <Route path="attendance/users/:id" element={<RequireRole roles={WORKERS}><MyAttendancePage /></RequireRole>} />
        <Route path="attendance/unit" element={<RequireRole roles={WORKERS}><UnitAttendancePage /></RequireRole>} />
        <Route path="hr/import" element={<RequireHr><HrImportPage /></RequireHr>} />
        <Route path="hr/staff" element={<RequireHr><HrStaffPage /></RequireHr>} />
        <Route path="hr/settings" element={<RequireHr><HrSettingsPage /></RequireHr>} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="admin/units" element={<RequireRole roles={['ADMIN']}><UnitsPage /></RequireRole>} />
        <Route path="admin/users" element={<RequireRole roles={['ADMIN']}><UsersPage /></RequireRole>} />
        <Route path="admin/audit" element={<RequireRole roles={['ADMIN']}><AuditPage /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
