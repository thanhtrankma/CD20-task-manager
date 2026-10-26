import { Button, Form, Input } from 'antd';
import { BellRing, ClipboardCheck, LockKeyhole, ShieldAlert, ShieldCheck, User } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ORG } from '../config/org';

interface LoginForm {
  username: string;
  password: string;
  otp?: string;
}

const POINTS = [
  {
    icon: ClipboardCheck,
    text: 'Giao nhiệm vụ đến cơ quan, khoa, đơn vị và cá nhân: rõ người chủ trì, rõ thời hạn hoàn thành',
  },
  { icon: BellRing, text: 'Báo cáo kết quả trực tuyến; tự động đôn đốc, nhắc hạn nhiệm vụ' },
  { icon: ShieldCheck, text: 'Dữ liệu lưu trữ trong nước, xác thực hai lớp, ghi nhật ký mọi thao tác' },
];

function OrgMark({ size = 56 }: { size?: number }) {
  return (
    <div className="org-mark">
      <img src={ORG.logo} alt={`Logo ${ORG.name}`} width={size} height={size} />
      <div>
        <div className="org-parent">{ORG.parent}</div>
        <div className="org-name">{ORG.name}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const [needOtp, setNeedOtp] = useState(false);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  if (me) return <Navigate to="/" replace />;

  const submit = async (values: LoginForm) => {
    setLoading(true);
    setError(undefined);
    try {
      await login(values);
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OTP_REQUIRED') setNeedOtp(true);
      else setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-aside military">
        <div>
          <OrgMark />
          <h1>
            {ORG.systemName}
            <br />& theo dõi tiến độ
          </h1>
          <p>
            Phục vụ công tác chỉ huy, điều hành: giao nhiệm vụ, báo cáo kết quả và theo dõi tiến độ thực hiện
            của các cơ quan, khoa, đơn vị trong Nhà trường.
          </p>
          <ul className="auth-points">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon size={18} />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="auth-secret">
          <ShieldAlert size={18} />
          <span>
            <b>Hệ thống không dùng cho thông tin mật.</b> Nghiêm cấm soạn thảo, lưu trữ, truyền đưa tài liệu, thông
            tin thuộc danh mục bí mật nhà nước trên hệ thống này.
          </span>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-org">
            <OrgMark size={48} />
          </div>
          <h2 className="auth-title">Đăng nhập hệ thống</h2>
          <p className="auth-sub">
            Dành cho cán bộ, giảng viên, nhân viên Nhà trường. Tài khoản do bộ phận quản trị hệ thống cấp, không
            cho người khác sử dụng.
          </p>
          <div className="auth-box">
            {error && <div className="auth-alert error">{error}</div>}
            {needOtp && !error && (
              <div className="auth-alert info">
                Tài khoản đã bật xác thực hai lớp. Nhập mã 6 số trên ứng dụng xác thực của đồng chí.
              </div>
            )}
            <Form<LoginForm> layout="vertical" onFinish={submit} requiredMark={false} size="large">
              <Form.Item name="username" label="Tên đăng nhập" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
                <Input prefix={<User size={16} color="#94a3b8" />} autoComplete="username" autoFocus />
              </Form.Item>
              <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
                <Input.Password prefix={<LockKeyhole size={16} color="#94a3b8" />} autoComplete="current-password" />
              </Form.Item>
              {needOtp && (
                <Form.Item
                  name="otp"
                  label="Mã xác thực"
                  rules={[{ required: true, pattern: /^\d{6}$/, message: 'Mã gồm 6 chữ số' }]}
                >
                  <Input
                    className="otp-input"
                    prefix={<ShieldCheck size={16} color="#94a3b8" />}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    autoFocus
                  />
                </Form.Item>
              )}
              <Button type="primary" htmlType="submit" block loading={loading} style={{ marginTop: 8 }}>
                Đăng nhập
              </Button>
            </Form>
            <ul className="auth-rules">
              <li>Quên mật khẩu hoặc tài khoản bị khóa: báo cáo bộ phận quản trị hệ thống để được cấp lại.</li>
              <li>Đăng xuất khi rời vị trí làm việc; không lưu mật khẩu trên máy dùng chung.</li>
              <li>Mọi lần đăng nhập và thao tác đều được ghi nhật ký.</li>
            </ul>
          </div>
          <div className="notice auth-mobile-only" style={{ marginTop: 16 }}>
            <ShieldAlert size={15} />
            <span>
              Hệ thống không dùng cho thông tin mật. Nghiêm cấm soạn thảo, lưu trữ, truyền đưa thông tin thuộc
              danh mục bí mật nhà nước.
            </span>
          </div>
          <p className="auth-copy">
            {ORG.parent} · {ORG.name}
          </p>
        </div>
      </main>
    </div>
  );
}
