import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskAccessService } from '../tasks/task-access.service';
import { ACTIVE_STATUSES } from '../tasks/tasks.service';

const DAY = 86_400_000;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
  ) {}

  /** Số liệu tổng hợp trong phạm vi người dùng được xem. */
  async summary(user: AuthUser) {
    const visible = await this.access.visibleWhere(user);
    const now = new Date();
    const active = { status: { in: ACTIVE_STATUSES } };

    const [byStatus, overdue, dueSoon, byUnit] = await Promise.all([
      this.prisma.task.groupBy({ by: ['status'], where: visible, _count: true }),
      this.prisma.task.count({ where: { AND: [visible, active, { dueDate: { lt: now } }] } }),
      this.prisma.task.count({
        where: {
          AND: [visible, active, { dueDate: { gte: now, lt: new Date(now.getTime() + 3 * DAY) } }],
        },
      }),
      this.byUnit(user),
    ]);

    return {
      byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      overdue,
      dueSoon,
      byUnit,
    };
  }

  /** Thống kê theo đơn vị được giao (chỉ lãnh đạo). */
  private async byUnit(user: AuthUser) {
    if (user.role !== 'LEADER') return [];
    const rows = await this.prisma.taskAssignee.findMany({
      where: { unitId: { not: null } },
      select: {
        unit: { select: { id: true, name: true } },
        task: { select: { status: true, dueDate: true } },
      },
    });
    const now = new Date();
    const map = new Map<number, { unitId: number; name: string; total: number; done: number; overdue: number }>();
    for (const { unit, task } of rows) {
      if (!unit) continue;
      const s = map.get(unit.id) ?? { unitId: unit.id, name: unit.name, total: 0, done: 0, overdue: 0 };
      s.total++;
      if (task.status === 'DONE') s.done++;
      if (ACTIVE_STATUSES.includes(task.status) && task.dueDate < now) s.overdue++;
      map.set(unit.id, s);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }
}
