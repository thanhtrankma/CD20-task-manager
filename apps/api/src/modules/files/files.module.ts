import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [TasksModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
