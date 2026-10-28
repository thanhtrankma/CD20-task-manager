import { api } from './api/client';

/** Nhận thông báo đẩy trên thiết bị hiện tại (Web Push). */

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Đang chạy như ứng dụng đã thêm vào màn hình chính. */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Không đăng ký được service worker', err));
}

async function registration() {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  // getRegistration không treo như `ready` khi service worker chưa được đăng ký.
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const toBytes = (base64url: string) => {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

const sendToServer = (sub: PushSubscription) => {
  const json = sub.toJSON();
  return api.post('/notifications/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
};

/** Xin quyền, đăng ký với dịch vụ đẩy của trình duyệt rồi báo cho máy chủ. */
export async function enablePush(publicKey: string) {
  if (!pushSupported()) throw new Error('Trình duyệt này không hỗ trợ thông báo đẩy');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Đồng chí chưa cho phép hiển thị thông báo. Hãy bật lại trong cài đặt trình duyệt.');
  }
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) }));
  await sendToServer(sub);
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.post('/notifications/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}

/** Mỗi lần vào hệ thống: báo lại thiết bị đã đăng ký cho người đang đăng nhập (máy dùng chung, đổi khóa). */
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const sub = await currentSubscription();
  if (sub) await sendToServer(sub).catch(() => undefined);
}

/**
 * Khi đăng xuất: máy chủ ngừng gửi tới thiết bị này cho tài khoản vừa đăng xuất (máy dùng chung không nhận
 * nhắc việc của người khác). Thiết bị vẫn giữ đăng ký; lần đăng nhập sau syncPush gắn lại cho người mới.
 */
export async function detachPush() {
  const sub = await currentSubscription().catch(() => null);
  if (sub) await api.post('/notifications/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
}
