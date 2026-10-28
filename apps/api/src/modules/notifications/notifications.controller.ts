import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsString, Length, MaxLength, ValidateNested } from 'class-validator';
import type { Request } from 'express';
import { CurrentUser, SkipAudit } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { NotificationsService } from './notifications.service';
import { assertPushEndpoint } from './push.service';

class PushKeysDto {
  @IsString() @Length(1, 200) p256dh: string;
  @IsString() @Length(1, 100) auth: string;
}

class SubscribeDto {
  @IsString() @MaxLength(1000) endpoint: string;
  @ValidateNested() @Type(() => PushKeysDto) keys: PushKeysDto;
}

class UnsubscribeDto {
  @IsString() @MaxLength(1000) endpoint: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.listMine(user.id);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { count: await this.notifications.unreadCount(user.id) };
  }

  @SkipAudit()
  @Post(':id/read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.notifications.markRead(user.id, id);
  }

  @SkipAudit()
  @Post('read-all')
  @HttpCode(204)
  async markAllRead(@CurrentUser() user: AuthUser) {
    await this.notifications.markAllRead(user.id);
  }

  /** Trạng thái các kênh nhắc việc của người dùng (cho trang Bảo mật tài khoản). */
  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.notifications.settings(user.id);
  }

  @Post('push/subscribe')
  @HttpCode(204)
  async subscribe(@CurrentUser() user: AuthUser, @Body() dto: SubscribeDto, @Req() req: Request) {
    assertPushEndpoint(dto.endpoint);
    await this.notifications.subscribe(user.id, {
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
      userAgent: req.get('user-agent')?.slice(0, 255),
    });
  }

  @Post('push/unsubscribe')
  @HttpCode(204)
  async unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: UnsubscribeDto) {
    await this.notifications.unsubscribe(user.id, dto.endpoint);
  }

  /** Gửi thử một lời nhắc tới chính mình qua mọi kênh đã bật. */
  @Post('test')
  @HttpCode(204)
  test(@CurrentUser() user: AuthUser) {
    this.notifications.deliver([user.id], { title: 'Thông báo thử: nhắc việc đã hoạt động', link: '/' });
  }
}
