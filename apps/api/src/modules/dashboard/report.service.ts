import { BadRequestException, Injectable } from '@nestjs/common';
import type { TaskStatus } from '../../generated/prisma/client';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskAccessService } from '../tasks/task-access.service';
import { ACTIVE_STATUSES } from '../tasks/tasks.service';

const DAY = 86_400_000;
/** Kỳ báo cáo dài nhất (tránh truy vấn quá nặng). */
const MAX_DAYS = 400;

/** 4 nhóm theo kết quả so với hạn (cách thống kê trong báo cáo kết quả thực hiện nhiệm vụ). */
export interface Counts {
  total: number;
  doneOnTime: number;
  doneLate: number;
  inProgressOnTime: number;
  inProgressLate: number;
  /** Tỷ lệ đúng hạn (%) trên số nhiệm vụ đã đến hạn hoặc đã xong; null khi chưa có nhiệm vụ nào để tính. */
  onTimeRate: number | null;
}
type Group = keyof Omit<Counts, 'total' | 'onTimeRate'>;

const empty = (): Counts => ({
  total: 0,
  doneOnTime: 0,
  doneLate: 0,
  inProgressOnTime: 0,
  inProgressLate: 0,
  onTimeRate: null,
});

function add(c: Counts, group: Group) {
  c.total++;
  c[group]++;
  const assessed = c.doneOnTime + c.doneLate + c.inProgressLate;
  c.onTimeRate = assessed ? Math.round((c.doneOnTime / assessed) * 1000) / 10 : null;
}

function groupOf(t: { status: TaskStatus; dueDate: Date; completedAt: Date | null }, now: Date): Group {
  if (t.status === 'DONE') return t.completedAt && t.completedAt > t.dueDate ? 'doneLate' : 'doneOnTime';
  return t.dueDate < now ? 'inProgressLate' : 'inProgressOnTime';
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * Thống kê kết quả thực hiện nhiệm vụ có hạn trong kỳ: tổng, theo đơn vị chủ trì, theo cá nhân chủ trì, theo tháng.
 * Phạm vi: các nhiệm vụ người xem được xem (lãnh đạo: toàn trường; chỉ huy: đơn vị mình). Không tính việc đã hủy.
 */
@Injectable()
export class ReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
  ) {}

  async report(user: AuthUser, fromIso: string, toIso: string) {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (!(from < to)) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    if (to.getTime() - from.getTime() > MAX_DAYS * DAY) throw new BadRequestException(`Kỳ báo cáo tối đa ${MAX_DAYS} ngày`);

    const tasks = await this.prisma.task.findMany({
      where: {
        AND: [await this.access.visibleWhere(user), { status: { not: 'CANCELLED' } }, { dueDate: { gte: from, lte: to } }],
      },
      select: {
        status: true,
        dueDate: true,
        completedAt: true,
        assignees: {
          where: { role: 'LEAD' },
          select: {
            unit: { select: { id: true, name: true } },
            user: { select: { id: true, fullName: true, unit: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    const now = new Date();
    const totals = empty();
    const units = new Map<number, Counts & { unitId: number; name: string }>();
    const people = new Map<number, Counts & { userId: number; fullName: string; unitName: string; active: number }>();
    const months = new Map<string, Counts & { month: string }>();

    for (const t of tasks) {
      const g = groupOf(t, now);
      add(totals, g);
      const m = monthKey(t.dueDate);
      if (!months.has(m)) months.set(m, { month: m, ...empty() });
      add(months.get(m)!, g);

      // Đơn vị chủ trì: đơn vị được giao, hoặc đơn vị của cá nhân chủ trì; mỗi đơn vị tính một lần mỗi nhiệm vụ.
      const unitIds = new Set<number>();
      for (const a of t.assignees) {
        const unit = a.unit ?? a.user?.unit;
        if (unit && !unitIds.has(unit.id)) {
          unitIds.add(unit.id);
          if (!units.has(unit.id)) units.set(unit.id, { unitId: unit.id, name: unit.name, ...empty() });
          add(units.get(unit.id)!, g);
        }
        if (a.user) {
          if (!people.has(a.user.id)) {
            people.set(a.user.id, {
              userId: a.user.id,
              fullName: a.user.fullName,
              unitName: a.user.unit.name,
              active: 0,
              ...empty(),
            });
          }
          add(people.get(a.user.id)!, g);
        }
      }
    }

    // Khối lượng hiện tại: số nhiệm vụ đang thực hiện (chủ trì) của mỗi người, không phụ thuộc kỳ.
    if (people.size) {
      const active = await this.prisma.taskAssignee.groupBy({
        by: ['userId'],
        where: { role: 'LEAD', userId: { in: [...people.keys()] }, task: { status: { in: ACTIVE_STATUSES } } },
        _count: true,
      });
      for (const a of active) people.get(a.userId!)!.active = a._count;
    }

    const byRate = <T extends Counts>(a: T, b: T) => (b.onTimeRate ?? -1) - (a.onTimeRate ?? -1) || b.total - a.total;
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals,
      byUnit: [...units.values()].sort(byRate),
      byPerson: [...people.values()].sort(byRate),
      byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    };
  }
}
