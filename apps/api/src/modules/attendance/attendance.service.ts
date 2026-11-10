import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { WorkShift } from '../../generated/prisma/client';
import { addDays, dateOf, daysBetween, eachDay, isoWeekday, localDayMinute, localDayStart, today, ymd } from '../../common/dates';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { HrAccessService } from '../hr/hr-access.service';
import { leavePartOn } from '../hr/leave-days';
import { WorkCalendarService } from '../hr/work-calendar.service';
import { UnitsService } from '../units/units.service';
import { calcDay, summarize, type DayResult } from './attendance-calc';
import { ImportPunchesDto, RangeQuery, UnitQuery } from './attendance.dto';

const MAX_PERSONAL_DAYS = 400;
const MAX_UNIT_DAYS = 62;

/** Khoảng mặc định: tháng hiện tại. */
function range(q: RangeQuery, maxDays: number) {
  const now = today();
  const from = q.from ?? `${now.slice(0, 7)}-01`;
  const to = q.to ?? addDays(`${addDays(`${now.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);
  if (from > to) throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
  if (daysBetween(from, to) >= maxDays) throw new BadRequestException(`Xem tối đa ${maxDays} ngày một lần`);
  return { from, to };
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HrAccessService,
    private readonly calendar: WorkCalendarService,
    private readonly units: UnitsService,
  ) {}

  // ---------- Nhập dữ liệu ----------

  /** Nhập lượt chấm từ tệp: trùng (cùng mã, cùng thời điểm) thì bỏ qua, nên nhập lại một tệp không sinh trùng. */
  async importPunches(user: AuthUser, dto: ImportPunchesDto) {
    const rows = dto.punches.map((p, i) => {
      const at = new Date(p.at);
      if (Number.isNaN(at.getTime()) || at.getFullYear() < 2000 || at.getTime() > Date.now() + 86_400_000) {
        throw new BadRequestException({ message: 'Thời điểm chấm không hợp lệ', errors: [{ row: i + 1, message: p.at }] });
      }
      return { code: p.code.trim(), punchedAt: at, seq: p.seq };
    });
    // Lượt trùng mã, trùng thời điểm (người chấm 6 lần, tệp chỉ ghi đến phút): đánh số để không bị coi là trùng.
    const seen = new Map<string, number>();
    for (const r of rows) {
      const key = `${r.code}|${r.punchedAt.getTime()}`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      r.seq ??= n;
    }
    const codes = [...new Set(rows.map((r) => r.code))];
    const owners = new Map(
      (await this.prisma.user.findMany({ where: { attendanceCode: { in: codes } }, select: { id: true, attendanceCode: true } })).map(
        (u) => [u.attendanceCode!, u.id],
      ),
    );
    if (dto.importId) {
      const prev = await this.prisma.attendanceImport.findUnique({ where: { id: dto.importId } });
      if (!prev || prev.uploadedById !== user.id) throw new ForbiddenException('Không nối tiếp được lần nhập này');
    }
    const times = rows.map((r) => r.punchedAt.getTime());
    const rangeFrom = new Date(Math.min(...times));
    const rangeTo = new Date(Math.max(...times));

    return this.prisma.$transaction(async (tx) => {
      const imp = dto.importId
        ? await tx.attendanceImport.findUniqueOrThrow({ where: { id: dto.importId } })
        : await tx.attendanceImport.create({
            data: { fileName: dto.fileName, uploadedById: user.id, total: 0, inserted: 0, duplicates: 0, unmatched: 0 },
          });
      const { count } = await tx.attendancePunch.createMany({
        data: rows.map((r) => ({ ...r, userId: owners.get(r.code) ?? null, importId: imp.id })),
        skipDuplicates: true,
      });
      const unmatched = rows.filter((r) => !owners.has(r.code)).length;
      return tx.attendanceImport.update({
        where: { id: imp.id },
        data: {
          total: imp.total + rows.length,
          inserted: imp.inserted + count,
          duplicates: imp.duplicates + rows.length - count,
          unmatched: imp.unmatched + unmatched,
          rangeFrom: imp.rangeFrom && imp.rangeFrom < rangeFrom ? imp.rangeFrom : rangeFrom,
          rangeTo: imp.rangeTo && imp.rangeTo > rangeTo ? imp.rangeTo : rangeTo,
        },
      });
    });
  }

  imports() {
    return this.prisma.attendanceImport.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }

  /** Mã có lượt chấm nhưng chưa ghép với tài khoản nào. */
  async unmatched() {
    const rows = await this.prisma.attendancePunch.groupBy({
      by: ['code'],
      where: { userId: null },
      _count: { _all: true },
      _min: { punchedAt: true },
      _max: { punchedAt: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => ({ code: r.code, count: r._count._all, first: r._min.punchedAt, last: r._max.punchedAt }));
  }

  // ---------- Xem công ----------

  /** Bảng công từng ngày cho một nhóm người (cùng khoảng ngày). */
  private async compute(users: { id: number; unitId: number }[], from: string, to: string) {
    const ids = users.map((u) => u.id);
    const [punches, leaves, holidays, shiftOf, overtimes] = await Promise.all([
      this.prisma.attendancePunch.findMany({
        where: { userId: { in: ids }, punchedAt: { gte: localDayStart(from), lt: localDayStart(addDays(to, 1)) } },
        select: { userId: true, punchedAt: true },
        orderBy: { punchedAt: 'asc' },
      }),
      this.prisma.leaveRequest.findMany({
        where: { userId: { in: ids }, status: 'APPROVED', startDate: { lte: dateOf(to) }, endDate: { gte: dateOf(from) } },
        include: { type: { select: { name: true } } },
      }),
      this.calendar.holidays(from, to),
      this.calendar.shiftsByUnit(),
      this.prisma.overtimeRequest.findMany({
        where: { userId: { in: ids }, status: 'APPROVED', date: { gte: dateOf(from), lte: dateOf(to) } },
        select: { userId: true, date: true, startTime: true, endTime: true },
      }),
    ]);
    const overtimeOf = new Map(overtimes.map((o) => [`${o.userId}|${ymd(o.date)}`, { start: o.startTime, end: o.endTime }]));
    const byUserDay = new Map<string, number[]>();
    for (const p of punches) {
      const { day, minute } = localDayMinute(p.punchedAt);
      const key = `${p.userId}|${day}`;
      byUserDay.set(key, [...(byUserDay.get(key) ?? []), minute]);
    }
    const now = localDayMinute(new Date());
    const days = eachDay(from, to);
    const result = new Map<number, { shift: WorkShift; days: DayResult[] }>();
    for (const u of users) {
      const shift = shiftOf(u.unitId);
      const mine = leaves
        .filter((l) => l.userId === u.id)
        .map((l) => ({ type: l.type.name, span: { start: ymd(l.startDate), end: ymd(l.endDate), startPart: l.startPart, endPart: l.endPart } }));
      result.set(u.id, {
        shift,
        days: days.map((day) => {
          // Sáng, chiều cùng ngày là hai đơn: gộp thành nghỉ cả ngày.
          const parts = mine.flatMap((l) => {
            const part = leavePartOn(l.span, day);
            return part ? [{ part, type: l.type }] : [];
          });
          const leave = parts.length > 1 ? { part: 'FULL' as const, type: parts[0].type } : parts[0];
          const key = `${u.id}|${day}`;
          return calcDay({
            day,
            minutes: byUserDay.get(key) ?? [],
            shift,
            holiday: holidays.get(day),
            leave,
            overtime: overtimeOf.get(key),
            now,
          });
        }),
      });
    }
    return result;
  }

  async person(user: AuthUser, userId: number, q: RangeQuery) {
    this.access.assertNotAdmin(user);
    const { from, to } = range(q, MAX_PERSONAL_DAYS);
    const target =
      userId === user.id
        ? await this.prisma.user.findUniqueOrThrow({
            where: { id: userId },
            select: { id: true, fullName: true, unitId: true, role: true, unit: { select: { id: true, name: true } } },
          })
        : await this.access.findVisibleUser(user, userId);
    const extra = await this.prisma.user.findUniqueOrThrow({ where: { id: target.id }, select: { attendanceCode: true } });
    const { shift, days } = (await this.compute([target], from, to)).get(target.id)!;
    return { from, to, user: { ...target, attendanceCode: extra.attendanceCode }, shift, days, summary: summarize(days) };
  }

  async unit(user: AuthUser, q: UnitQuery) {
    const { from, to } = range(q, MAX_UNIT_DAYS);
    if (user.role === 'STAFF' && !user.hrManager) throw new ForbiddenException('Chức năng dành cho chỉ huy đơn vị');
    const unitId = q.unitId ?? (this.access.seesAll(user) ? undefined : user.unitId);
    if (unitId) await this.access.assertVisibleUnit(user, unitId);
    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          await this.access.userWhere(user),
          { role: { not: 'ADMIN' }, isActive: true },
          unitId ? { unitId: { in: await this.units.descendantIds(unitId) } } : {},
          q.q ? { fullName: { contains: q.q, mode: 'insensitive' } } : {},
        ],
      },
      select: {
        id: true,
        fullName: true,
        position: true,
        unitId: true,
        attendanceCode: true,
        unit: { select: { id: true, name: true } },
      },
      orderBy: [{ unitId: 'asc' }, { fullName: 'asc' }],
    });
    const computed = await this.compute(users, from, to);
    const holidays = await this.calendar.holidays(from, to);
    return {
      from,
      to,
      days: eachDay(from, to).map((day) => ({ day, weekday: isoWeekday(day), holiday: holidays.get(day) ?? null })),
      rows: users.map((u) => {
        const c = computed.get(u.id)!;
        return { user: u, shift: c.shift.name, days: c.days, summary: summarize(c.days) };
      }),
    };
  }
}
