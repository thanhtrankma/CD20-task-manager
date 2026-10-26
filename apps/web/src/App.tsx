import { Spin } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import type { Role } from './api/types';
import { useAuth } from './auth/AuthContext';
import { MainLayout } from './layouts/MainLayout';
import { AuditPage } from './pages/admin/AuditPage';
import { UnitsPage } from './pages/admin/UnitsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { TaskDetailPage } from './pages/tasks/TaskDetailPage';
import { TasksPage } from './pages/tasks/TasksPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <Spin fullscreen />;
  if (!me) return <Navigate to="/login" replace />;
  if (me.mustChangePassword) return <ChangePasswordPage forced />;
  return children;
}

function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { me } = useAuth();
  return me && roles.includes(me.role) ? children : <Navigate to="/" replace />;
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
        <Route path="profile" element={<ProfilePage />} />
        <Route path="admin/units" element={<RequireRole roles={['ADMIN']}><UnitsPage /></RequireRole>} />
        <Route path="admin/users" element={<RequireRole roles={['ADMIN']}><UsersPage /></RequireRole>} />
        <Route path="admin/audit" element={<RequireRole roles={['ADMIN']}><AuditPage /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
