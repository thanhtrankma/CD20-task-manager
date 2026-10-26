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
        query.mine === 'assigned' ? { assignees: { some: { userId: user.id } } } : {},
        query.mine === 'created' ? { createdById: user.id } : {},
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
      'Bạn được giao việc mới',
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
