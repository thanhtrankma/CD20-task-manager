import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { OvertimeRequest, Prisma } from '../../generated/prisma/client';
import { dateOf, daysBetween, minuteOf, today, ymd } from '../../common/dates';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { HrAccessService } from '../hr/hr-access.service';
import { workdayChecker } from '../hr/leave-days';
import { WorkCalendarService } from '../hr/work-calendar.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UnitsService } from '../units/units.service';
import { CreateOvertimeDto, DecideOvertimeDto, ListOvertimeQuery } from './overtime.dto';

const INCLUDE = {
  user: { select: { id: true, fullName: true, position: true, unitId: true, unit: { select: { id: true, name: true } } } },
  approverUnit: { select: { id: true, name: true } },
  decidedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.OvertimeRequestInclude;

type Row = Prisma.OvertimeRequestGetPayload<{ include: typeof INCLUDE }>;

const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
/** Đăng ký trước tối đa, khai bù sau tối đa (ngày). */
const MAX_AHEAD = 60;
const MAX_BEHIND = 31;

/**
 * Đăng ký làm thêm giờ (ca 3, sau giờ ra ca 2). Chỉ huy đơn vị duyệt (đơn vị không có chỉ huy thì lên cấp trên;
 * tới cấp nhà trường thì lãnh đạo); lãnh đạo duyệt thay được. Chỉ giờ làm thêm đã duyệt mới được tính công.
 */
@Injectable()
export class OvertimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HrAccessService,
    private readonly calendar: WorkCalendarService,
    private readonly notifications: NotificationsService,
    private readonly units: UnitsService,
  ) {}

  async create(user: AuthUser, dto: CreateOvertimeDto) {
    this.access.assertNotAdmin(user);
    const shift = await this.calendar.shiftForUnit(user.unitId);
    if (!shift.overtimeEnabled) throw new BadRequestException('Ca làm việc của đơn vị chưa áp dụng ca làm thêm');
    const now = today();
    const ahead = daysBetween(now, dto.date);
    if (ahead > MAX_AHEAD || ahead < -MAX_BEHIND) {
      throw new BadRequestException(`Chỉ đăng ký trước tối đa ${MAX_AHEAD} ngày, khai bù tối đa ${MAX_BEHIND} ngày`);
    }
    const holidays = await this.calendar.holidays(dto.date, dto.date);
    if (!workdayChecker(shift.workdays, holidays)(dto.date)) {
      throw new BadRequestException('Ngày đăng ký phải là ngày làm việc');
    }
    const startTime = dto.startTime ?? shift.endTime;
    if (startTime < shift.endTime) throw new BadRequestException(`Làm thêm bắt đầu từ giờ ra ca 2 (${shift.endTime})`);
    if (minuteOf(dto.endTime) - minuteOf(startTime) < shift.overtimeMinMinutes) {
      throw new BadRequestException(`Làm thêm tối thiểu ${shift.overtimeMinMinutes} phút`);
    }
    const dup = await this.prisma.overtimeRequest.count({
      where: { userId: user.id, date: dateOf(dto.date), status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (dup) throw new BadRequestException(`Đã có đăng ký làm thêm ngày ${dm(dto.date)}`);

    const request = await this.prisma.overtimeRequest.create({
      data: {
        userId: user.id,
        date: dateOf(dto.date),
        startTime,
        endTime: dto.endTime,
        reason: dto.reason.trim(),
        approverUnitId: await this.access.approverUnit(user),
      },
      include: INCLUDE,
    });
    await this.notifications.notify(
      await this.access.approverIds(request.approverUnitId, user.id),
      'Có đăng ký làm thêm giờ chờ đồng chí duyệt',
      `${user.fullName}: ngày ${dm(dto.date)}, ${startTime}–${dto.endTime}`,
      '/overtime?scope=approve',
    );
    return this.view(request);
  }

  private view(r: Row) {
    return { ...r, date: ymd(r.date) };
  }

  private async canDecide(user: AuthUser, r: Pick<OvertimeRequest, 'userId' | 'status' | 'approverUnitId'>) {
    if (r.userId === user.id || r.status !== 'PENDING') return false;
    if (user.role === 'LEADER') return true;
    return r.approverUnitId != null && (await this.access.headUnits(user)).includes(r.approverUnitId);
  }

  private async findVisible(user: AuthUser, id: number): Promise<Row> {
    this.access.assertNotAdmin(user);
    const r = await this.prisma.overtimeRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!r) throw new NotFoundException('Không tìm thấy đăng ký làm thêm');
    if (r.userId === user.id || this.access.seesAll(user)) return r;
    const units = await this.access.headUnits(user);
    if (units.includes(r.user.unitId) || (r.approverUnitId != null && units.includes(r.approverUnitId))) return r;
    throw new NotFoundException('Không tìm thấy đăng ký làm thêm');
  }

  private async approveWhere(user: AuthUser): Promise<Prisma.OvertimeRequestWhereInput> {
    if (user.role === 'LEADER') return { status: 'PENDING', approverUnitId: null, userId: { not: user.id } };
    if (user.role === 'UNIT_HEAD') {
      return { status: 'PENDING', approverUnitId: { in: await this.access.headUnits(user) }, userId: { not: user.id } };
    }
    return { id: -1 };
  }

  async list(user: AuthUser, q: ListOvertimeQuery) {
    this.access.assertNotAdmin(user);
    const scope: Prisma.OvertimeRequestWhereInput =
      q.scope === 'mine'
        ? { userId: user.id }
        : q.scope === 'approve'
          ? await this.approveWhere(user)
          : { user: await this.access.userWhere(user) };
    const where: Prisma.OvertimeRequestWhereInput = {
      AND: [
        scope,
        q.status ? { status: q.status } : {},
        q.unitId ? { user: { unitId: { in: await this.units.descendantIds(q.unitId) } } } : {},
        q.q ? { user: { fullName: { contains: q.q, mode: 'insensitive' } } } : {},
        q.from ? { date: { gte: dateOf(q.from) } } : {},
        q.to ? { date: { lte: dateOf(q.to) } } : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.overtimeRequest.findMany({
        where,
        include: INCLUDE,
        orderBy: q.scope === 'approve' ? { date: 'asc' } : { date: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);
    const decidable = await Promise.all(items.map((r) => this.canDecide(user, r)));
    return {
      items: items.map((r, i) => ({
        ...this.view(r),
        permissions: { decide: decidable[i], cancel: this.canCancel(user, r) },
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async pendingCount(user: AuthUser) {
    this.access.assertNotAdmin(user);
    return { count: await this.prisma.overtimeRequest.count({ where: await this.approveWhere(user) }) };
  }

  /** Người gửi rút đăng ký đang chờ, hoặc đã duyệt nhưng chưa tới ngày. */
  private canCancel(user: AuthUser, r: Pick<OvertimeRequest, 'userId' | 'status' | 'date'>) {
    return r.userId === user.id && (r.status === 'PENDING' || (r.status === 'APPROVED' && ymd(r.date) >= today()));
  }

  async decide(user: AuthUser, id: number, dto: DecideOvertimeDto) {
    const r = await this.findVisible(user, id);
    if (r.status !== 'PENDING') throw new BadRequestException('Đăng ký này đã được xử lý');
    if (!(await this.canDecide(user, r))) {
      throw new ForbiddenException(r.userId === user.id ? 'Không tự duyệt đăng ký của mình' : 'Đồng chí không duyệt đăng ký này');
    }
    const note = dto.note?.trim() || null;
    if (dto.decision === 'REJECTED' && !note) throw new BadRequestException('Nhập lý do không duyệt');
    const { count } = await this.prisma.overtimeRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: dto.decision, decidedById: user.id, decidedAt: new Date(), decisionNote: note },
    });
    if (!count) throw new BadRequestException('Đăng ký này vừa được người khác xử lý');
    const day = ymd(r.date);
    await this.notifications.notify(
      [r.userId],
      dto.decision === 'APPROVED' ? 'Đăng ký làm thêm giờ đã được duyệt' : 'Đăng ký làm thêm giờ không được duyệt',
      note ?? `Ngày ${dm(day)}, ${r.startTime}–${r.endTime}`,
      '/overtime',
    );
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
    if (r.userId !== user.id) throw new ForbiddenException('Chỉ người đăng ký mới rút được');
    if (!this.canCancel(user, r)) throw new BadRequestException('Không rút được đăng ký này');
    await this.prisma.overtimeRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
  }
}
