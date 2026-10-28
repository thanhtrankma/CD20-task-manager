import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '../../generated/prisma/client';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskAccessService } from './task-access.service';
import { CreateTaskDto, ListTasksQuery, ProgressDto, UpdateTaskDto } from './tasks.dto';

export const ACTIVE_STATUSES: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'PENDING_REVIEW', 'RETURNED'];
const CLOSED_STATUSES: TaskStatus[] = ['DONE', 'CANCELLED'];

const PERSON = { select: { id: true, fullName: true } } as const;

const LIST_INCLUDE = {
  createdBy: PERSON,
  assignees: { include: { user: PERSON, unit: { select: { id: true, name: true } } } },
} satisfies Prisma.TaskInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  parent: { select: { id: true, title: true } },
  children: { select: { id: true, title: true, status: true, dueDate: true, progress: true } },
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
  extensionRequests: { orderBy: { createdAt: 'desc' } },
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

/** Lý do một công việc nằm trong mục "Cần xử lý", theo thứ tự cần ưu tiên. */
export const TODO_REASONS = ['overdue', 'today', 'review', 'returned', 'soon', 'new'] as const;
export type TodoReason = (typeof TODO_REASONS)[number];

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
    private readonly notifications: NotificationsService,
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
    const [working, review, assigned, created] = await Promise.all([
      this.prisma.task.count({ where: await this.todoWorkWhere(user, soon) }),
      this.prisma.task.count({ where: this.reviewWhere(user) }),
      this.prisma.task.count({ where: { AND: [await this.access.workWhere(user), active] } }),
      this.prisma.task.count({ where: { createdById: user.id, ...active } }),
    ]);
    return { todo: working + review, review, assigned, created };
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

  /** Báo cáo đang chờ chính người giao việc duyệt. */
  private reviewWhere(user: AuthUser): Prisma.TaskWhereInput {
    return { createdById: user.id, status: 'PENDING_REVIEW' };
  }

  async get(user: AuthUser, id: number) {
    const task = await this.access.findVisible(user, id, DETAIL_INCLUDE);
    return {
      ...withOverdue(task),
      permissions: {
        manage: this.access.canManage(user, task),
        work: await this.access.canWork(user, id),
      },
    };
  }

  async create(user: AuthUser, dto: CreateTaskDto) {
    await this.access.assertAssignable(user, dto.assignees);
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
        dueDate: new Date(dto.dueDate),
        priority: dto.priority,
        parentId: dto.parentId,
        createdById: user.id,
        assignees: {
          create: dto.assignees.map((a) => ({ userId: a.userId, unitId: a.unitId, role: a.role })),
        },
      },
    });
    await this.notifications.notify(
      await this.access.recipients(task.id),
      'Đồng chí được giao nhiệm vụ mới',
      task.title,
      `/tasks/${task.id}`,
    );
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
    return this.prisma.task.update({
      where: { id },
      data: { ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined },
    });
  }

  async updateProgress(user: AuthUser, id: number, dto: ProgressDto) {
    const task = await this.access.findVisible(user, id);
    if (!(await this.access.canWork(user, id))) {
      throw new ForbiddenException('Chỉ người thực hiện mới được cập nhật tiến độ');
    }
    if (CLOSED_STATUSES.includes(task.status) || task.status === 'PENDING_REVIEW') {
      throw new BadRequestException('Không thể cập nhật tiến độ ở trạng thái hiện tại');
    }
    const [, updated] = await this.prisma.$transaction([
      this.prisma.taskUpdate.create({
        data: { taskId: id, userId: user.id, progress: dto.progress, note: dto.note },
      }),
      this.prisma.task.update({
        where: { id },
        data: { progress: dto.progress, status: 'IN_PROGRESS' },
      }),
    ]);
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
