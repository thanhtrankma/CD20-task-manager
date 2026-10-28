import { Controller, Get, Query, Req } from '@nestjs/common';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import type { Request } from 'express';
import { requestMeta } from '../../common/origin-check';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { DashboardService } from './dashboard.service';
import { ReportService } from './report.service';

class ReportQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
  /** Đang xuất Excel: ghi nhật ký. */
  @IsOptional() @IsIn(['1']) export?: '1';
}

@Controller('dashboard')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly reports: ReportService,
    private readonly audit: AuditService,
  ) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user);
  }

  /** Thống kê kết quả thực hiện nhiệm vụ trong kỳ (lãnh đạo, chỉ huy đơn vị). */
  @Roles('LEADER', 'UNIT_HEAD')
  @Get('report')
  async report(@CurrentUser() user: AuthUser, @Query() q: ReportQuery, @Req() req: Request) {
    const result = await this.reports.report(user, q.from, q.to);
    if (q.export) {
      await this.audit.log({
        userId: user.id,
        action: 'EXPORT_REPORT',
        entity: 'Dashboard',
        detail: { from: q.from, to: q.to },
        ...requestMeta(req),
      });
    }
    return result;
  }
}
