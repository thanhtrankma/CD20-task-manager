import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TaskAccessService } from '../tasks/task-access.service';
import { CreateSubmissionDto, ReviewSubmissionDto } from './submissions.dto';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Người thực hiện nộp báo cáo → công việc chuyển sang Chờ duyệt. */
  async create(user: AuthUser, taskId: number, dto: CreateSubmissionDto) {
    const task = await this.access.findVisible(user, taskId);
    if (!(await this.access.canWork(user, taskId))) {
      throw new ForbiddenException('Chỉ người thực hiện mới được nộp báo cáo');
    }
    if (!['NEW', 'IN_PROGRESS', 'RETURNED'].includes(task.status)) {
      throw new BadRequestException('Không thể nộp báo cáo ở trạng thái hiện tại');
    }

    const submission = await this.prisma.$transaction(async (tx) => {
      const created = await tx.submission.create({
        data: { taskId, submittedById: user.id, content: dto.content },
      });
      if (dto.attachmentIds?.length) {
        // Chỉ gắn tệp do chính người nộp tải lên cho đúng công việc này.
        const { count } = await tx.attachment.updateMany({
          where: {
            id: { in: dto.attachmentIds },
            uploadedById: user.id,
            taskId,
            submissionId: null,
          },
          data: { submissionId: created.id },
        });
        if (count !== dto.attachmentIds.length) {
          throw new BadRequestException('Tệp đính kèm không hợp lệ');
        }
      }
      await tx.task.update({ where: { id: taskId }, data: { status: 'PENDING_REVIEW' } });
      return created;
    });

    await this.notifications.notify(
      [task.createdById],
      'Có báo cáo mới chờ đồng chí duyệt',
      task.title,
      `/tasks/${taskId}`,
    );
    return submission;
  }

  /** Người giao việc duyệt: Đạt → Hoàn thành; Trả lại → người thực hiện làm tiếp. */
  async review(user: AuthUser, id: number, dto: ReviewSubmissionDto) {
    const submission = await this.prisma.submission.findUnique({ where: { id } });
    if (!submission) throw new NotFoundException('Không tìm thấy báo cáo');
    const task = await this.access.findVisible(user, submission.taskId);
    if (!this.access.canManage(user, task)) {
      throw new ForbiddenException('Chỉ người giao việc mới được duyệt báo cáo');
    }
    if (submission.status !== 'PENDING') {
      throw new BadRequestException('Báo cáo này đã được xử lý');
    }

    const approved = dto.decision === 'APPROVED';
    await this.prisma.$transaction([
      this.prisma.submission.update({
        where: { id },
        data: {
          status: dto.decision,
          reviewerId: user.id,
          reviewNote: dto.note,
          reviewedAt: new Date(),
        },
      }),
      this.prisma.task.update({
        where: { id: task.id },
        data: approved
          ? { status: 'DONE', progress: 100, completedAt: new Date() }
          : { status: 'RETURNED' },
      }),
    ]);

    await this.notifications.notify(
      [submission.submittedById],
      approved ? 'Báo cáo của đồng chí đã được duyệt' : 'Báo cáo của đồng chí bị trả lại',
      dto.note ?? task.title,
      `/tasks/${task.id}`,
    );
  }
}
