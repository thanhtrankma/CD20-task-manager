import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ReportService } from './report.service';

@Module({
  imports: [TasksModule],
  controllers: [DashboardController],
  providers: [DashboardService, ReportService],
})
export class DashboardModule {}
