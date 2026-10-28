import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, Space, Typography } from 'antd';
import { BellOff, BellRing, Mail, Send, Share, SquarePlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Me, NotificationSettings as Settings } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Panel } from '../layouts/shell';
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupported } from '../push';

type DeviceState = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

/** Trạng thái nhận thông báo đẩy của thiết bị đang dùng. */
export function usePushDevice() {
  const [state, setState] = useState<DeviceState>('loading');
  const refresh = async () => {
    if (isIOS() && !isStandalone()) return setState('ios-install');
    if (!pushSupported()) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    setState((await currentSubscription()) ? 'on' : 'off');
  };
  useEffect(() => {
    void refresh();
  }, []);
  return { state, refresh };
}

export const useNotificationSettings = () =>
  useQuery({ queryKey: ['notification-settings'], queryFn: () => api.get<Settings>('/notifications/settings') });

function IosInstallGuide() {
  return (
    <Alert
      type="info"
      showIcon
      title="Trên iPhone, cần thêm hệ thống vào màn hình chính để nhận thông báo"
      description={
        <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>
            Mở trang này bằng <b>Safari</b>, bấm nút Chia sẻ <Share size={13} style={{ verticalAlign: -2 }} />.
          </li>
          <li>
            Chọn <b>Thêm vào MH chính</b> <SquarePlus size={13} style={{ verticalAlign: -2 }} />, rồi bấm Thêm.
          </li>
          <li>Mở hệ thống từ biểu tượng trên màn hình chính, đăng nhập và bật thông báo tại đây.</li>
        </ol>
      }
    />
  );
}

export function NotificationSettings() {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const { me } = useAuth();
  const { data } = useNotificationSettings();
  const device = usePushDevice();
  const [busy, setBusy] = useState(false);

  const refreshAll = async () => {
    await device.refresh();
    await qc.invalidateQueries({ queryKey: ['notification-settings'] });
  };

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) await enablePush(data!.push.publicKey);
      else await disablePush();
      message.success(on ? 'Đã bật thông báo trên thiết bị này' : 'Đã tắt thông báo trên thiết bị này');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
      await refreshAll();
    }
  };

  const saveEmail = useMutation({
    mutationFn: (email: string) => api.patch<Me>('/auth/profile', { email: email.trim() || null }),
    onSuccess: async () => {
      message.success('Đã lưu địa chỉ thư');
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.invalidateQueries({ queryKey: ['notification-settings'] });
    },
    onError: (e) => message.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => api.post('/notifications/test'),
    onSuccess: () => message.success('Đã gửi thông báo thử. Kiểm tra điện thoại và hộp thư.'),
    onError: (e) => message.error(e.message),
  });

  if (!data) return <Panel title="Nhắc việc">Đang tải…</Panel>;

  return (
    <Panel title="Nhắc việc">
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Text type="secondary">
          Hệ thống nhắc khi đồng chí được giao nhiệm vụ, có báo cáo cần duyệt, nhiệm vụ sắp đến hạn hoặc quá hạn. Lời
          nhắc không chứa nội dung nhiệm vụ; đồng chí đăng nhập để xem chi tiết.
        </Typography.Text>

        <div>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            <BellRing size={16} style={{ verticalAlign: -2 }} /> Thông báo trên thiết bị này
          </Typography.Title>
          {!data.push.enabled ? (
            <Alert type="warning" showIcon title="Máy chủ chưa bật thông báo đẩy. Liên hệ quản trị hệ thống." />
          ) : device.state === 'ios-install' ? (
            <IosInstallGuide />
          ) : device.state === 'unsupported' ? (
            <Alert type="warning" showIcon title="Trình duyệt này không hỗ trợ thông báo đẩy. Hãy dùng Chrome, Edge, Firefox hoặc Safari mới." />
          ) : device.state === 'denied' ? (
            <Alert
              type="error"
              showIcon
              title="Trình duyệt đang chặn thông báo của hệ thống"
              description="Mở cài đặt trang web (biểu tượng ổ khóa cạnh địa chỉ), cho phép Thông báo rồi tải lại trang."
            />
          ) : device.state === 'on' ? (
            <Space wrap>
              <Alert type="success" showIcon title="Đang bật" style={{ padding: '4px 12px' }} />
              <Button icon={<BellOff size={15} />} loading={busy} onClick={() => toggle(false)}>
                Tắt trên thiết bị này
              </Button>
            </Space>
          ) : (
            <Button type="primary" icon={<BellRing size={15} />} loading={busy || device.state === 'loading'} onClick={() => toggle(true)}>
              Bật thông báo trên thiết bị này
            </Button>
          )}
          <div className="muted" style={{ marginTop: 6 }}>
            Đang nhận trên {data.push.devices} thiết bị. Bật trên từng máy tính, điện thoại đồng chí sử dụng.
            {!!data.mobile?.devices && <> Ứng dụng "Giao nhiệm vụ": {data.mobile.devices} điện thoại.</>}
          </div>
        </div>

        <div>
          <Typography.Title level={5}>
            <Mail size={16} style={{ verticalAlign: -2 }} /> Thư điện tử
          </Typography.Title>
          {!data.email.enabled && (
            <Alert type="warning" showIcon title="Máy chủ chưa cấu hình gửi thư." style={{ marginBottom: 8 }} />
          )}
          <Form
            layout="inline"
            initialValues={{ email: me?.email ?? '' }}
            onFinish={(v: { email: string }) => saveEmail.mutate(v.email)}
            style={{ rowGap: 8 }}
          >
            <Form.Item name="email" rules={[{ type: 'email', message: 'Địa chỉ thư không hợp lệ' }]} style={{ flex: 1, minWidth: 220 }}>
              <Input placeholder="Địa chỉ thư nội bộ (để trống = không nhận)" allowClear />
            </Form.Item>
            <Button htmlType="submit" loading={saveEmail.isPending}>
              Lưu
            </Button>
          </Form>
        </div>

        <Button icon={<Send size={15} />} onClick={() => test.mutate()} loading={test.isPending}>
          Gửi thông báo thử
        </Button>
      </Space>
    </Panel>
  );
}

const DISMISS_KEY = 'push-banner-dismissed';

/** Lời mời bật nhắc việc ở trang Tổng quan, cho tới khi thiết bị đã bật hoặc người dùng ẩn đi. */
export function EnablePushBanner() {
  const { message } = App.useApp();
  const { data } = useNotificationSettings();
  const device = usePushDevice();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);

  if (dismissed || !data?.push.enabled || !['off', 'ios-install'].includes(device.state)) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* trình duyệt chặn lưu trữ: chỉ ẩn trong phiên này */
    }
    setDismissed(true);
  };

  const enable = async () => {
    setBusy(true);
    try {
      await enablePush(data.push.publicKey);
      message.success('Đã bật nhắc việc trên thiết bị này');
      await device.refresh();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="push-banner">
      <span className="icon-tile tone-blue">
        <BellRing size={20} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>Bật nhắc việc trên thiết bị này</div>
        <div className="muted">
          {device.state === 'ios-install'
            ? 'Trên iPhone: thêm hệ thống vào màn hình chính để nhận thông báo khi được giao nhiệm vụ.'
            : 'Nhận thông báo ngay khi được giao nhiệm vụ, có báo cáo cần duyệt hoặc nhiệm vụ sắp đến hạn.'}
        </div>
      </div>
      {device.state === 'ios-install' ? (
        <Button href="/profile">Xem hướng dẫn</Button>
      ) : (
        <Button type="primary" loading={busy} onClick={enable}>
          Bật ngay
        </Button>
      )}
      <Button type="text" aria-label="Ẩn" icon={<BellOff size={15} />} onClick={dismiss} title="Không nhắc lại" />
    </div>
  );
}
