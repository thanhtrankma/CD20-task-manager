import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(userIds: number[], title: string, body?: string, link?: string) {
    const unique = [...new Set(userIds)];
    if (!unique.length) return;
    await this.prisma.notification.createMany({
      data: unique.map((userId) => ({ userId, title, body, link })),
    });
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
}
