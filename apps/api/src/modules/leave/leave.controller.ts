import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles, SkipAudit } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import {
  AbsentQuery,
  BalanceQuery,
  BatchApproveLeaveDto,
  CreateLeaveDto,
  DecideLeaveDto,
  LeaveSpanDto,
  ListLeaveQuery,
  RevokeLeaveDto,
} from './leave.dto';
import { LeaveService } from './leave.service';

@Controller('leave')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListLeaveQuery) {
    return this.leave.list(user, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeaveDto) {
    return this.leave.create(user, dto);
  }

  /** Chỉ tính thử, không ghi gì: không ghi nhật ký. */
  @Post('preview')
  @HttpCode(200)
  @SkipAudit()
  preview(@CurrentUser() user: AuthUser, @Body() dto: LeaveSpanDto) {
    return this.leave.preview(user, dto);
  }

  @Get('pending-count')
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.leave.pendingCount(user);
  }

  @Get('balance')
  balance(@CurrentUser() user: AuthUser, @Query() q: BalanceQuery) {
    return this.leave.balance(user, q);
  }

  @Get('absent')
  absent(@CurrentUser() user: AuthUser, @Query() q: AbsentQuery) {
    return this.leave.absent(user, q);
  }

  @Post('approve-batch')
  @HttpCode(200)
  approveBatch(@CurrentUser() user: AuthUser, @Body() dto: BatchApproveLeaveDto) {
    return this.leave.approveMany(user, dto.ids);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.leave.detail(user, id);
  }

  @Post(':id/decide')
  @HttpCode(204)
  decide(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DecideLeaveDto) {
    return this.leave.decide(user, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(204)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.leave.cancel(user, id);
  }

  @Post(':id/revoke')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RevokeLeaveDto) {
    return this.leave.revoke(user, id, dto.note);
  }
}
