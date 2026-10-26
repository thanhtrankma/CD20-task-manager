import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  userId?: number;
  action: string;
  entity?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  detail?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Không ném lỗi: lỗi ghi nhật ký không được làm hỏng thao tác chính. */
  async log(entry: AuditEntry) {
    try {
      await this.prisma.auditLog.create({ data: entry });
    } catch (err) {
      this.logger.error(`Không ghi được nhật ký ${entry.action}`, err as Error);
    }
  }

  async list(query: { page: number; pageSize: number; userId?: number; action?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      userId: query.userId,
      action: query.action ? { contains: query.action } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { username: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items: items.map((i) => ({ ...i, id: i.id.toString() })), total };
  }
}
