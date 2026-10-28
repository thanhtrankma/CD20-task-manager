import { Controller, Get, Query } from '@nestjs/common';
import { IsDateString } from 'class-validator';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { DashboardService } from './dashboard.service';
import { ReportService } from './report.service';

class ReportQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
}

@Controller('dashboard')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly reports: ReportService,
  ) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user);
  }

  /** Thống kê kết quả thực hiện nhiệm vụ trong kỳ (lãnh đạo, chỉ huy đơn vị). */
  @Roles('LEADER', 'UNIT_HEAD')
  @Get('report')
  report(@CurrentUser() user: AuthUser, @Query() q: ReportQuery) {
    return this.reports.report(user, q.from, q.to);
  }
}
