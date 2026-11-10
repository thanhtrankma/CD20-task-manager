import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateOvertimeDto {
  @Matches(YMD, { message: 'Ngày dạng YYYY-MM-DD' }) date: string;
  /** Giờ bắt đầu; bỏ trống: giờ ra ca 2. */
  @IsOptional() @Matches(HHMM, { message: 'Giờ dạng HH:mm' }) startTime?: string;
  @Matches(HHMM, { message: 'Giờ dạng HH:mm' }) endTime: string;
  @IsString() @Length(3, 2000) reason: string;
}

export class DecideOvertimeDto {
  @IsIn(['APPROVED', 'REJECTED']) decision: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class BatchApproveOvertimeDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsInt({ each: true }) ids: number[];
}

export class ListOvertimeQuery {
  @IsOptional() @IsIn(['mine', 'approve', 'unit']) scope: 'mine' | 'approve' | 'unit' = 'mine';
  @IsOptional() @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']) status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  @IsOptional() @Type(() => Number) @IsInt() unitId?: number;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Matches(YMD) from?: string;
  @IsOptional() @Matches(YMD) to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize = 20;
}
