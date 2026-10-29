import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { avatarUrl } from '../../common/avatar-url';
import { env } from '../../env';
import { PrismaService } from '../../prisma/prisma.service';
import { cleanAvatar, InvalidImageError } from './avatar-image';

@Injectable()
export class AvatarService {
  private readonly dir = resolve(env.uploadDir, 'avatars');

  constructor(private readonly prisma: PrismaService) {}

  async upload(userId: number, file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException('Chưa chọn ảnh');
    let image;
    try {
      image = cleanAvatar(file.buffer);
    } catch (err) {
      if (err instanceof InvalidImageError) throw new BadRequestException(err.message);
      throw err;
    }
    const storedName = `${randomUUID().replaceAll('-', '')}${image.ext}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, storedName), image.data, { flag: 'wx' });
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarFile: true } });
    await this.prisma.user.update({ where: { id: userId }, data: { avatarFile: storedName } });
    await this.removeFile(before.avatarFile);
    return { avatarUrl: avatarUrl({ id: userId, avatarFile: storedName }) };
  }

  async remove(userId: number) {
    const before = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarFile: true } });
    if (!before.avatarFile) return;
    await this.prisma.user.update({ where: { id: userId }, data: { avatarFile: null } });
    await this.removeFile(before.avatarFile);
  }

  async read(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarFile: true } });
    if (!user?.avatarFile) throw new NotFoundException('Chưa có ảnh đại diện');
    const type = user.avatarFile.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return new StreamableFile(createReadStream(join(this.dir, user.avatarFile)), { type });
  }

  private async removeFile(name: string | null) {
    if (name) await unlink(join(this.dir, name)).catch(() => undefined);
  }
}
