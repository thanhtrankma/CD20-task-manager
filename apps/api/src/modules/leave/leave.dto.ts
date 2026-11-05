import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DayPart, LeaveStatus } from '../../generated/prisma/client';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymd = { message: 'Ngày dạng YYYY-MM-DD' };

export class LeaveSpanDto {
  @IsInt() typeId: number;
  @Matches(YMD, ymd) startDate: string;
  @Matches(YMD, ymd) endDate: string;
  /** Đơn một ngày: cả ngày, sáng hoặc chiều. Đơn nhiều ngày: cả ngày hoặc từ buổi chiều. */
  @IsOptional() @IsEnum(DayPart) startPart?: DayPart;
  /** Đơn nhiều ngày: cả ngày hoặc đến hết buổi sáng. */
  @IsOptional() @IsEnum(DayPart) endPart?: DayPart;
}

export class CreateLeaveDto extends LeaveSpanDto {
  @IsString() @Length(3, 2000) reason: string;
}

export class DecideLeaveDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class RevokeLeaveDto {
  @IsString() @Length(3, 2000) note: string;
}

export class BatchApproveLeaveDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsInt({ each: true }) ids: number[];
}

export class ListLeaveQuery {
  /** mine: đơn của tôi; approve: chờ tôi duyệt; unit: trong phạm vi xem (đơn vị, toàn trường). */
  @IsOptional() @IsIn(['mine', 'approve', 'unit']) scope: 'mine' | 'approve' | 'unit' = 'mine';
  @IsOptional() @IsEnum(LeaveStatus) status?: LeaveStatus;
  @IsOptional() @Type(() => Number) @IsInt() unitId?: number;
  @IsOptional() @Type(() => Number) @IsInt() typeId?: number;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  /** Đơn có ngày nghỉ giao với khoảng from–to. */
  @IsOptional() @Matches(YMD, ymd) from?: string;
  @IsOptional() @Matches(YMD, ymd) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize = 20;
}

export class BalanceQuery {
  @IsOptional() @Type(() => Number) @IsInt() userId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
}

export class AbsentQuery {
  @Matches(YMD, ymd) from: string;
  @Matches(YMD, ymd) to: string;
}
