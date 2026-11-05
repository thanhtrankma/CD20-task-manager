import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitsService } from '../units/units.service';

/**
 * Ai xem được dữ liệu nghỉ phép, chấm công của ai:
 *   - mọi người: của chính mình;
 *   - chỉ huy đơn vị: người thuộc đơn vị mình và đơn vị trực thuộc;
 *   - lãnh đạo, phụ trách nhân sự: toàn trường;
 *   - quản trị: không xem (giữ nguyên tắc quản trị không xem nội dung công việc).
 */
@Injectable()
export class HrAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: UnitsService,
  ) {}

  assertNotAdmin(user: AuthUser) {
    if (user.role === 'ADMIN') throw new ForbiddenException('Quản trị hệ thống không xem dữ liệu nhân sự');
  }

  seesAll(user: AuthUser) {
    return user.role === 'LEADER' || user.hrManager;
  }

  /** Điều kiện lọc tài khoản trong phạm vi xem. */
  async userWhere(user: AuthUser): Promise<Prisma.UserWhereInput> {
    this.assertNotAdmin(user);
    if (this.seesAll(user)) return {};
    if (user.role === 'UNIT_HEAD') return { unitId: { in: await this.units.descendantIds(user.unitId) } };
    return { id: user.id };
  }

  /** Mã các đơn vị trong phạm vi xem; null = toàn trường. */
  async unitIds(user: AuthUser): Promise<number[] | null> {
    this.assertNotAdmin(user);
    if (this.seesAll(user)) return null;
    if (user.role === 'UNIT_HEAD') return this.units.descendantIds(user.unitId);
    return [];
  }

  /** Tài khoản trong phạm vi xem, không thì 404 (không lộ là có tồn tại). */
  async findVisibleUser(user: AuthUser, userId: number) {
    const target = await this.prisma.user.findFirst({
      where: { AND: [{ id: userId }, { role: { not: 'ADMIN' } }, await this.userWhere(user)] },
      select: { id: true, fullName: true, unitId: true, role: true, unit: { select: { id: true, name: true } } },
    });
    if (!target) throw new NotFoundException('Không tìm thấy cán bộ');
    return target;
  }

  /** Đơn vị trong phạm vi xem, không thì 404. */
  async assertVisibleUnit(user: AuthUser, unitId: number) {
    const ids = await this.unitIds(user);
    if (ids && !ids.includes(unitId)) throw new NotFoundException('Không tìm thấy đơn vị');
  }
}
