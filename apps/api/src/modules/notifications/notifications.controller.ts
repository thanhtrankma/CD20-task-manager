import { Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { CurrentUser, SkipAudit } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@SkipAudit()
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

  @Post(':id/read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    await this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(204)
  async markAllRead(@CurrentUser() user: AuthUser) {
    await this.notifications.markAllRead(user.id);
  }
}
