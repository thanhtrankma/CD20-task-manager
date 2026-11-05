import { Global, Module } from '@nestjs/common';
import { HrAccessService } from './hr-access.service';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { LeaveBalanceService } from './leave-balance.service';
import { WorkCalendarService } from './work-calendar.service';

/** Nhân sự: phạm vi xem, lịch làm việc, quỹ phép, danh mục. Dùng chung cho nghỉ phép và chấm công. */
@Global()
@Module({
  controllers: [HrController],
  providers: [HrService, HrAccessService, WorkCalendarService, LeaveBalanceService],
  exports: [HrAccessService, WorkCalendarService, LeaveBalanceService],
})
export class HrModule {}
