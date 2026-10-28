import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { CommentDto, CreateTaskDto, ListTasksQuery, ProgressDto, UpdateTaskDto } from './tasks.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTasksQuery) {
    return this.tasks.list(user, query);
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
}
