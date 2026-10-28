import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { DevicePlatform, PushProvider } from '../../generated/prisma/client';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { PrismaService } from '../../prisma/prisma.service';
import { MAX_DEVICES_PER_USER } from './mobile-push.service';

/** Mã thiết bị FCM (chữ, số, : _ -) hoặc APNs (hex). */
const TOKEN = /^[A-Za-z0-9:_\-.]+$/;

class RegisterDeviceDto {
  @IsEnum(DevicePlatform) platform: DevicePlatform;
  @IsEnum(PushProvider) provider: PushProvider;
  @IsString() @Length(20, 512) @Matches(TOKEN, { message: 'Mã thiết bị không hợp lệ' }) token: string;
  @IsOptional() @IsString() @MaxLength(32) appVersion?: string;
}

class UnregisterDeviceDto {
  @IsString() @Length(1, 512) token: string;
}

/** Ứng dụng di động đăng ký nhận thông báo đẩy. Thiết bị gắn với phiên đăng nhập hiện tại. */
@Controller('devices')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class DevicesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(204)
  async register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    // Cùng mã (máy dùng chung, đăng nhập người khác): chuyển sang người, phiên hiện tại.
    const data = {
      userId: user.id,
      sessionId: user.sessionId,
      platform: dto.platform,
      provider: dto.provider,
      appVersion: dto.appVersion,
      lastSeenAt: new Date(),
    };
    await this.prisma.device.upsert({ where: { token: dto.token }, create: { ...data, token: dto.token }, update: data });
    const extra = await this.prisma.device.findMany({
      where: { userId: user.id },
      orderBy: { lastSeenAt: 'desc' },
      skip: MAX_DEVICES_PER_USER,
      select: { id: true },
    });
    if (extra.length) await this.prisma.device.deleteMany({ where: { id: { in: extra.map((d) => d.id) } } });
  }

  @Post('unregister')
  @HttpCode(204)
  async unregister(@CurrentUser() user: AuthUser, @Body() dto: UnregisterDeviceDto) {
    await this.prisma.device.deleteMany({ where: { token: dto.token, userId: user.id } });
  }
}
