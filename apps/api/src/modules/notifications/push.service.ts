import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { env } from '../../env';
import { PrismaService } from '../../prisma/prisma.service';
import type { DeliveryMessage } from './notifications.service';

/**
 * Chỉ chấp nhận địa chỉ nhận thông báo của các dịch vụ đẩy thật (Google, Mozilla, Apple, Microsoft).
 * Không có kiểm tra này, người dùng có thể đăng ký một địa chỉ bất kỳ khiến máy chủ gửi request
 * tới mạng nội bộ (SSRF).
 */
const DEFAULT_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];
const allowedHosts = (process.env.PUSH_ALLOWED_HOSTS ?? DEFAULT_PUSH_HOSTS.join(','))
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

export function assertPushEndpoint(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new BadRequestException('Địa chỉ nhận thông báo không hợp lệ');
  }
  const host = url.hostname;
  const hostOk = allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (url.protocol !== 'https:' || !hostOk) throw new BadRequestException('Dịch vụ nhận thông báo không được hỗ trợ');
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  readonly enabled = Boolean(env.vapid.publicKey && env.vapid.privateKey);

  constructor(private readonly prisma: PrismaService) {
    if (this.enabled) {
      webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
    } else {
      this.logger.warn('Chưa cấu hình VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY: tắt thông báo đẩy');
    }
  }

  get publicKey() {
    return env.vapid.publicKey;
  }

  async sendToUsers(userIds: number[], message: DeliveryMessage) {
    if (!this.enabled || !userIds.length) return;
    const subs = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds }, user: { isActive: true } },
    });
    const payload = JSON.stringify({
      title: 'Hệ thống giao nhiệm vụ',
      body: message.title,
      url: message.link ?? '/',
      tag: message.link ?? 'general',
    });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            // timeout: dịch vụ đẩy không phản hồi thì bỏ qua, không treo việc gửi.
            { TTL: 24 * 3600, urgency: 'normal', timeout: 10_000 },
          );
          await this.prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } });
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410: trình duyệt đã hủy đăng ký hoặc gỡ ứng dụng → xóa thiết bị.
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          } else {
            this.logger.warn(`Gửi thông báo đẩy thất bại (thiết bị ${sub.id}): ${status ?? (err as Error).message}`);
          }
        }
      }),
    );
  }
}
