import { Injectable } from '@nestjs/common';
import type { WorkShift } from '../../generated/prisma/client';
import { dateOf, ymd } from '../../common/dates';
import { PrismaService } from '../../prisma/prisma.service';

/** Ca dùng khi chưa khai báo ca nào. */
const FALLBACK_SHIFT: WorkShift = {
  id: 0,
  name: 'Giờ hành chính',
  startTime: '07:00',
  endTime: '17:30',
  breakStart: '11:00',
  breakEnd: '13:30',
  graceMinutes: 5,
  overtimeEnabled: true,
  overtimeMinMinutes: 30,
  workdays: [1, 2, 3, 4, 5],
  isDefault: true,
};

/** Lịch làm việc: ca của từng đơn vị (kế thừa từ đơn vị cấp trên), ngày lễ, cài đặt chung. */
@Injectable()
export class WorkCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ca áp dụng cho mọi đơn vị: ca riêng, không có thì của đơn vị cấp trên gần nhất, cuối cùng là ca mặc định. */
  async shiftsByUnit(): Promise<(unitId: number) => WorkShift> {
    const [units, shifts] = await Promise.all([
      this.prisma.unit.findMany({ select: { id: true, parentId: true, workShiftId: true } }),
      this.prisma.workShift.findMany(),
    ]);
    const byId = new Map(shifts.map((s) => [s.id, s]));
    const fallback = shifts.find((s) => s.isDefault) ?? shifts[0] ?? FALLBACK_SHIFT;
    const unit = new Map(units.map((u) => [u.id, u]));
    const cache = new Map<number, WorkShift>();
    const resolve = (unitId: number): WorkShift => {
      const hit = cache.get(unitId);
      if (hit) return hit;
      const seen = new Set<number>();
      let shift = fallback;
      for (let u = unit.get(unitId); u && !seen.has(u.id); u = u.parentId == null ? undefined : unit.get(u.parentId)) {
        seen.add(u.id);
        if (u.workShiftId && byId.has(u.workShiftId)) {
          shift = byId.get(u.workShiftId)!;
          break;
        }
      }
      cache.set(unitId, shift);
      return shift;
    };
    return resolve;
  }

  async shiftForUnit(unitId: number) {
    return (await this.shiftsByUnit())(unitId);
  }

  /** Ngày lễ trong khoảng, dạng "YYYY-MM-DD" → tên. */
  async holidays(from: string, to: string): Promise<Map<string, string>> {
    const rows = await this.prisma.holiday.findMany({ where: { date: { gte: dateOf(from), lte: dateOf(to) } } });
    return new Map(rows.map((h) => [ymd(h.date), h.name]));
  }

  async setting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return row ? (row.value as T) : fallback;
  }
}
