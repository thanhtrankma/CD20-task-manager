import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Roles } from '../../common/decorators';
import { AuditService } from './audit.service';

class AuditQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize = 50;
  @IsOptional() @Type(() => Number) @IsInt() userId?: number;
  @IsOptional() @IsString() @MaxLength(100) action?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  /** ok: thành công; error: lỗi, bị từ chối (gồm đăng nhập sai, bị khóa). */
  @IsOptional() @IsIn(['ok', 'error']) result?: 'ok' | 'error';
}

@Controller('audit-logs')
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: AuditQuery) {
    return this.audit.list(query);
  }
}
