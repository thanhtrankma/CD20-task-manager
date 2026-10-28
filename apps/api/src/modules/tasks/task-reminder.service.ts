import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { env } from '../../env';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskAccessService } from './task-access.service';
import { ACTIVE_STATUSES } from './tasks.service';

const DAY = 86_400_000;

type Kind = 'dueSoon' | 'overdue';

/**
 * Chạy 7h sáng mỗi ngày: nhắc việc sắp đến hạn (3 ngày, 1 ngày) và báo việc vừa quá hạn.
 * Trong hệ thống: mỗi nhiệm vụ một thông báo. Ra điện thoại, thư: gộp thành một lời nhắc cho mỗi người.
 */
@Injectable()
export class TaskReminderService {
  private readonly logger = new Logger(TaskReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 7 * * *', { timeZone: env.timezone })
  async run() {
    const now = Date.now();
    const counts = new Map<number, Record<Kind, number>>();
    await this.remind(now + 2 * DAY, now + 3 * DAY, 'Còn 3 ngày đến hạn', 'dueSoon', counts);
    await this.remind(now, now + DAY, 'Còn 1 ngày đến hạn', 'dueSoon', counts);
    await this.remind(now - DAY, now, 'Nhiệm vụ đã quá hạn', 'overdue', counts, true);

    for (const [userId, c] of counts) {
      const parts = [
        c.dueSoon && `${c.dueSoon} nhiệm vụ sắp đến hạn`,
        c.overdue && `${c.overdue} nhiệm vụ quá hạn`,
      ].filter(Boolean);
      this.notifications.deliver([userId], { title: `Đồng chí có ${parts.join(', ')}`, link: '/tasks' });
    }
  }

  private async remind(
    from: number,
    to: number,
    title: string,
    kind: Kind,
    counts: Map<number, Record<Kind, number>>,
    notifyCreator = false,
  ) {
    const tasks = await this.prisma.task.findMany({
      where: { status: { in: ACTIVE_STATUSES }, dueDate: { gte: new Date(from), lt: new Date(to) } },
      select: { id: true, title: true, createdById: true },
    });
    for (const task of tasks) {
      const userIds = [...new Set(await this.access.recipients(task.id))];
      if (notifyCreator && !userIds.includes(task.createdById)) userIds.push(task.createdById);
      await this.notifications.notify(userIds, title, task.title, `/tasks/${task.id}`, { deliver: false });
      for (const id of userIds) {
        const c = counts.get(id) ?? { dueSoon: 0, overdue: 0 };
        c[kind]++;
        counts.set(id, c);
      }
    }
    if (tasks.length) this.logger.log(`${title}: ${tasks.length} nhiệm vụ`);
  }
}
