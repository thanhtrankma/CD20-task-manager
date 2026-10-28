import { useMutation } from '@tanstack/react-query';
import { App, Alert, Button, Form, Input, Space, Typography } from 'antd';
import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Panel } from '../layouts/shell';

/** forced: hiển thị toàn màn hình khi vai trò bắt buộc xác thực hai lớp nhưng tài khoản chưa bật. */
export function TwoFactorPage({ forced = false }: { forced?: boolean }) {
  const { message } = App.useApp();
  const { me, refresh, logout } = useAuth();
  const [qr, setQr] = useState<string>();

  const setup = useMutation({
    mutationFn: () => api.post<{ qrDataUrl: string }>('/auth/2fa/setup'),
    onSuccess: (d) => setQr(d.qrDataUrl),
    onError: (e) => message.error(e.message),
  });
  const enable = useMutation({
    mutationFn: (code: string) => api.post('/auth/2fa/enable', { code }),
    onSuccess: async () => {
      message.success('Đã bật xác thực hai lớp');
      setQr(undefined);
      await refresh();
    },
    onError: (e) => message.error(e.message),
  });
  const disable = useMutation({
    mutationFn: (v: { password: string; code: string }) => api.post('/auth/2fa/disable', v),
    onSuccess: async () => {
      message.success('Đã tắt xác thực hai lớp');
      await refresh();
    },
    onError: (e) => message.error(e.message),
  });

  if (me?.totpEnabled) {
    return (
      <Panel title="Xác thực hai lớp">
        <Alert type="success" showIcon title="Đang bật" style={{ marginBottom: 16 }} />
        {me.twoFactorMandatory ? (
          <Typography.Text type="secondary">
            Vai trò của đồng chí bắt buộc dùng xác thực hai lớp. Khi đổi hoặc mất điện thoại, đề nghị quản trị hệ
            thống đặt lại.
          </Typography.Text>
        ) : (
          <Form layout="vertical" onFinish={(v) => disable.mutate(v)}>
            <Form.Item name="password" label="Mật khẩu" rules={[{ required: true }]}>
              <Input.Password />
            </Form.Item>
            <Form.Item name="code" label="Mã xác thực" rules={[{ required: true, pattern: /^\d{6}$/ }]}>
              <Input />
            </Form.Item>
            <Button danger htmlType="submit" loading={disable.isPending}>
              Tắt xác thực hai lớp
            </Button>
          </Form>
        )}
      </Panel>
    );
  }

  const content = !qr ? (
    <Space orientation="vertical">
      <Typography.Text>
        Khi đăng nhập cần thêm mã 6 số từ ứng dụng xác thực trên điện thoại (Google Authenticator, Microsoft
        Authenticator...).
      </Typography.Text>
      <Button type="primary" onClick={() => setup.mutate()} loading={setup.isPending} block={forced}>
        Bật xác thực hai lớp
      </Button>
    </Space>
  ) : (
    <Form layout="vertical" onFinish={(v: { code: string }) => enable.mutate(v.code)} requiredMark={false}>
      <Typography.Paragraph>1. Cài ứng dụng xác thực, quét mã QR:</Typography.Paragraph>
      <img src={qr} alt="Mã QR xác thực hai lớp" width={200} height={200} />
      <Form.Item
        name="code"
        label="2. Nhập mã 6 số hiển thị trong ứng dụng"
        rules={[{ required: true, pattern: /^\d{6}$/, message: 'Mã gồm 6 chữ số' }]}
      >
        <Input autoComplete="one-time-code" inputMode="numeric" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={enable.isPending} block={forced}>
        Xác nhận
      </Button>
    </Form>
  );

  if (!forced) return <Panel title="Xác thực hai lớp">{content}</Panel>;

  return (
    <div className="auth-page" style={{ gridTemplateColumns: '1fr' }}>
      <main className="auth-main">
        <div className="auth-card">
          <h2 className="auth-title">Bật xác thực hai lớp</h2>
          <p className="auth-sub">
            Tài khoản chỉ huy, quản trị bắt buộc dùng xác thực hai lớp để bảo vệ thông tin của Nhà trường.
          </p>
          <div className="auth-box">
            {content}
            <Button type="link" block onClick={logout} style={{ marginTop: 8 }}>
              Đăng xuất
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
