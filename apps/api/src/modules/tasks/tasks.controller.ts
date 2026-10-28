import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { requestMeta } from '../../common/origin-check';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import {
  CommentDto,
  CreateTaskDto,
  ExtensionDecisionDto,
  ExtensionRequestDto,
  FollowersDto,
  ListTasksQuery,
  ProgressDto,
  UpdateTaskDto,
} from './tasks.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() query: ListTasksQuery, @Req() req: Request) {
    const result = await this.tasks.list(user, query);
    // Xuất danh sách ra Excel là đưa dữ liệu ra khỏi hệ thống: ghi nhật ký (chỉ trang đầu của lượt xuất).
    if (query.export && query.page === 1) {
      await this.audit.log({
        userId: user.id,
        action: 'EXPORT_TASKS',
        entity: 'Tasks',
        detail: { view: query.view ?? 'all', status: query.status, q: query.q, total: result.total },
        ...requestMeta(req),
      });
    }
    return result;
  }

  @Get('todo')
  todo(@CurrentUser() user: AuthUser) {
    return this.tasks.todo(user);
  }

  @Get('counts')
  counts(@CurrentUser() user: AuthUser) {
    return this.tasks.counts(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.get(user, id);
  }

  @Roles('LEADER', 'UNIT_HEAD')
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(user, id, dto);
  }

  @Post(':id/progress')
  progress(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProgressDto,
  ) {
    return this.tasks.updateProgress(user, id, dto);
  }

  @Post(':id/comments')
  comment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CommentDto,
  ) {
    return this.tasks.addComment(user, id, dto.content);
  }

  @Post(':id/acknowledge')
  @HttpCode(204)
  acknowledge(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.acknowledge(user, id);
  }

  @Post(':id/follow')
  @HttpCode(204)
  follow(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.follow(user, id);
  }

  @Post(':id/unfollow')
  @HttpCode(204)
  unfollow(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.unfollow(user, id);
  }

  @Post(':id/followers')
  @HttpCode(204)
  addFollowers(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FollowersDto,
  ) {
    return this.tasks.addFollowers(user, id, dto.userIds);
  }

  @Post(':id/nudge')
  @HttpCode(200)
  nudge(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.nudge(user, id);
  }

  @Post(':id/extensions')
  requestExtension(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtensionRequestDto,
  ) {
    return this.tasks.requestExtension(user, id, dto);
  }

  @Post('extensions/:requestId/decide')
  @HttpCode(204)
  decideExtension(
    @CurrentUser() user: AuthUser,
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() dto: ExtensionDecisionDto,
  ) {
    return this.tasks.decideExtension(user, requestId, dto);
  }
}
