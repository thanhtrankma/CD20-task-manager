import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';
import { generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import { decrypt, encrypt } from '../../common/crypto';
import { twoFactorMandatory, twoFactorMissing } from '../../common/two-factor';
import {
  assertStrongPassword,
  getDummyHash,
  hashPassword,
  verifyPassword,
} from '../../common/password';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ChangePasswordDto, DisableOtpDto, LoginDto, UpdateProfileDto } from './auth.dto';
import { SessionService } from './session.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const INVALID_LOGIN = 'Tên đăng nhập, mật khẩu hoặc mã xác thực không đúng';
const OTP_ISSUER = 'Giao viec';
/** Chấp nhận lệch đồng hồ ±30 giây (một bước mã) giữa máy chủ và điện thoại. */
const OTP_TOLERANCE_SECONDS = 30;

type Meta = { ip?: string; userAgent?: string };

export const toPublicUser = (u: User) => ({
  id: u.id,
  username: u.username,
  fullName: u.fullName,
  rank: u.rank,
  position: u.position,
  email: u.email,
  role: u.role,
  unitId: u.unitId,
  mustChangePassword: u.mustChangePassword,
  totpEnabled: u.totpEnabled,
  twoFactorMandatory: twoFactorMandatory(u.role),
  twoFactorRequired: twoFactorMissing(u),
});

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, meta: Meta) {
    const username = dto.username.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { username } });

    if (!user || !user.isActive) {
      await verifyPassword(await getDummyHash(), dto.password);
      await this.audit.log({ action: 'LOGIN_FAILED', detail: { username }, ...meta });
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({ userId: user.id, action: 'LOGIN_LOCKED', ...meta });
      throw new UnauthorizedException(
        `Tài khoản tạm khóa do nhập sai nhiều lần, thử lại sau ${LOCK_MINUTES} phút`,
      );
    }

    const passwordOk = await verifyPassword(user.passwordHash, dto.password);
    if (passwordOk && user.totpEnabled && !dto.otp) {
      throw new UnauthorizedException({ code: 'OTP_REQUIRED', message: 'Nhập mã xác thực hai lớp' });
    }
    const otpOk = !user.totpEnabled || (await this.checkOtp(user, dto.otp));

    if (!passwordOk || !otpOk) {
      const fails = user.failedLogins + 1;
      const lock = fails >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: lock ? 0 : fails,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        },
      });
      await this.audit.log({
        userId: user.id,
        action: lock ? 'LOGIN_FAILED_LOCKED' : 'LOGIN_FAILED',
        detail: { reason: passwordOk ? 'otp' : 'password' },
        ...meta,
      });
      throw new UnauthorizedException(INVALID_LOGIN);
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const token = await this.sessions.create(user.id, meta);
    await this.audit.log({ userId: user.id, action: 'LOGIN', ...meta });
    return { token, user: toPublicUser(updated) };
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { unit: { select: { id: true, name: true } } },
    });
    return { ...toPublicUser(user), unit: user.unit };
  }

  async updateProfile(auth: AuthUser, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: auth.id },
      data: { email: dto.email?.trim().toLowerCase() ?? null },
    });
    return toPublicUser(user);
  }

  async changePassword(auth: AuthUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.id } });
    if (!(await verifyPassword(user.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    assertStrongPassword(dto.newPassword);
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu cũ');
    }
    await this.prisma.user.update({
      where: { id: auth.id },
      data: { passwordHash: await hashPassword(dto.newPassword), mustChangePassword: false },
    });
    await this.sessions.destroyAllForUser(auth.id, auth.sessionId);
  }

  /** Bước 1 bật 2FA: tạo khóa bí mật (chưa kích hoạt) và mã QR để quét bằng ứng dụng xác thực. */
  async setupOtp(auth: AuthUser) {
    if (auth.totpEnabled) throw new BadRequestException('Xác thực hai lớp đang được bật');
    const secret = generateSecret();
    await this.prisma.user.update({ where: { id: auth.id }, data: { totpSecret: encrypt(secret) } });
    const otpauthUrl = generateURI({ issuer: OTP_ISSUER, label: auth.username, secret });
    return { otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl) };
  }

  /** Bước 2 bật 2FA: nhập đúng mã từ ứng dụng thì mới kích hoạt. */
  async enableOtp(auth: AuthUser, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.id } });
    if (!user.totpSecret) throw new BadRequestException('Chưa tạo khóa xác thực');
    if (!(await this.checkOtp(user, code))) throw new BadRequestException('Mã xác thực không đúng');
    await this.prisma.user.update({ where: { id: auth.id }, data: { totpEnabled: true } });
  }

  async disableOtp(auth: AuthUser, dto: DisableOtpDto) {
    if (twoFactorMandatory(auth.role)) {
      throw new BadRequestException('Vai trò của đồng chí bắt buộc dùng xác thực hai lớp');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: auth.id } });
    const ok =
      (await verifyPassword(user.passwordHash, dto.password)) && (await this.checkOtp(user, dto.code));
    if (!ok) throw new BadRequestException('Mật khẩu hoặc mã xác thực không đúng');
    await this.prisma.user.update({
      where: { id: auth.id },
      data: { totpEnabled: false, totpSecret: null },
    });
  }

  private async checkOtp(user: User, code?: string) {
    if (!code || !user.totpSecret) return false;
    const result = await verify({
      token: code,
      secret: decrypt(user.totpSecret),
      epochTolerance: OTP_TOLERANCE_SECONDS,
    });
    return result.valid;
  }
}
