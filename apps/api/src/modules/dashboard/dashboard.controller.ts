import { Controller, Get } from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user);
  }
}
