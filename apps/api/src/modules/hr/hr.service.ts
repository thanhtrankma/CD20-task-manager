import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { dateOf, today, ymd } from '../../common/dates';
import { PrismaService } from '../../prisma/prisma.service';
import { LEAVE_ESCALATE_DAYS } from '../../cli/hr-defaults';
import {
  BalanceDto,
  CategoryDto,
  HolidayDto,
  LeaveTypeDto,
  RolloverDto,
  SettingsDto,
  ShiftDto,
  StaffImportRow,
  StaffQuery,
  UpdateCategoryDto,
  UpdateLeaveTypeDto,
  UpdateStaffDto,
} from './hr.dto';
import { LeaveBalanceService } from './leave-balance.service';
import { WorkCalendarService } from './work-calendar.service';

const thisYear = () => Number(today().slice(0, 4));

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: WorkCalendarService,
    private readonly balances: LeaveBalanceService,
  ) {}

  /** Danh mục dùng chung: loại nghỉ, đối tượng, ca, cài đặt. Ai đăng nhập (trừ quản trị) cũng xem được. */
  async catalog() {
    const [categories, leaveTypes, shifts, units, leaveEscalateDays] = await Promise.all([
      this.prisma.staffCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      this.prisma.leaveType.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
      this.prisma.workShift.findMany({ orderBy: { id: 'asc' } }),
      this.prisma.unit.findMany({ where: { workShiftId: { not: null } }, select: { id: true, workShiftId: true } }),
      this.calendar.setting(LEAVE_ESCALATE_DAYS, 3),
    ]);
    return { categories, leaveTypes, shifts, unitShifts: units, settings: { leaveEscalateDays } };
  }

  // ---------- Đối tượng ----------

  async createCategory(dto: CategoryDto) {
    return this.unique(() => this.prisma.staffCategory.create({ data: dto }), 'Tên đối tượng đã có');
  }

  async updateCategory(id: number, dto: UpdateCategoryDto) {
    await this.exists(this.prisma.staffCategory.findUnique({ where: { id } }), 'đối tượng');
    return this.unique(() => this.prisma.staffCategory.update({ where: { id }, data: dto }), 'Tên đối tượng đã có');
  }

  async deleteCategory(id: number) {
    await this.exists(this.prisma.staffCategory.findUnique({ where: { id } }), 'đối tượng');
    const users = await this.prisma.user.count({ where: { staffCategoryId: id } });
    if (users) throw new BadRequestException(`Còn ${users} cán bộ thuộc đối tượng này; chuyển sang đối tượng khác trước`);
    await this.prisma.staffCategory.delete({ where: { id } });
  }

  // ---------- Loại nghỉ ----------

  async createLeaveType(dto: LeaveTypeDto) {
    const sortOrder = await this.prisma.leaveType.count();
    return this.unique(() => this.prisma.leaveType.create({ data: { ...dto, sortOrder } }), 'Mã loại nghỉ đã có');
  }

  async updateLeaveType(id: number, dto: UpdateLeaveTypeDto) {
    await this.exists(this.prisma.leaveType.findUnique({ where: { id } }), 'loại nghỉ');
    return this.prisma.leaveType.update({ where: { id }, data: dto });
  }

  // ---------- Ngày lễ ----------

  async listHolidays(year: number) {
    const rows = await this.prisma.holiday.findMany({
      where: { date: { gte: dateOf(`${year}-01-01`), lte: dateOf(`${year}-12-31`) } },
      orderBy: { date: 'asc' },
    });
    return rows.map((h) => ({ id: h.id, date: ymd(h.date), name: h.name }));
  }

  async createHoliday(dto: HolidayDto) {
    const h = await this.unique(
      () => this.prisma.holiday.create({ data: { date: dateOf(dto.date), name: dto.name } }),
      'Ngày này đã là ngày lễ',
    );
    return { id: h.id, date: ymd(h.date), name: h.name };
  }

  async deleteHoliday(id: number) {
    await this.exists(this.prisma.holiday.findUnique({ where: { id } }), 'ngày lễ');
    await this.prisma.holiday.delete({ where: { id } });
  }

  // ---------- Ca làm việc ----------

  private checkShift(dto: ShiftDto) {
    if (!(dto.startTime < dto.breakStart && dto.breakStart <= dto.breakEnd && dto.breakEnd < dto.endTime)) {
      throw new BadRequestException('Giờ phải theo thứ tự: vào < bắt đầu nghỉ trưa ≤ hết nghỉ trưa < ra');
    }
    return { ...dto, workdays: [...new Set(dto.workdays)].sort() };
  }

  async createShift(dto: ShiftDto) {
    const data = this.checkShift(dto);
    const first = !(await this.prisma.workShift.count());
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.workShift.updateMany({ data: { isDefault: false } });
      return tx.workShift.create({ data: { ...data, isDefault: data.isDefault || first } });
    });
  }

  async updateShift(id: number, dto: ShiftDto) {
    const shift = await this.exists(this.prisma.workShift.findUnique({ where: { id } }), 'ca làm việc');
    const data = this.checkShift(dto);
    if (shift.isDefault && data.isDefault === false) {
      throw new BadRequestException('Chọn ca khác làm mặc định thay vì bỏ mặc định ở ca này');
    }
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.workShift.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      return tx.workShift.update({ where: { id }, data: { ...data, isDefault: data.isDefault ?? shift.isDefault } });
    });
  }

  async deleteShift(id: number) {
    const shift = await this.exists(this.prisma.workShift.findUnique({ where: { id } }), 'ca làm việc');
    if (shift.isDefault) throw new BadRequestException('Không xóa ca mặc định');
    await this.prisma.workShift.delete({ where: { id } });
  }

  async setUnitShift(unitId: number, workShiftId: number | null) {
    await this.exists(this.prisma.unit.findUnique({ where: { id: unitId } }), 'đơn vị');
    if (workShiftId) await this.exists(this.prisma.workShift.findUnique({ where: { id: workShiftId } }), 'ca làm việc');
    await this.prisma.unit.update({ where: { id: unitId }, data: { workShiftId } });
  }

  async updateSettings(dto: SettingsDto) {
    await this.prisma.appSetting.upsert({
      where: { key: LEAVE_ESCALATE_DAYS },
      update: { value: dto.leaveEscalateDays },
      create: { key: LEAVE_ESCALATE_DAYS, value: dto.leaveEscalateDays },
    });
    return { leaveEscalateDays: dto.leaveEscalateDays };
  }

  // ---------- Cán bộ: đối tượng, mã chấm công, quỹ phép ----------

  async staff(query: StaffQuery) {
    const year = query.year ?? thisYear();
    const users = await this.prisma.user.findMany({
      where: {
        role: { not: 'ADMIN' },
        isActive: true,
        ...(query.unitId ? { unitId: query.unitId } : {}),
        ...(query.q
          ? {
              OR: [
                { fullName: { contains: query.q, mode: 'insensitive' } },
                { username: { contains: query.q, mode: 'insensitive' } },
                { attendanceCode: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        position: true,
        role: true,
        attendanceCode: true,
        staffCategoryId: true,
        unit: { select: { id: true, name: true } },
      },
      orderBy: [{ unitId: 'asc' }, { fullName: 'asc' }],
    });
    const summaries = await this.balances.summaries(
      users.map((u) => u.id),
      year,
    );
    return users.map((u) => ({ ...u, balance: summaries.get(u.id)! }));
  }

  async updateStaff(userId: number, dto: UpdateStaffDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role === 'ADMIN') throw new NotFoundException('Không tìm thấy cán bộ');
    if (dto.staffCategoryId) await this.exists(this.prisma.staffCategory.findUnique({ where: { id: dto.staffCategoryId } }), 'đối tượng');
    const code = dto.attendanceCode === undefined ? undefined : dto.attendanceCode?.trim() || null;
    if (code) await this.assertCodeFree(code, userId);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { staffCategoryId: dto.staffCategoryId, attendanceCode: code },
      }),
      // Lượt chấm đã nhập trước khi ghép mã: gắn luôn vào tài khoản.
      ...(code ? [this.prisma.attendancePunch.updateMany({ where: { code }, data: { userId } })] : []),
    ]);
  }

  private async assertCodeFree(code: string, userId: number) {
    const owner = await this.prisma.user.findUnique({ where: { attendanceCode: code }, select: { id: true, fullName: true } });
    if (owner && owner.id !== userId) throw new ConflictException(`Mã chấm công ${code} đã gán cho ${owner.fullName}`);
  }

  /** Ghép mã chấm công, đối tượng từ tệp: kiểm tra hết trước, có lỗi thì không ghi dòng nào. */
  async importStaff(rows: StaffImportRow[]) {
    const [users, categories] = await Promise.all([
      this.prisma.user.findMany({
        where: { username: { in: rows.map((r) => r.username.trim().toLowerCase()) }, role: { not: 'ADMIN' } },
        select: { id: true, username: true },
      }),
      this.prisma.staffCategory.findMany(),
    ]);
    const userByName = new Map(users.map((u) => [u.username, u.id]));
    const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
    const codes = rows.map((r) => r.attendanceCode?.trim()).filter((c): c is string => !!c);
    const owners = new Map(
      (await this.prisma.user.findMany({ where: { attendanceCode: { in: codes } }, select: { id: true, attendanceCode: true } })).map(
        (u) => [u.attendanceCode!, u.id],
      ),
    );

    const errors: { row: number; message: string }[] = [];
    const seenCodes = new Map<string, number>();
    const plan = rows.map((r, i) => {
      const row = i + 2;
      const userId = userByName.get(r.username.trim().toLowerCase());
      if (!userId) errors.push({ row, message: `Không có tài khoản "${r.username}"` });
      const code = r.attendanceCode?.trim() || undefined;
      if (code) {
        if (seenCodes.has(code)) errors.push({ row, message: `Mã ${code} trùng với dòng ${seenCodes.get(code)}` });
        seenCodes.set(code, row);
        const owner = owners.get(code);
        if (owner && owner !== userId) errors.push({ row, message: `Mã ${code} đã gán cho tài khoản khác` });
      }
      const categoryName = r.category?.trim();
      const staffCategoryId = categoryName ? categoryByName.get(categoryName.toLowerCase()) : undefined;
      if (categoryName && !staffCategoryId) errors.push({ row, message: `Không có đối tượng "${categoryName}"` });
      return { userId: userId!, code, staffCategoryId };
    });
    if (errors.length) throw new BadRequestException({ message: 'Tệp có lỗi, chưa ghi dòng nào', errors });

    await this.prisma.$transaction(async (tx) => {
      // Gỡ mã cũ của những người sắp nhận mã mới trước, để đổi mã chéo nhau không vướng ràng buộc duy nhất.
      const recoded = plan.filter((p) => p.code).map((p) => p.userId);
      await tx.user.updateMany({ where: { id: { in: recoded } }, data: { attendanceCode: null } });
      for (const p of plan) {
        await tx.user.update({
          where: { id: p.userId },
          data: { attendanceCode: p.code, staffCategoryId: p.staffCategoryId },
        });
        if (p.code) await tx.attendancePunch.updateMany({ where: { code: p.code }, data: { userId: p.userId } });
      }
    });
    return { updated: plan.length };
  }

  async setBalance(userId: number, dto: BalanceDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.role === 'ADMIN') throw new NotFoundException('Không tìm thấy cán bộ');
    const data = { entitledDays: dto.entitledDays ?? null, carriedDays: dto.carriedDays, note: dto.note ?? null };
    await this.prisma.leaveBalance.upsert({
      where: { userId_year: { userId, year: dto.year } },
      update: data,
      create: { userId, year: dto.year, ...data },
    });
    return this.balances.summary(userId, dto.year);
  }

  /** Khởi tạo quỹ phép năm mới: phép còn năm trước (không tính đơn đang chờ) chuyển sang, tối đa maxCarry ngày. */
  async rollover(dto: RolloverDto) {
    const users = await this.prisma.user.findMany({ where: { role: { not: 'ADMIN' }, isActive: true }, select: { id: true } });
    const ids = users.map((u) => u.id);
    const prev = await this.balances.summaries(ids, dto.year - 1);
    await this.prisma.$transaction(
      ids.map((userId) => {
        const p = prev.get(userId)!;
        const carriedDays = Math.min(Math.max(p.remaining + p.pending, 0), dto.maxCarry);
        return this.prisma.leaveBalance.upsert({
          where: { userId_year: { userId, year: dto.year } },
          update: { carriedDays },
          create: { userId, year: dto.year, carriedDays },
        });
      }),
    );
    return { users: ids.length };
  }

  // ---------- Hỗ trợ ----------

  private async exists<T>(query: Promise<T | null>, what: string): Promise<T> {
    const row = await query;
    if (!row) throw new NotFoundException(`Không tìm thấy ${what}`);
    return row;
  }

  private async unique<T>(fn: () => Promise<T>, message: string): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException(message);
      throw err;
    }
  }
}
