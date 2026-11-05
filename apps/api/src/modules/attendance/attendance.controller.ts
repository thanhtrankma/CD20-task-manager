import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, HrManager, Roles } from '../../common/decorators';
import { requestMeta } from '../../common/origin-check';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../audit/audit.service';
import { ImportPunchesDto, RangeQuery, UnitQuery } from './attendance.dto';
import { AttendanceService } from './attendance.service';

/** Chấm công: dữ liệu nhập từ máy chấm công; mỗi người xem của mình, chỉ huy xem đơn vị. */
@Controller('attendance')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser, @Query() q: RangeQuery) {
    return this.attendance.person(user, user.id, q);
  }

  @Get('users/:id')
  person(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Query() q: RangeQuery) {
    return this.attendance.person(user, id, q);
  }

  @Get('unit')
  async unit(@CurrentUser() user: AuthUser, @Query() q: UnitQuery, @Req() req: Request) {
    const result = await this.attendance.unit(user, q);
    if (q.export) {
      await this.audit.log({
        userId: user.id,
        action: 'EXPORT_ATTENDANCE',
        entity: 'Attendance',
        detail: { from: result.from, to: result.to, unitId: q.unitId ?? null },
        ...requestMeta(req),
      });
    }
    return result;
  }

  @Post('import') @HrManager() @HttpCode(200)
  async importPunches(@CurrentUser() user: AuthUser, @Body() dto: ImportPunchesDto, @Req() req: Request) {
    const result = await this.attendance.importPunches(user, dto);
    await this.audit.log({
      userId: user.id,
      action: 'ATTENDANCE_IMPORT',
      entity: 'Attendance',
      entityId: String(result.id),
      detail: { fileName: dto.fileName, rows: dto.punches.length },
      ...requestMeta(req),
    });
    return result;
  }

  @Get('imports') @HrManager()
  imports() {
    return this.attendance.imports();
  }

  @Get('unmatched') @HrManager()
  unmatched() {
    return this.attendance.unmatched();
  }
}
