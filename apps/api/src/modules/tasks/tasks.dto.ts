import { AssigneeRole, Priority, TaskStatus } from '../../generated/prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AssigneeDto {
  @IsOptional() @IsInt() userId?: number;
  @IsOptional() @IsInt() unitId?: number;
  @IsOptional() @IsEnum(AssigneeRole) role?: AssigneeRole;
}

export class CreateTaskDto {
  @IsString() @Length(3, 255) title: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsDateString() dueDate: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  /** Việc cha: chỉ huy đơn vị chia nhỏ việc được giao cho cán bộ. */
  @IsOptional() @IsInt() parentId?: number;
  @IsArray()
  @ArrayMinSize(1, { message: 'Cần chọn ít nhất một người hoặc đơn vị nhận việc' })
  @ValidateNested({ each: true })
  @Type(() => AssigneeDto)
  assignees: AssigneeDto[];
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @Length(3, 255) title?: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  /** Người giao chỉ được đổi trạng thái sang Hủy; các trạng thái khác đi theo quy trình. */
  @IsOptional() @IsIn([TaskStatus.CANCELLED]) status?: 'CANCELLED';
}

export class ListTasksQuery {
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  /** assigned: việc tôi nhận; created: việc tôi giao. */
  @IsOptional() @IsIn(['assigned', 'created']) mine?: 'assigned' | 'created';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export class ProgressDto {
  @IsInt() @Min(0) @Max(100) progress: number;
  @IsOptional() @IsString() @MaxLength(5000) note?: string;
}

export class CommentDto {
  @IsString() @Length(1, 5000) content: string;
}
