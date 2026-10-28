import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TaskStatus } from '../../generated/prisma/client';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskAccessService } from './task-access.service';
import { TaskActivityService } from './task-activity.service';
import {
  CreateTaskDto,
  ExtensionDecisionDto,
  ExtensionRequestDto,
  ListTasksQuery,
  ProgressDto,
  UpdateTaskDto,
} from './tasks.dto';

export const ACTIVE_STATUSES: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'PENDING_REVIEW', 'RETURNED'];
const CLOSED_STATUSES: TaskStatus[] = ['DONE', 'CANCELLED'];

const PERSON = { select: { id: true, fullName: true } } as const;

const LIST_INCLUDE = {
  createdBy: PERSON,
  assignees: {
    include: { user: PERSON, unit: { select: { id: true, name: true } }, acknowledgedBy: PERSON },
  },
  // Báo cáo, đề nghị gia hạn đang chờ: để duyệt nhanh ngay trên danh sách.
  submissions: {
    where: { status: 'PENDING' },
    select: { id: true, createdAt: true, submittedBy: PERSON },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
  extensionRequests: {
    where: { status: 'PENDING' },
    select: { id: true, newDueDate: true, reason: true, requestedBy: PERSON },
    take: 1,
  },
} satisfies Prisma.TaskInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  parent: { select: { id: true, title: true } },
  children: {
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      progress: true,
      createdBy: PERSON,
      assignees: { select: { role: true, user: PERSON, unit: { select: { id: true, name: true } }, acknowledgedAt: true } },
    },
    orderBy: { dueDate: 'asc' },
  },
  updates: { include: { user: PERSON }, orderBy: { createdAt: 'desc' } },
  submissions: {
    include: {
      submittedBy: PERSON,
      reviewer: PERSON,
      attachments: { select: { id: true, originalName: true, size: true } },
    },
    orderBy: { createdAt: 'desc' },
  },
  attachments: {
    where: { submissionId: null },
    select: { id: true, originalName: true, size: true, createdAt: true },
  },
  comments: { include: { user: PERSON }, orderBy: { createdAt: 'asc' } },
  extensionRequests: { include: { requestedBy: PERSON, decidedBy: PERSON }, orderBy: { createdAt: 'desc' } },
  followers: { include: { user: PERSON }, orderBy: { createdAt: 'asc' } },
  activities: { include: { user: PERSON }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TaskInclude;

const withOverdue = <T extends { dueDate: Date; status: TaskStatus }>(task: T) => ({
  ...task,
  overdue: ACTIVE_STATUSES.includes(task.status) && task.dueDate < new Date(),
});

const DAY = 86_400_000;
/** "Sắp đến hạn": còn không quá 3 ngày (cùng mốc với nhắc hạn hằng ngày). */
const SOON_DAYS = 3;
/** Việc người thực hiện còn phải làm (Chờ duyệt là đang chờ người giao). */
const WORKING: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'RETURNED'];

/** Số lần người giao được đôn đốc một nhiệm vụ mỗi ngày (tránh làm phiền). */
export const MAX_NUDGES_PER_DAY = 3;

/** Lý do một công việc nằm trong mục "Cần xử lý", theo thứ tự cần ưu tiên. */
export const TODO_REASONS = ['overdue', 'today', 'review', 'returned', 'soon', 'new'] as const;
export type TodoReason = (typeof TODO_REASONS)[number];

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
    private readonly notifications: NotificationsService,
    private readonly activity: TaskActivityService,
  ) {}

  async list(user: AuthUser, query: ListTasksQuery) {
    const where: Prisma.TaskWhereInput = {
      AND: [
        await this.access.visibleWhere(user),
        query.status ? { status: query.status } : {},
        query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {},
        query.view === 'assigned' ? await this.access.workWhere(user) : {},
        query.view === 'created' ? { createdById: user.id } : {},
        query.view === 'review' ? this.reviewWhere(user) : {},
        query.view === 'following' ? { followers: { some: { userId: user.id } } } : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);
    return { items: items.map(withOverdue), total, page: query.page, pageSize: query.pageSize };
  }

  /**
   * Mục "Cần xử lý": việc mình thực hiện đã quá hạn, đến hạn hôm nay, sắp đến hạn, mới giao, bị trả lại;
   * và việc mình giao đang chờ mình duyệt. Mỗi việc kèm lý do để giao diện nhóm lại.
   */
  async todo(user: AuthUser) {
    const now = new Date();
    const soon = new Date(now.getTime() + SOON_DAYS * DAY);
    const [working, toReview] = await Promise.all([
      this.prisma.task.findMany({
        where: { AND: [await this.todoWorkWhere(user, soon)] },
        include: LIST_INCLUDE,
        orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
        take: 200,
      }),
      this.prisma.task.findMany({
        where: this.reviewWhere(user),
        include: LIST_INCLUDE,
        orderBy: [{ dueDate: 'asc' }, { id: 'desc' }],
        take: 200,
      }),
    ]);

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999); // Múi giờ máy chủ: TZ=Asia/Ho_Chi_Minh
    const reasonOf = (t: { dueDate: Date; status: TaskStatus }): TodoReason => {
      if (t.dueDate < now) return 'overdue';
      if (t.dueDate <= endOfToday) return 'today';
      if (t.status === 'RETURNED') return 'returned';
      if (t.dueDate <= soon) return 'soon';
      return 'new';
    };
    const seen = new Set<number>();
    const items = [
      ...toReview.map((t) => ({ ...withOverdue(t), reason: 'review' as TodoReason })),
      ...working.map((t) => ({ ...withOverdue(t), reason: reasonOf(t) })),
    ].filter((t) => !seen.has(t.id) && seen.add(t.id));
    items.sort(
      (a, b) =>
        TODO_REASONS.indexOf(a.reason) - TODO_REASONS.indexOf(b.reason) ||
        a.dueDate.getTime() - b.dueDate.getTime(),
    );
    return { items };
  }

  /** Số việc hiển thị trên menu và các mục của "Việc của tôi". */
  async counts(user: AuthUser) {
    const now = new Date();
    const soon = new Date(now.getTime() + SOON_DAYS * DAY);
    const active = { status: { in: ACTIVE_STATUSES } };
    const [working, review, assigned, created, following] = await Promise.all([
      this.prisma.task.count({ where: await this.todoWorkWhere(user, soon) }),
      this.prisma.task.count({ where: this.reviewWhere(user) }),
      this.prisma.task.count({ where: { AND: [await this.access.workWhere(user), active] } }),
      this.prisma.task.count({ where: { createdById: user.id, ...active } }),
      this.prisma.task.count({ where: { followers: { some: { userId: user.id } }, ...active } }),
    ]);
    return { todo: working + review, review, assigned, created, following };
  }

  /** Việc mình thực hiện cần làm ngay: quá hạn, sắp đến hạn, mới giao (chưa bắt đầu) hoặc bị trả lại. */
  private async todoWorkWhere(user: AuthUser, soon: Date): Promise<Prisma.TaskWhereInput> {
    return {
      AND: [
        await this.access.workWhere(user),
        { status: { in: WORKING } },
        { OR: [{ dueDate: { lte: soon } }, { status: { in: ['NEW', 'RETURNED'] } }] },
      ],
    };
  }

  /** Báo cáo hoặc đề nghị gia hạn đang chờ chính người giao việc xử lý. */
  private reviewWhere(user: AuthUser): Prisma.TaskWhereInput {
    return {
      createdById: user.id,
      OR: [
        { status: 'PENDING_REVIEW' },
        { status: { in: ACTIVE_STATUSES }, extensionRequests: { some: { status: 'PENDING' } } },
      ],
    };
  }

  async get(user: AuthUser, id: number) {
    const task = await this.access.findVisible(user, id, DETAIL_INCLUDE);
    const workIds = await this.access.workAssigneeIds(user, id);
    return {
      ...withOverdue(task),
      permissions: {
        manage: this.access.canManage(user, task),
        work: await this.access.canWork(user, id),
        // Còn dòng người được giao (của mình) chưa xác nhận nhận.
        acknowledge:
          ACTIVE_STATUSES.includes(task.status) &&
          task.assignees.some((a) => !a.acknowledgedAt && workIds.includes(a.id)),
      },
      following: task.followers.some((f) => f.userId === user.id),
    };
  }

  async create(user: AuthUser, dto: CreateTaskDto) {
    await this.access.assertAssignable(user, dto.assignees);
    const followerIds = [...new Set(dto.followerIds ?? [])].filter((id) => id !== user.id);
    if (followerIds.length) await this.access.assertAssignable(user, followerIds.map((userId) => ({ userId })));
    if (dto.parentId) {
      await this.access.findVisible(user, dto.parentId);
      if (!(await this.access.canWork(user, dto.parentId))) {
        throw new ForbiddenException('Chỉ người thực hiện việc cha mới được chia việc con');
      }
    }
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        source: dto.source,
        dueDate: new Date(dto.dueDate),
        priority: dto.priority,
        parentId: dto.parentId,
        createdById: user.id,
        assignees: {
          create: dto.assignees.map((a) => ({ userId: a.userId, unitId: a.unitId, role: a.role })),
        },
        followers: { create: followerIds.map((userId) => ({ userId })) },
      },
    });
    await this.activity.log(task.id, user.id, 'CREATED');
    await this.notifications.notify(
      await this.access.recipients(task.id),
      'Đồng chí được giao nhiệm vụ mới',
      task.title,
      `/tasks/${task.id}`,
    );
    await this.notifications.notify(followerIds, 'Đồng chí được thêm theo dõi một nhiệm vụ', task.title, `/tasks/${task.id}`);
    return task;
  }

  async update(user: AuthUser, id: number, dto: UpdateTaskDto) {
    const task = await this.access.findVisible(user, id);
    if (!this.access.canManage(user, task)) {
      throw new ForbiddenException('Chỉ người giao việc mới được sửa');
    }
    if (CLOSED_STATUSES.includes(task.status)) {
      throw new BadRequestException('Công việc đã kết thúc, không thể sửa');
    }
    const dueDate = dto.dueDate ? new Date(dto.dueDate) : undefined;
    const updated = await this.prisma.task.update({ where: { id }, data: { ...dto, dueDate } });

    const link = `/tasks/${id}`;
    const people = async () => [...(await this.access.recipients(id)), ...(await this.access.followerIds(id))];
    if (dto.status === 'CANCELLED') {
      await this.activity.log(id, user.id, 'CANCELLED');
      await this.notifications.notify(await people(), 'Nhiệm vụ đã được hủy', task.title, link);
      return updated;
    }
    const fields = (['title', 'description', 'source', 'priority'] as const).filter(
      (f) => dto[f] !== undefined && dto[f] !== task[f],
    );
    const dueChanged = dueDate && dueDate.getTime() !== task.dueDate.getTime();
    if (fields.length || dueChanged) {
      await this.activity.log(id, user.id, 'UPDATED', {
        fields,
        ...(dueChanged ? { oldDueDate: task.dueDate.toISOString(), newDueDate: dueDate.toISOString() } : {}),
      });
    }
    if (dueChanged) await this.notifications.notify(await people(), 'Hạn nhiệm vụ đã thay đổi', updated.title, link);
    return updated;
  }

  /** Người thực hiện xác nhận đã nhận nhiệm vụ; nhiệm vụ mới chuyển sang Đang thực hiện. */
  async acknowledge(user: AuthUser, id: number) {
    const task = await this.access.findVisible(user, id);
    const workIds = await this.access.workAssigneeIds(user, id);
    if (!workIds.length) throw new ForbiddenException('Chỉ người được giao mới xác nhận nhận nhiệm vụ');
    if (!ACTIVE_STATUSES.includes(task.status)) throw new BadRequestException('Nhiệm vụ đã kết thúc');
    const { count } = await this.prisma.taskAssignee.updateMany({
      where: { id: { in: workIds }, acknowledgedAt: null },
      data: { acknowledgedAt: new Date(), acknowledgedById: user.id },
    });
    if (!count) throw new BadRequestException('Đồng chí đã xác nhận nhận nhiệm vụ này');
    if (task.status === 'NEW') await this.prisma.task.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
    await this.activity.log(id, user.id, 'ACKNOWLEDGED');
  }

  /** Tự theo dõi nhiệm vụ mình đang được xem (lãnh đạo, chỉ huy đơn vị). */
  async follow(user: AuthUser, id: number) {
    await this.access.findVisible(user, id);
    const existing = await this.prisma.taskFollower.findUnique({ where: { taskId_userId: { taskId: id, userId: user.id } } });
    if (existing) return;
    await this.prisma.taskFollower.create({ data: { taskId: id, userId: user.id } });
    await this.activity.log(id, user.id, 'FOLLOWED');
  }

  async unfollow(user: AuthUser, id: number) {
    await this.prisma.taskFollower.deleteMany({ where: { taskId: id, userId: user.id } });
  }

  /** Người giao thêm người theo dõi (trong phạm vi được giao việc). */
  async addFollowers(user: AuthUser, id: number, userIds: number[]) {
    const task = await this.access.findVisible(user, id);
    if (!this.access.canManage(user, task)) throw new ForbiddenException('Chỉ người giao việc mới thêm người theo dõi');
    const ids = [...new Set(userIds)].filter((u) => u !== user.id);
    await this.access.assertAssignable(user, ids.map((userId) => ({ userId })));
    const existing = new Set(await this.access.followerIds(id));
    const added = ids.filter((u) => !existing.has(u));
    if (!added.length) return;
    await this.prisma.taskFollower.createMany({ data: added.map((userId) => ({ taskId: id, userId })) });
    await this.activity.log(id, user.id, 'FOLLOWED', { userIds: added });
    await this.notifications.notify(added, 'Đồng chí được thêm theo dõi một nhiệm vụ', task.title, `/tasks/${id}`);
  }

  /** Đôn đốc: người giao nhắc người thực hiện ngay (tối đa MAX_NUDGES_PER_DAY lần mỗi ngày mỗi nhiệm vụ). */
  async nudge(user: AuthUser, id: number) {
    const task = await this.access.findVisible(user, id);
    if (!this.access.canManage(user, task)) throw new ForbiddenException('Chỉ người giao việc mới đôn đốc được');
    if (!WORKING.includes(task.status)) {
      throw new BadRequestException('Chỉ đôn đốc nhiệm vụ đang thực hiện (chưa nộp báo cáo, chưa kết thúc)');
    }
    const used = await this.activity.countToday(id, 'NUDGED');
    if (used >= MAX_NUDGES_PER_DAY) {
      throw new HttpException(`Mỗi ngày chỉ đôn đốc tối đa ${MAX_NUDGES_PER_DAY} lần`, HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.activity.log(id, user.id, 'NUDGED');
    await this.notifications.notify(
      await this.access.recipients(id),
      'Đồng chí được nhắc khẩn trương thực hiện nhiệm vụ',
      task.title,
      `/tasks/${id}`,
    );
    return { remaining: MAX_NUDGES_PER_DAY - used - 1 };
  }

  /** Người thực hiện đề nghị gia hạn; người giao chấp thuận hoặc không. Mỗi lúc chỉ một đề nghị chờ xử lý. */
  async requestExtension(user: AuthUser, id: number, dto: ExtensionRequestDto) {
    const task = await this.access.findVisible(user, id);
    if (!(await this.access.canWork(user, id))) throw new ForbiddenException('Chỉ người thực hiện mới xin gia hạn');
    if (!WORKING.includes(task.status)) throw new BadRequestException('Không thể xin gia hạn ở trạng thái hiện tại');
    const newDueDate = new Date(dto.newDueDate);
    if (newDueDate <= task.dueDate) throw new BadRequestException('Hạn mới phải sau hạn hiện tại');
    const pending = await this.prisma.extensionRequest.count({ where: { taskId: id, status: 'PENDING' } });
    if (pending) throw new BadRequestException('Đã có đề nghị gia hạn đang chờ xử lý');

    const request = await this.prisma.extensionRequest.create({
      data: { taskId: id, requestedById: user.id, oldDueDate: task.dueDate, newDueDate, reason: dto.reason },
    });
    await this.activity.log(id, user.id, 'EXTENSION_REQUESTED', { newDueDate: newDueDate.toISOString() });
    await this.notifications.notify(
      [task.createdById],
      'Có đề nghị gia hạn nhiệm vụ chờ đồng chí xem xét',
      task.title,
      `/tasks/${id}`,
    );
    return request;
  }

  async decideExtension(user: AuthUser, requestId: number, dto: ExtensionDecisionDto) {
    const request = await this.prisma.extensionRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Không tìm thấy đề nghị gia hạn');
    const task = await this.access.findVisible(user, request.taskId);
    if (!this.access.canManage(user, task)) throw new ForbiddenException('Chỉ người giao việc mới xử lý đề nghị gia hạn');
    if (request.status !== 'PENDING') throw new BadRequestException('Đề nghị này đã được xử lý');
    if (!ACTIVE_STATUSES.includes(task.status)) throw new BadRequestException('Nhiệm vụ đã kết thúc');

    const approved = dto.decision === 'APPROVED';
    await this.prisma.$transaction([
      this.prisma.extensionRequest.update({
        where: { id: requestId },
        data: { status: dto.decision, decidedById: user.id, decidedAt: new Date(), decisionNote: dto.note },
      }),
      ...(approved
        ? [this.prisma.task.update({ where: { id: task.id }, data: { dueDate: request.newDueDate } })]
        : []),
    ]);
    await this.activity.log(task.id, user.id, approved ? 'EXTENSION_APPROVED' : 'EXTENSION_REJECTED', {
      newDueDate: request.newDueDate.toISOString(),
    });
    const people = approved
      ? [...(await this.access.recipients(task.id)), ...(await this.access.followerIds(task.id))]
      : [request.requestedById];
    await this.notifications.notify(
      people,
      approved ? 'Nhiệm vụ đã được gia hạn' : 'Đề nghị gia hạn không được chấp thuận',
      dto.note ?? task.title,
      `/tasks/${task.id}`,
    );
  }

  async updateProgress(user: AuthUser, id: number, dto: ProgressDto) {
    const task = await this.access.findVisible(user, id);
    if (!(await this.access.canWork(user, id))) {
      throw new ForbiddenException('Chỉ người thực hiện mới được cập nhật tiến độ');
    }
    if (CLOSED_STATUSES.includes(task.status) || task.status === 'PENDING_REVIEW') {
      throw new BadRequestException('Không thể cập nhật tiến độ ở trạng thái hiện tại');
    }
    const workIds = await this.access.workAssigneeIds(user, id);
    const [, updated] = await this.prisma.$transaction([
      this.prisma.taskUpdate.create({
        data: { taskId: id, userId: user.id, progress: dto.progress, note: dto.note },
      }),
      this.prisma.task.update({
        where: { id },
        data: { progress: dto.progress, status: 'IN_PROGRESS' },
      }),
      // Cập nhật tiến độ cũng là đã nhận nhiệm vụ.
      this.prisma.taskAssignee.updateMany({
        where: { id: { in: workIds }, acknowledgedAt: null },
        data: { acknowledgedAt: new Date(), acknowledgedById: user.id },
      }),
    ]);
    await this.activity.log(id, user.id, 'PROGRESS', { progress: dto.progress });
    return updated;
  }

  async addComment(user: AuthUser, id: number, content: string) {
    await this.access.findVisible(user, id);
    return this.prisma.comment.create({
      data: { taskId: id, userId: user.id, content },
      include: { user: PERSON },
    });
  }
}
