import { AssigneeRole, Priority, TaskStatus } from '../../generated/prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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

export const TASK_VIEWS = ['assigned', 'created', 'review', 'following'] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

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
  /** Căn cứ giao nhiệm vụ: số, ký hiệu văn bản hoặc kết luận giao ban (không đính kèm văn bản mật). */
  @IsOptional() @IsString() @MaxLength(500) source?: string;
  /** Việc cha: chỉ huy đơn vị chia nhỏ việc được giao cho cán bộ. */
  @IsOptional() @IsInt() parentId?: number;
  /** Người theo dõi: nắm tình hình, không phải thực hiện. */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsInt({ each: true }) followerIds?: number[];
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
  @IsOptional() @IsString() @MaxLength(500) source?: string;
  /** Người giao chỉ được đổi trạng thái sang Hủy; các trạng thái khác đi theo quy trình. */
  @IsOptional() @IsIn([TaskStatus.CANCELLED]) status?: 'CANCELLED';
}

export class ListTasksQuery {
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  /**
   * Mục trong "Việc của tôi". assigned: được giao (kể cả giao cho đơn vị mình chỉ huy); created: tôi giao;
   * review: chờ tôi duyệt. Bỏ trống: mọi công việc trong phạm vi được xem (đơn vị, toàn trường).
   */
  @IsOptional() @IsIn(TASK_VIEWS) view?: TaskView;
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

export class FollowersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsInt({ each: true }) userIds: number[];
}

export class ExtensionRequestDto {
  @IsDateString() newDueDate: string;
  @IsString() @Length(3, 2000) reason: string;
}

export class ExtensionDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
