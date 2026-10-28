import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/decorators';
import type { AuthUser } from '../../common/types';
import { CreateUserDto, ImportUsersDto, ListUsersQuery, ResetPasswordDto, UpdateUserDto } from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

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
