import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ymd = { message: 'Ngày dạng YYYY-MM-DD' };

export class PunchRow {
  @IsString() @Length(1, 32) code: string;
  /** Thời điểm chấm, ISO 8601 có múi giờ (giao diện đọc giờ trong tệp theo giờ Việt Nam). */
  @IsISO8601({ strict: true }) at: string;
}

export class ImportPunchesDto {
  @IsString() @Length(1, 255) fileName: string;
  /** Tệp lớn gửi nhiều lô: lô sau gửi kèm mã lần nhập của lô đầu. */
  @IsOptional() @IsInt() importId?: number;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000, { message: 'Mỗi lô tối đa 2.000 lượt chấm' })
  @ValidateNested({ each: true })
  @Type(() => PunchRow)
  punches: PunchRow[];
}

export class RangeQuery {
  @IsOptional() @Matches(YMD, ymd) from?: string;
  @IsOptional() @Matches(YMD, ymd) to?: string;
}

export class UnitQuery extends RangeQuery {
  @IsOptional() @Type(() => Number) @IsInt() unitId?: number;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  /** Có giá trị: đang xuất Excel (ghi nhật ký). */
  @IsOptional() @IsString() export?: string;
}
