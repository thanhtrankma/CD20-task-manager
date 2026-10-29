import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { CreateUserDto, ImportUsersDto, ListUsersQuery, ResetPasswordDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';
import { AvatarService } from './avatar.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly avatars: AvatarService,
  ) {}

  /** POST /api/users/me/avatar (multipart, trường "file"): JPEG, PNG tối đa 2 MB; máy chủ xóa siêu dữ liệu. */
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.avatars.upload(user.id, file);
  }

  @Delete('me/avatar')
  @HttpCode(204)
  removeAvatar(@CurrentUser() user: AuthUser) {
    return this.avatars.remove(user.id);
  }

  /** Quản trị gỡ ảnh không phù hợp. */
  @Roles('ADMIN')
  @Delete(':id/avatar')
  @HttpCode(204)
  removeAvatarOf(@Param('id', ParseIntPipe) id: number) {
    return this.avatars.remove(id);
  }

  /** Ảnh chỉ xem được khi đã đăng nhập; đường dẫn có `?v=` theo từng ảnh nên lưu đệm lâu trong máy. */
  @Get(':id/avatar')
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  avatar(@Param('id', ParseIntPipe) id: number) {
    return this.avatars.read(id);
  }

  @Roles('ADMIN', 'LEADER', 'UNIT_HEAD')
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListUsersQuery) {
    return this.users.list(user, query);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/reset-password')
  @HttpCode(204)
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(id, dto.temporaryPassword);
  }

  @Roles('ADMIN')
  @Post('import')
  importMany(@Body() dto: ImportUsersDto) {
    return this.users.importMany(dto.rows);
  }

  @Roles('ADMIN')
  @Post(':id/unlock')
  @HttpCode(204)
  unlock(@Param('id', ParseIntPipe) id: number) {
    return this.users.unlock(id);
  }

  @Roles('ADMIN')
  @Post(':id/reset-2fa')
  @HttpCode(204)
  resetTwoFactor(@Param('id', ParseIntPipe) id: number) {
    return this.users.resetTwoFactor(id);
  }
}
