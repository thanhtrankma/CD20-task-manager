import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { env } from '../../env';
import { ChatEventsService } from './chat-events.service';
import {
  AddMembersDto,
  CreateGroupDto,
  CreateUnitGroupDto,
  DirectoryQuery,
  ListMessagesQuery,
  MuteDto,
  OpenDirectDto,
  ReadDto,
  SendMessageDto,
  UpdateConversationDto,
} from './chat.dto';
import { ChatService } from './chat.service';

/** Trò chuyện nội bộ. Quản trị không tham gia, không đọc được. */
@Controller('chat')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly events: ChatEventsService,
  ) {}

  /** Server-Sent Events: tin mới, thu hồi, thay đổi nhóm, đã đọc. */
  @Get('stream')
  stream(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    this.events.open(user, req, res);
  }

  @Get('directory')
  directory(@CurrentUser() user: AuthUser, @Query() query: DirectoryQuery) {
    return this.chat.directory(user, query);
  }

  @Get('unread')
  unread(@CurrentUser() user: AuthUser) {
    return this.chat.unreadTotal(user);
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthUser) {
    return this.chat.list(user);
  }

  @Post('direct')
  openDirect(@CurrentUser() user: AuthUser, @Body() dto: OpenDirectDto) {
    return this.chat.openDirect(user, dto.userId);
  }

  @Post('groups')
  createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto) {
    return this.chat.createGroup(user, dto);
  }

  @Roles('LEADER', 'UNIT_HEAD')
  @Post('unit-groups')
  createUnitGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateUnitGroupDto) {
    return this.chat.createUnitGroup(user, dto);
  }

  @Get('conversations/:id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.chat.detail(user, id);
  }

  @Patch('conversations/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateConversationDto) {
    return this.chat.update(user, id, dto);
  }

  @Post('conversations/:id/members')
  @HttpCode(204)
  addMembers(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AddMembersDto) {
    return this.chat.addMembers(user, id, dto.userIds);
  }

  /** userId là chính mình: rời nhóm. */
  @Delete('conversations/:id/members/:userId')
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.chat.removeMember(user, id, userId);
  }

  @Get('conversations/:id/messages')
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Query() query: ListMessagesQuery) {
    return this.chat.messages(user, id, query);
  }

  /** Mặc định tối đa 30 tin mỗi phút. */
  @Throttle({ default: { limit: env.chatMessageRateLimit, ttl: 60_000 } })
  @Post('conversations/:id/messages')
  send(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: SendMessageDto) {
    return this.chat.send(user, id, dto.body);
  }

  @Post('conversations/:id/read')
  @HttpCode(204)
  read(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReadDto) {
    return this.chat.markRead(user, id, dto.messageId);
  }

  @Post('conversations/:id/mute')
  @HttpCode(204)
  mute(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: MuteDto) {
    return this.chat.mute(user, id, dto.muted);
  }

  @Delete('messages/:id')
  @HttpCode(204)
  recall(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.chat.recall(user, id);
  }
}
