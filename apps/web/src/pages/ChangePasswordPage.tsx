import { App, Button, Form, Input } from 'antd';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Panel } from '../layouts/shell';

interface Values {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

/** forced: hiển thị toàn màn hình khi tài khoản bắt buộc đổi mật khẩu lần đầu. */
export function ChangePasswordPage({ forced = false }: { forced?: boolean }) {
  const { message } = App.useApp();
  const { refresh, logout } = useAuth();
  const [form] = Form.useForm<Values>();

  const submit = async ({ currentPassword, newPassword }: Values) => {
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      message.success('Đã đổi mật khẩu');
      form.resetFields();
      await refresh();
    } catch (err) {
      message.error((err as Error).message);
    }
  };

  const form_ = (
      <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} size={forced ? 'large' : 'middle'}>
        <Form.Item name="currentPassword" label="Mật khẩu hiện tại" rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="Mật khẩu mới"
          extra="Ít nhất 10 ký tự, gồm cả chữ và số"
          rules={[
            { required: true },
            { min: 10, message: 'Ít nhất 10 ký tự' },
            { pattern: /(?=.*[a-zA-Z])(?=.*\d)/, message: 'Phải có cả chữ và số' },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Nhập lại mật khẩu mới"
          dependencies={['newPassword']}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator: (_, v) =>
                v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Không khớp')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block>
          Đổi mật khẩu
        </Button>
        {forced && (
          <Button type="link" block onClick={logout} style={{ marginTop: 8 }}>
            Đăng xuất
          </Button>
        )}
      </Form>
  );

  if (!forced) return <Panel title="Đổi mật khẩu">{form_}</Panel>;

  return (
    <div className="auth-page" style={{ gridTemplateColumns: '1fr' }}>
      <main className="auth-main">
        <div className="auth-card">
          <h2 className="auth-title">Đổi mật khẩu</h2>
          <p className="auth-sub">Đây là lần đăng nhập đầu tiên. Hãy đặt mật khẩu mới trước khi sử dụng hệ thống.</p>
          <div className="auth-box">{form_}</div>
        </div>
      </main>
    </div>
  );
}
