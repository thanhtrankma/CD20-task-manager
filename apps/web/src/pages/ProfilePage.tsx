import { NotificationSettings } from '../components/NotificationSettings';
import { PageHeader } from '../layouts/shell';
import { ChangePasswordPage } from './ChangePasswordPage';
import { TwoFactorPage } from './TwoFactorPage';

export function ProfilePage() {
  return (
    <>
      <PageHeader title="Tài khoản & nhắc việc" subtitle="Nhắc việc, đổi mật khẩu, xác thực hai lớp" />
      <div className="shell-content">
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 440px))' }}>
          <NotificationSettings />
          <ChangePasswordPage />
          <TwoFactorPage />
        </div>
      </div>
    </>
  );
}
