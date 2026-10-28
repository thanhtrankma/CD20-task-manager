import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { UnitsService } from '../units/units.service';

export interface AssigneeTarget {
  userId?: number;
  unitId?: number;
}

/**
 * Toàn bộ quy tắc "ai được thấy / làm gì với công việc nào" nằm ở đây.
 * Mọi service khác (tasks, submissions, files, dashboard) phải đi qua lớp này.
 */
@Injectable()
export class TaskAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: UnitsService,
  ) {}

  /** Điều kiện lọc các công việc người dùng được xem. */
  async visibleWhere(user: AuthUser): Promise<Prisma.TaskWhereInput> {
    switch (user.role) {
      case 'LEADER':
        return {};
      case 'UNIT_HEAD': {
        const unitIds = await this.units.descendantIds(user.unitId);
        return {
          OR: [
            { createdById: user.id },
            { assignees: { some: { userId: user.id } } },
            { followers: { some: { userId: user.id } } },
            { assignees: { some: { unitId: { in: unitIds } } } },
            { assignees: { some: { user: { unitId: { in: unitIds } } } } },
          ],
        };
      }
      case 'STAFF':
        return {
          OR: [
            { createdById: user.id },
            { assignees: { some: { userId: user.id } } },
            { followers: { some: { userId: user.id } } },
          ],
        };
      default:
        throw new ForbiddenException('Tài khoản quản trị không truy cập nội dung công việc');
    }
  }

  /** Trả về công việc nếu được xem; nếu không thì 404 (không tiết lộ việc có tồn tại hay không). */
  async findVisible<T extends Prisma.TaskInclude>(user: AuthUser, taskId: number, include?: T) {
    const task = await this.prisma.task.findFirst({
      where: { AND: [{ id: taskId }, await this.visibleWhere(user)] },
      include,
    });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');
    return task as Prisma.TaskGetPayload<{ include: T }>;
  }

  /** Người giao việc hoặc lãnh đạo: sửa, hủy, duyệt báo cáo, duyệt gia hạn. */
  canManage(user: AuthUser, task: { createdById: number }) {
    return user.role === 'LEADER' || task.createdById === user.id;
  }

  /** Điều kiện lọc các công việc người dùng là người thực hiện (cùng quy tắc với canWork). */
  async workWhere(user: AuthUser): Promise<Prisma.TaskWhereInput> {
    const direct = { assignees: { some: { userId: user.id } } };
    if (user.role !== 'UNIT_HEAD') return direct;
    const unitIds = await this.units.descendantIds(user.unitId);
    return { OR: [direct, { assignees: { some: { unitId: { in: unitIds } } } }] };
  }

  /** Người thực hiện: được giao trực tiếp, hoặc chỉ huy của đơn vị được giao. */
  async canWork(user: AuthUser, taskId: number) {
    const assignees = await this.prisma.taskAssignee.findMany({ where: { taskId } });
    if (assignees.some((a) => a.userId === user.id)) return true;
    if (user.role !== 'UNIT_HEAD') return false;
    const unitIds = await this.units.descendantIds(user.unitId);
    return assignees.some((a) => a.unitId !== null && unitIds.includes(a.unitId));
  }

  /** LEADER giao cho mọi nơi; UNIT_HEAD chỉ giao trong đơn vị mình và trực thuộc. */
  async assertAssignable(user: AuthUser, targets: AssigneeTarget[]) {
    for (const t of targets) {
      if (Boolean(t.userId) === Boolean(t.unitId)) {
        throw new ForbiddenException('Mỗi người nhận phải là một cá nhân hoặc một đơn vị');
      }
    }
    if (user.role === 'LEADER') return;
    if (user.role !== 'UNIT_HEAD') throw new ForbiddenException('Không có quyền giao việc');

    const unitIds = await this.units.descendantIds(user.unitId);
    const userIds = targets.filter((t) => t.userId).map((t) => t.userId!);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, unitId: true },
    });
    const ok =
      users.length === userIds.length &&
      users.every((u) => unitIds.includes(u.unitId)) &&
      targets.every((t) => !t.unitId || unitIds.includes(t.unitId));
    if (!ok) throw new ForbiddenException('Chỉ được giao việc trong phạm vi đơn vị mình');
  }

  /** Người theo dõi nhiệm vụ (nhận thông báo khi nộp, duyệt, đổi hạn, hủy). */
  async followerIds(taskId: number): Promise<number[]> {
    const rows = await this.prisma.taskFollower.findMany({ where: { taskId }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  /** Dòng người được giao mà người dùng là người thực hiện (trực tiếp, hoặc chỉ huy đơn vị được giao). */
  async workAssigneeIds(user: AuthUser, taskId: number): Promise<number[]> {
    const assignees = await this.prisma.taskAssignee.findMany({ where: { taskId } });
    const unitIds = user.role === 'UNIT_HEAD' ? await this.units.descendantIds(user.unitId) : [];
    return assignees
      .filter((a) => a.userId === user.id || (a.unitId !== null && unitIds.includes(a.unitId)))
      .map((a) => a.id);
  }

  /** Người nhận thông báo của một công việc: cá nhân được giao + chỉ huy các đơn vị được giao. */
  async recipients(taskId: number): Promise<number[]> {
    const assignees = await this.prisma.taskAssignee.findMany({ where: { taskId } });
    const unitIds = assignees.filter((a) => a.unitId).map((a) => a.unitId!);
    const heads = unitIds.length
      ? await this.prisma.user.findMany({
          where: { unitId: { in: unitIds }, role: 'UNIT_HEAD', isActive: true },
          select: { id: true },
        })
      : [];
    return [...assignees.filter((a) => a.userId).map((a) => a.userId!), ...heads.map((h) => h.id)];
  }
}
