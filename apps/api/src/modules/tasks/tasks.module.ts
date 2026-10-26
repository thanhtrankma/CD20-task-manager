import { Module } from '@nestjs/common';
import { TaskAccessService } from './task-access.service';
import { TaskReminderService } from './task-reminder.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskAccessService, TaskReminderService],
  exports: [TaskAccessService],
})
export class TasksModule {}
