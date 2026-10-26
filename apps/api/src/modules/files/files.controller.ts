import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { env } from '../../env';
import { FilesService } from './files.service';

@Controller('files')
@Roles('LEADER', 'UNIT_HEAD', 'STAFF')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** POST /api/files?taskId=1 (multipart, trường "file"). */
  @Post()
  @UseInterceptors(
    // Không cấu hình storage: multer giữ tệp trong bộ nhớ để kiểm tra trước khi ghi đĩa.
    FileInterceptor('file', {
      limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('taskId', ParseIntPipe) taskId: number,
  ) {
    return this.files.upload(user, file, taskId);
  }

  @Get(':id/download')
  download(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.files.download(user, id);
  }
}
