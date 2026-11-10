import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { BatchApproveOvertimeDto, CreateOvertimeDto, DecideOvertimeDto, ListOvertimeQuery } from './overtime.dto';
import { OvertimeService } from './overtime.service';

@Controller('overtime')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class OvertimeController {
  constructor(private readonly overtime: OvertimeService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListOvertimeQuery) {
    return this.overtime.list(user, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOvertimeDto) {
    return this.overtime.create(user, dto);
  }

  @Get('pending-count')
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.overtime.pendingCount(user);
  }

  @Post('approve-batch')
  @HttpCode(200)
  approveBatch(@CurrentUser() user: AuthUser, @Body() dto: BatchApproveOvertimeDto) {
    return this.overtime.approveMany(user, dto.ids);
  }

  @Post(':id/decide')
  @HttpCode(204)
  decide(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DecideOvertimeDto) {
    return this.overtime.decide(user, id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(204)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.overtime.cancel(user, id);
  }
}
