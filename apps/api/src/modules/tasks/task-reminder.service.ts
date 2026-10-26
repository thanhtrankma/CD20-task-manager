import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { env } from '../../env';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskAccessService } from './task-access.service';
import { ACTIVE_STATUSES } from './tasks.service';

const DAY = 86_400_000;

/** Chạy 7h sáng mỗi ngày: nhắc việc sắp đến hạn (3 ngày, 1 ngày) và báo việc vừa quá hạn. */
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
    await this.remind(now + 2 * DAY, now + 3 * DAY, 'Còn 3 ngày đến hạn');
    await this.remind(now, now + DAY, 'Còn 1 ngày đến hạn');
    await this.remind(now - DAY, now, 'Công việc đã quá hạn', true);
  }

  private async remind(from: number, to: number, title: string, notifyCreator = false) {
    const tasks = await this.prisma.task.findMany({
      where: { status: { in: ACTIVE_STATUSES }, dueDate: { gte: new Date(from), lt: new Date(to) } },
      select: { id: true, title: true, createdById: true },
    });
    for (const task of tasks) {
      const userIds = await this.access.recipients(task.id);
      if (notifyCreator) userIds.push(task.createdById);
      await this.notifications.notify(userIds, title, task.title, `/tasks/${task.id}`);
    }
    if (tasks.length) this.logger.log(`${title}: ${tasks.length} công việc`);
  }
}
