import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from './mail.service';
import { MobilePushService } from './mobile-push.service';
import { PushService } from './push.service';

/** Nội dung gửi ra ngoài hệ thống (thông báo đẩy, thư): chỉ lời nhắc chung, không có tên, nội dung nhiệm vụ. */
export interface DeliveryMessage {
  title: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly mobile: MobilePushService,
  ) {}

  /**
   * Tạo thông báo trong hệ thống (có thể kèm tên nhiệm vụ ở `body`) và gửi lời nhắc ra điện thoại, thư.
   * `deliver: false` khi người gọi tự gộp lời nhắc (tác vụ nhắc hạn hằng ngày).
   */
  async notify(userIds: number[], title: string, body?: string, link?: string, opts: { deliver?: boolean } = {}) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return;
    await this.prisma.notification.createMany({
      data: unique.map((userId) => ({ userId, title, body, link })),
    });
    if (opts.deliver !== false) this.deliver(unique, { title, link });
  }

  /** Gửi ra ngoài không chặn request; lỗi gửi chỉ ghi log. */
  deliver(userIds: number[], message: DeliveryMessage) {
    void Promise.allSettled([
      this.push.sendToUsers(userIds, message),
      this.mobile.sendToUsers(userIds, message),
      this.mail.sendToUsers(userIds, message),
    ]).then(
      (results) =>
        results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .forEach((r) => this.logger.error('Gửi nhắc việc thất bại', r.reason)),
    );
  }

  /** Chỉ thông báo đẩy (trình duyệt, điện thoại), không gửi thư: dùng cho tin nhắn trò chuyện. */
  deliverPush(userIds: number[], message: DeliveryMessage) {
    if (!userIds.length) return;
    void Promise.allSettled([this.push.sendToUsers(userIds, message), this.mobile.sendToUsers(userIds, message)]).then(
      (results) =>
        results
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .forEach((r) => this.logger.error('Gửi thông báo tin nhắn thất bại', r.reason)),
    );
  }

  listMine(userId: number) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  unreadCount(userId: number) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  markRead(userId: number, id: number) {
    return this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  markAllRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async settings(userId: number) {
    const [user, devices, mobileDevices] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }),
      this.prisma.pushSubscription.count({ where: { userId } }),
      this.prisma.device.count({ where: { userId } }),
    ]);
    return {
      push: { enabled: this.push.enabled, publicKey: this.push.publicKey, devices },
      mobile: { enabled: this.mobile.enabled, devices: mobileDevices },
      email: { enabled: this.mail.enabled, address: user.email },
    };
  }

  /** Gắn thiết bị với người dùng hiện tại (nếu thiết bị từng đăng ký cho người khác thì chuyển sang). */
  subscribe(userId: number, sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, ...sub },
      update: { userId, p256dh: sub.p256dh, auth: sub.auth, userAgent: sub.userAgent },
    });
  }

  unsubscribe(userId: number, endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }
}
