import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256 } from '../../common/crypto';
import type { AuthUser } from '../../common/types';
import { env } from '../../env';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskAccessService } from '../tasks/task-access.service';
import { ALLOWED_FILE_TYPES, matchesSignature, normalizeFileName } from './file-types';

@Injectable()
export class FilesService {
  private readonly dir = resolve(env.uploadDir);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
  ) {}

  async upload(user: AuthUser, file: Express.Multer.File | undefined, taskId: number) {
    if (!file) throw new BadRequestException('Chưa chọn tệp');
    const originalName = normalizeFileName(file.originalname);
    const ext = extname(originalName).toLowerCase();
    const type = ALLOWED_FILE_TYPES[ext];
    if (!type || !matchesSignature(file.buffer, type.magic)) {
      throw new BadRequestException('Loại tệp không được phép (chỉ PDF, Word, Excel, PowerPoint, ảnh)');
    }
    await this.access.findVisible(user, taskId);

    const storedName = `${randomUUID()}${ext}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, storedName), file.buffer, { flag: 'wx' });

    return this.prisma.attachment.create({
      data: {
        taskId,
        uploadedById: user.id,
        originalName,
        storedName,
        mimeType: type.mime,
        size: file.size,
        sha256: sha256(file.buffer),
      },
      select: { id: true, originalName: true, size: true },
    });
  }

  /** Tải về luôn kiểm tra quyền xem công việc chứa tệp. */
  async download(user: AuthUser, id: number) {
    const att = await this.prisma.attachment.findUnique({
      where: { id },
      include: { submission: { select: { taskId: true } } },
    });
    if (!att) throw new NotFoundException('Không tìm thấy tệp');
    const taskId = att.taskId ?? att.submission?.taskId;
    if (taskId) await this.access.findVisible(user, taskId);
    else if (att.uploadedById !== user.id) throw new ForbiddenException();

    return new StreamableFile(createReadStream(join(this.dir, att.storedName)), {
      type: att.mimeType,
      length: att.size,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(att.originalName)}`,
    });
  }
}
