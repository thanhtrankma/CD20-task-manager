import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { LeaveRequest, LeaveStatus, Prisma } from '../../generated/prisma/client';
import { LEAVE_ESCALATE_DAYS } from '../../cli/hr-defaults';
import { dateOf, daysBetween, eachDay, today, ymd } from '../../common/dates';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { HrAccessService } from '../hr/hr-access.service';
import { LeaveBalanceService } from '../hr/leave-balance.service';
import { countLeaveDays, invalidParts, leavePartOn, workdayChecker, type LeaveSpan } from '../hr/leave-days';
import { WorkCalendarService } from '../hr/work-calendar.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UnitsService } from '../units/units.service';
import { AbsentQuery, BalanceQuery, CreateLeaveDto, DecideLeaveDto, LeaveSpanDto, ListLeaveQuery } from './leave.dto';

const PENDING: LeaveStatus[] = ['PENDING_UNIT', 'PENDING_LEADER'];
const person = { select: { id: true, fullName: true, position: true } } as const;
const INCLUDE = {
  user: { select: { id: true, fullName: true, position: true, unitId: true, unit: { select: { id: true, name: true } } } },
  type: { select: { id: true, name: true, deductsBalance: true } },
  approverUnit: { select: { id: true, name: true } },
  unitDecidedBy: person,
  leaderDecidedBy: person,
  revokedBy: person,
} satisfies Prisma.LeaveRequestInclude;

type Row = Prisma.LeaveRequestGetPayload<{ include: typeof INCLUDE }>;

const span = (r: LeaveRequest): LeaveSpan => ({
  start: ymd(r.startDate),
  end: ymd(r.endDate),
  startPart: r.startPart,
  endPart: r.endPart,
});

const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const period = (s: LeaveSpan) => (s.start === s.end ? dm(s.start) : `${dm(s.start)} – ${dm(s.end)}`);

/**
 * Đơn nghỉ phép. Người duyệt cấp 1 là chỉ huy đơn vị của người gửi (đơn vị không có chỉ huy, hoặc người gửi là chỉ huy:
 * lên đơn vị cấp trên). Nghỉ quá ngưỡng ngày, hoặc lên tới cấp nhà trường: lãnh đạo duyệt. Không ai tự duyệt đơn mình.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HrAccessService,
    private readonly calendar: WorkCalendarService,
    private readonly balances: LeaveBalanceService,
    private readonly notifications: NotificationsService,
    private readonly units: UnitsService,
  ) {}

  // ---------- Gửi đơn ----------

  /** Số ngày làm việc của một khoảng nghỉ theo ca, ngày lễ của đơn vị người gửi. */
  async countDays(unitId: number, s: LeaveSpan) {
    const [shift, holidays] = await Promise.all([this.calendar.shiftForUnit(unitId), this.calendar.holidays(s.start, s.end)]);
    return countLeaveDays(s, workdayChecker(shift.workdays, holidays));
  }

  /** Kiểm tra loại nghỉ, khoảng ngày; tính số ngày. Dùng cho gửi đơn và xem trước. */
  private async prepare(user: AuthUser, dto: LeaveSpanDto) {
    this.access.assertNotAdmin(user);
    const type = await this.prisma.leaveType.findUnique({ where: { id: dto.typeId } });
    if (!type?.isActive) throw new BadRequestException('Loại nghỉ không hợp lệ');
    const startPart = dto.startPart ?? 'FULL';
    const s: LeaveSpan = {
      start: dto.startDate,
      end: dto.endDate,
      startPart,
      endPart: dto.startDate === dto.endDate ? startPart : (dto.endPart ?? 'FULL'),
    };
    const invalid = invalidParts(s);
    if (invalid) throw new BadRequestException(invalid);
    if (daysBetween(s.start, s.end) > 366) throw new BadRequestException('Mỗi đơn nghỉ tối đa một năm');
    const days = await this.countDays(user.unitId, s);
    if (!days) throw new BadRequestException('Khoảng thời gian đã chọn không có ngày làm việc nào');
    return { type, s, days };
  }

  /** Xem trước khi gửi: số ngày tính, phép năm còn lại (loại trừ quỹ). */
  async preview(user: AuthUser, dto: LeaveSpanDto) {
    const { type, s, days } = await this.prepare(user, dto);
    const remaining = type.deductsBalance
      ? (await this.balances.summary(user.id, Number(s.start.slice(0, 4)))).remaining
      : null;
    return { days, deductsBalance: type.deductsBalance, remaining };
  }

  async create(user: AuthUser, dto: CreateLeaveDto) {
    const { type, s, days } = await this.prepare(user, dto);
    await this.assertNoOverlap(user.id, s);
    if (type.deductsBalance) {
      const b = await this.balances.summary(user.id, Number(s.start.slice(0, 4)));
      if (b.remaining < days) {
        throw new BadRequestException(`Phép năm ${b.year} còn ${b.remaining} ngày, không đủ cho ${days} ngày nghỉ`);
      }
    }

    const approverUnitId = await this.access.approverUnit(user);
    const threshold = Number(await this.calendar.setting(LEAVE_ESCALATE_DAYS, 3));
    const request = await this.prisma.leaveRequest.create({
      data: {
        userId: user.id,
        typeId: type.id,
        startDate: dateOf(s.start),
        endDate: dateOf(s.end),
        startPart: s.startPart,
        endPart: s.endPart,
        days,
        reason: dto.reason.trim(),
        approverUnitId,
        needsLeader: approverUnitId === null || days > threshold,
        status: approverUnitId ? 'PENDING_UNIT' : 'PENDING_LEADER',
      },
    });
    await this.notifyApprovers(request, user.fullName);
    return this.detail(user, request.id);
  }

  /** Không trùng ngày với đơn đang chờ hoặc đã duyệt (cùng ngày được một đơn buổi sáng, một đơn buổi chiều). */
  private async assertNoOverlap(userId: number, s: LeaveSpan) {
    const others = await this.prisma.leaveRequest.findMany({
      where: {
        userId,
        status: { in: [...PENDING, 'APPROVED'] },
        startDate: { lte: dateOf(s.end) },
        endDate: { gte: dateOf(s.start) },
      },
    });
    for (const o of others) {
      const os = span(o);
      for (const day of eachDay(s.start > os.start ? s.start : os.start, s.end < os.end ? s.end : os.end)) {
        const a = leavePartOn(s, day);
        const b = leavePartOn(os, day);
        if (a && b && (a === 'FULL' || b === 'FULL' || a === b)) {
          throw new BadRequestException(`Trùng ngày ${dm(day)} với đơn nghỉ ${period(os)} đã gửi`);
        }
      }
    }
  }

  /** Người được thông báo có đơn chờ duyệt ở bước hiện tại. */
  private approverIds(r: Pick<LeaveRequest, 'status' | 'approverUnitId' | 'userId'>) {
    return this.access.approverIds(r.status === 'PENDING_UNIT' ? r.approverUnitId : null, r.userId);
  }

  private async notifyApprovers(r: LeaveRequest, fullName: string) {
    const s = span(r);
    await this.notifications.notify(
      await this.approverIds(r),
      'Có đơn nghỉ phép chờ đồng chí duyệt',
      `${fullName}: ${r.days} ngày (${period(s)})`,
      `/leave/${r.id}`,
    );
  }

  // ---------- Xem ----------

  private headUnits(user: AuthUser) {
    return this.access.headUnits(user);
  }

  private async permissions(user: AuthUser, r: Row) {
    const mine = r.userId === user.id;
    const units = await this.headUnits(user);
    const decide =
      !mine &&
      ((r.status === 'PENDING_UNIT' &&
        (user.role === 'LEADER' || (r.approverUnitId != null && units.includes(r.approverUnitId)))) ||
        (r.status === 'PENDING_LEADER' && user.role === 'LEADER'));
    const revoke =
      !mine &&
      r.status === 'APPROVED' &&
      (user.role === 'LEADER' || user.hrManager || units.includes(r.user.unitId));
    return { decide, cancel: mine && PENDING.includes(r.status), revoke };
  }

  private async findVisible(user: AuthUser, id: number): Promise<Row> {
    this.access.assertNotAdmin(user);
    const r = await this.prisma.leaveRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!r) throw new NotFoundException('Không tìm thấy đơn nghỉ');
    if (r.userId === user.id || this.access.seesAll(user)) return r;
    const units = await this.headUnits(user);
    if (units.includes(r.user.unitId) || (r.approverUnitId != null && units.includes(r.approverUnitId))) return r;
    throw new NotFoundException('Không tìm thấy đơn nghỉ');
  }

  private view(r: Row) {
    return { ...r, startDate: ymd(r.startDate), endDate: ymd(r.endDate) };
  }

  async detail(user: AuthUser, id: number) {
    const r = await this.findVisible(user, id);
    return { ...this.view(r), permissions: await this.permissions(user, r) };
  }

  private async approveWhere(user: AuthUser): Promise<Prisma.LeaveRequestWhereInput> {
    if (user.role === 'LEADER') return { status: 'PENDING_LEADER', userId: { not: user.id } };
    if (user.role === 'UNIT_HEAD') {
      return { status: 'PENDING_UNIT', approverUnitId: { in: await this.headUnits(user) }, userId: { not: user.id } };
    }
    return { id: -1 };
  }

  async list(user: AuthUser, q: ListLeaveQuery) {
    this.access.assertNotAdmin(user);
    const scope: Prisma.LeaveRequestWhereInput =
      q.scope === 'mine'
        ? { userId: user.id }
        : q.scope === 'approve'
          ? await this.approveWhere(user)
          : { user: await this.access.userWhere(user) };
    const where: Prisma.LeaveRequestWhereInput = {
      AND: [
        scope,
        q.status ? { status: q.status } : {},
        q.typeId ? { typeId: q.typeId } : {},
        q.unitId ? { user: { unitId: { in: await this.units.descendantIds(q.unitId) } } } : {},
        q.q ? { user: { fullName: { contains: q.q, mode: 'insensitive' } } } : {},
        q.from ? { endDate: { gte: dateOf(q.from) } } : {},
        q.to ? { startDate: { lte: dateOf(q.to) } } : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        include: INCLUDE,
        orderBy: q.scope === 'approve' ? { createdAt: 'asc' } : { startDate: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);
    return { items: items.map((r) => this.view(r)), total, page: q.page, pageSize: q.pageSize };
  }

  /** Số đơn chờ mình duyệt (số trên menu). */
  async pendingCount(user: AuthUser) {
    this.access.assertNotAdmin(user);
    return { count: await this.prisma.leaveRequest.count({ where: await this.approveWhere(user) }) };
  }

  async balance(user: AuthUser, q: BalanceQuery) {
    this.access.assertNotAdmin(user);
    const userId = q.userId ?? user.id;
    if (userId !== user.id) await this.access.findVisibleUser(user, userId);
    return this.balances.summary(userId, q.year ?? Number(today().slice(0, 4)));
  }

  /** Người trong phạm vi xem có đơn đã duyệt giao với khoảng from–to (gợi ý khi giao việc). */
  async absent(user: AuthUser, q: AbsentQuery) {
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        status: 'APPROVED',
        startDate: { lte: dateOf(q.to) },
        endDate: { gte: dateOf(q.from) },
        user: await this.access.userWhere(user),
      },
      select: { userId: true, startDate: true, endDate: true },
      orderBy: { startDate: 'asc' },
    });
    return rows.map((r) => ({ userId: r.userId, startDate: ymd(r.startDate), endDate: ymd(r.endDate) }));
  }

  // ---------- Xử lý ----------

  async decide(user: AuthUser, id: number, dto: DecideLeaveDto) {
    const r = await this.findVisible(user, id);
    if (!PENDING.includes(r.status)) throw new BadRequestException('Đơn này đã được xử lý');
    if (!(await this.permissions(user, r)).decide) {
      throw new ForbiddenException(r.userId === user.id ? 'Không tự duyệt đơn của mình' : 'Đồng chí không duyệt đơn ở bước này');
    }
    const note = dto.note?.trim() || null;
    if (dto.decision === 'REJECTED' && !note) throw new BadRequestException('Nhập lý do không duyệt');

    const now = new Date();
    const atUnit = r.status === 'PENDING_UNIT' && user.role !== 'LEADER';
    const decider = atUnit ? { unitDecidedById: user.id, unitDecidedAt: now } : { leaderDecidedById: user.id, leaderDecidedAt: now };
    const next: LeaveStatus = dto.decision === 'REJECTED' ? 'REJECTED' : atUnit && r.needsLeader ? 'PENDING_LEADER' : 'APPROVED';
    const { count } = await this.prisma.leaveRequest.updateMany({
      where: { id, status: r.status },
      data: { status: next, ...decider, ...(note ? { decisionNote: note } : {}) },
    });
    if (!count) throw new BadRequestException('Đơn này vừa được người khác xử lý');

    if (next === 'PENDING_LEADER') {
      await this.notifyApprovers({ ...r, status: next }, r.user.fullName);
    } else {
      await this.notifications.notify(
        [r.userId],
        next === 'APPROVED' ? 'Đơn nghỉ phép đã được duyệt' : 'Đơn nghỉ phép không được duyệt',
        note ?? `${r.type.name}: ${period(span(r))}`,
        `/leave/${id}`,
      );
    }
  }

  async approveMany(user: AuthUser, ids: number[]) {
    const failed: { id: number; message: string }[] = [];
    let approved = 0;
    for (const id of ids) {
      try {
        await this.decide(user, id, { decision: 'APPROVED' });
        approved++;
      } catch (err) {
        failed.push({ id, message: err instanceof Error ? err.message : 'Lỗi' });
      }
    }
    return { approved, failed };
  }

  async cancel(user: AuthUser, id: number) {
    const r = await this.findVisible(user, id);
    if (r.userId !== user.id) throw new ForbiddenException('Chỉ người gửi mới rút được đơn');
    const { count } = await this.prisma.leaveRequest.updateMany({
      where: { id, status: { in: PENDING } },
      data: { status: 'CANCELLED' },
    });
    if (!count) throw new BadRequestException('Đơn đã xử lý xong, không rút được');
  }

  /** Hủy đơn đã duyệt (ví dụ người nghỉ đi làm lại sớm): ngày phép được hoàn lại. */
  async revoke(user: AuthUser, id: number, note: string) {
    const r = await this.findVisible(user, id);
    if (!(await this.permissions(user, r)).revoke) {
      throw new ForbiddenException(r.status === 'APPROVED' ? 'Đồng chí không hủy được đơn này' : 'Chỉ hủy được đơn đã duyệt');
    }
    const { count } = await this.prisma.leaveRequest.updateMany({
      where: { id, status: 'APPROVED' },
      data: { status: 'REVOKED', revokedById: user.id, revokedAt: new Date(), decisionNote: note.trim() },
    });
    if (!count) throw new BadRequestException('Đơn này vừa được người khác xử lý');
    await this.notifications.notify([r.userId], 'Đơn nghỉ phép đã bị hủy duyệt', note.trim(), `/leave/${id}`);
  }
}
