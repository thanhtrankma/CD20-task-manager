import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { CookieOptions } from 'express';
import { randomToken, sha256 } from '../../common/crypto';
import type { AuthUser } from '../../common/types';
import { env } from '../../env';
import { PrismaService } from '../../prisma/prisma.service';

export const SESSION_COOKIE = 'tm_session';

/**
 * Phiên đăng nhập lưu trong PostgreSQL. Cookie chứa token ngẫu nhiên,
 * CSDL chỉ lưu SHA-256 của token nên lộ CSDL cũng không dùng lại được phiên.
 */
@Injectable()
export class SessionService {
  private readonly ttlMs = env.sessionTtlHours * 3_600_000;

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, meta: { ip?: string; userAgent?: string }) {
    const token = randomToken();
    await this.prisma.session.create({
      data: { id: sha256(token), userId, expiresAt: this.nextExpiry(), ...meta },
    });
    return token;
  }

  async resolve(token: string | undefined): Promise<AuthUser | null> {
    if (!token) return null;
    const id = sha256(token);
    const session = await this.prisma.session.findUnique({ where: { id }, include: { user: true } });
    if (!session || session.expiresAt < new Date() || !session.user.isActive) return null;

    // Gia hạn trượt: còn dưới nửa thời hạn thì kéo dài thêm.
    if (session.expiresAt.getTime() - Date.now() < this.ttlMs / 2) {
      await this.prisma.session.update({ where: { id }, data: { expiresAt: this.nextExpiry() } });
    }

    const u = session.user;
    return {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      role: u.role,
      unitId: u.unitId,
      mustChangePassword: u.mustChangePassword,
      totpEnabled: u.totpEnabled,
      sessionId: id,
    };
  }

  destroy(sessionId: string) {
    return this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  destroyAllForUser(userId: number, exceptSessionId?: string) {
    return this.prisma.session.deleteMany({
      where: { userId, id: exceptSessionId ? { not: exceptSessionId } : undefined },
    });
  }

  /** Cookie phiên (không đặt maxAge): đóng trình duyệt là mất; hết hạn do máy chủ quyết định. */
  cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: env.cookieSecure, sameSite: 'strict', path: '/' };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpired() {
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }

  private nextExpiry() {
    return new Date(Date.now() + this.ttlMs);
  }
}
