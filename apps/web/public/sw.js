// Service worker: nhận thông báo đẩy (Web Push) và mở đúng trang khi bấm vào thông báo.
// Không lưu đệm dữ liệu: nội dung nhiệm vụ luôn tải trực tiếp từ máy chủ sau khi đăng nhập.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Hệ thống giao nhiệm vụ', {
      body: data.body || 'Đồng chí có thông báo mới',
      icon: '/icon-192.png',
      badge: '/favicon.png',
      tag: data.tag || 'general',
      renotify: true,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ('navigate' in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
