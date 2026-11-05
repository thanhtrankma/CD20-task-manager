import { Injectable } from '@nestjs/common';
import { dateOf } from '../../common/dates';
import { PrismaService } from '../../prisma/prisma.service';

/** Số ngày phép năm khi tài khoản chưa có đối tượng, chưa được khai báo riêng. */
export const DEFAULT_ANNUAL_DAYS = 12;

export interface BalanceSummary {
  year: number;
  /** Số ngày được hưởng trong năm. */
  entitled: number;
  /** Nguồn số ngày được hưởng: khai báo riêng, theo đối tượng, hoặc mặc định. */
  source: 'custom' | 'category' | 'default';
  category: string | null;
  carried: number;
  /** Đã nghỉ: đơn đã duyệt thuộc loại trừ quỹ phép, bắt đầu trong năm. */
  used: number;
  /** Đang chờ duyệt (chưa trừ). */
  pending: number;
  /** Còn lại = được hưởng + tồn − đã nghỉ − đang chờ. */
  remaining: number;
  note: string | null;
}

@Injectable()
export class LeaveBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async summaries(userIds: number[], year: number): Promise<Map<number, BalanceSummary>> {
    const [users, balances, requests] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, staffCategory: { select: { name: true, annualDays: true } } },
      }),
      this.prisma.leaveBalance.findMany({ where: { userId: { in: userIds }, year } }),
      this.prisma.leaveRequest.groupBy({
        by: ['userId', 'status'],
        where: {
          userId: { in: userIds },
          status: { in: ['APPROVED', 'PENDING_UNIT', 'PENDING_LEADER'] },
          type: { deductsBalance: true },
          startDate: { gte: dateOf(`${year}-01-01`), lte: dateOf(`${year}-12-31`) },
        },
        _sum: { days: true },
      }),
    ]);
    const balance = new Map(balances.map((b) => [b.userId, b]));
    const result = new Map<number, BalanceSummary>();
    for (const u of users) {
      const b = balance.get(u.id);
      const source = b?.entitledDays != null ? 'custom' : u.staffCategory ? 'category' : 'default';
      const entitled = b?.entitledDays ?? u.staffCategory?.annualDays ?? DEFAULT_ANNUAL_DAYS;
      let used = 0;
      let pending = 0;
      for (const r of requests) {
        if (r.userId !== u.id) continue;
        if (r.status === 'APPROVED') used += r._sum.days ?? 0;
        else pending += r._sum.days ?? 0;
      }
      const carried = b?.carriedDays ?? 0;
      result.set(u.id, {
        year,
        entitled,
        source,
        category: u.staffCategory?.name ?? null,
        carried,
        used,
        pending,
        remaining: entitled + carried - used - pending,
        note: b?.note ?? null,
      });
    }
    return result;
  }

  async summary(userId: number, year: number) {
    return (await this.summaries([userId], year)).get(userId)!;
  }
}
