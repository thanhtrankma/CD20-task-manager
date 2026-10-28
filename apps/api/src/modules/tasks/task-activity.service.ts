import { Injectable } from '@nestjs/common';
import type { Prisma, TaskActivityType } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Ghi dòng hoạt động của nhiệm vụ: ai làm gì, lúc nào. `detail` chỉ chứa dữ liệu có cấu trúc (hạn, %, trường đã sửa). */
@Injectable()
export class TaskActivityService {
  constructor(private readonly prisma: PrismaService) {}

  log(taskId: number, userId: number, type: TaskActivityType, detail?: Prisma.InputJsonValue) {
    return this.prisma.taskActivity.create({ data: { taskId, userId, type, detail } });
  }

  /** Số lần thao tác loại này trên nhiệm vụ kể từ 0h hôm nay (giới hạn đôn đốc). */
  countToday(taskId: number, type: TaskActivityType) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.prisma.taskActivity.count({ where: { taskId, type, createdAt: { gte: start } } });
  }
}
