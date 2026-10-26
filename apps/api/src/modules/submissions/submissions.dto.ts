import { IsArray, IsIn, IsInt, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class CreateSubmissionDto {
  @IsString() @Length(1, 20_000) content: string;
  /** Mã các tệp đã tải lên trước qua POST /files (chưa gắn với báo cáo nào). */
  @IsOptional() @IsArray() @IsInt({ each: true }) attachmentIds?: number[];
}

export class ReviewSubmissionDto {
  @IsIn(['APPROVED', 'RETURNED']) decision: 'APPROVED' | 'RETURNED';
  @IsOptional() @IsString() @MaxLength(5000) note?: string;
}
