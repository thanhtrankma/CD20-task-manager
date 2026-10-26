import { useMutation } from '@tanstack/react-query';
import { App, Alert, Button, Form, Input, Space, Typography } from 'antd';
import { useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, Panel } from '../layouts/shell';
import { ChangePasswordPage } from './ChangePasswordPage';

function TwoFactorCard() {
  const { message } = App.useApp();
  const { me, refresh } = useAuth();
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
      </Panel>
    );
  }

  return (
    <Panel title="Xác thực hai lớp">
      {!qr ? (
        <Space orientation="vertical">
          <Typography.Text>
            Tăng bảo mật: khi đăng nhập cần thêm mã 6 số từ ứng dụng xác thực (Google Authenticator,
            Microsoft Authenticator...).
          </Typography.Text>
          <Button type="primary" onClick={() => setup.mutate()} loading={setup.isPending}>
            Bật xác thực hai lớp
          </Button>
        </Space>
      ) : (
        <Form layout="vertical" onFinish={(v: { code: string }) => enable.mutate(v.code)}>
          <Typography.Paragraph>1. Quét mã QR bằng ứng dụng xác thực:</Typography.Paragraph>
          <img src={qr} alt="Mã QR xác thực hai lớp" width={200} height={200} />
          <Form.Item
            name="code"
            label="2. Nhập mã 6 số hiển thị trong ứng dụng"
            rules={[{ required: true, pattern: /^\d{6}$/, message: 'Mã gồm 6 chữ số' }]}
          >
            <Input autoComplete="one-time-code" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={enable.isPending}>
            Xác nhận
          </Button>
        </Form>
      )}
    </Panel>
  );
}

export function ProfilePage() {
  return (
    <>
      <PageHeader title="Bảo mật tài khoản" subtitle="Đổi mật khẩu và bật xác thực hai lớp" />
      <div className="shell-content">
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 440px))' }}>
          <ChangePasswordPage />
          <TwoFactorCard />
        </div>
      </div>
    </>
  );
}
