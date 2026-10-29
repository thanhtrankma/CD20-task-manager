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
  /** Báo cho các kết nối giữ lâu (luồng trò chuyện) đóng ngay khi phiên bị hủy. */
  private readonly revokedListeners: ((e: { sessionId?: string; userId?: number; exceptSessionId?: string }) => void)[] =
    [];

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

  /** Phiên còn hiệu lực, không gia hạn (kết nối giữ lâu như luồng trò chuyện không được kéo dài phiên). */
  async isAlive(sessionId: string) {
    const s = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { expiresAt: true, user: { select: { isActive: true } } },
    });
    return !!s && s.expiresAt > new Date() && s.user.isActive;
  }

  onRevoked(listener: (e: { sessionId?: string; userId?: number; exceptSessionId?: string }) => void) {
    this.revokedListeners.push(listener);
  }

  async destroy(sessionId: string) {
    const result = await this.prisma.session.deleteMany({ where: { id: sessionId } });
    this.revokedListeners.forEach((l) => l({ sessionId }));
    return result;
  }

  async destroyAllForUser(userId: number, exceptSessionId?: string) {
    const result = await this.prisma.session.deleteMany({
      where: { userId, id: exceptSessionId ? { not: exceptSessionId } : undefined },
    });
    this.revokedListeners.forEach((l) => l({ userId, exceptSessionId }));
    return result;
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
