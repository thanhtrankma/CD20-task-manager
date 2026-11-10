import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** Số ngày: bội của 0,5. */
const days = { maxDecimalPlaces: 1 };

export class CategoryDto {
  @IsString() @Length(2, 100) name: string;
  @IsNumber(days) @Min(0) @Max(60) annualDays: number;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsNumber(days) @Min(0) @Max(60) annualDays?: number;
}

export class LeaveTypeDto {
  @Matches(/^[A-Z0-9_]{2,30}$/, { message: 'Mã loại nghỉ: chữ in hoa không dấu, số, dấu gạch dưới' }) code: string;
  @IsString() @Length(2, 100) name: string;
  @IsBoolean() deductsBalance: boolean;
}

export class UpdateLeaveTypeDto {
  @IsOptional() @IsString() @Length(2, 100) name?: string;
  @IsOptional() @IsBoolean() deductsBalance?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class HolidayDto {
  @Matches(YMD, { message: 'Ngày dạng YYYY-MM-DD' }) date: string;
  @IsString() @Length(2, 100) name: string;
}

export class HolidaysQuery {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year: number;
}

export class ShiftDto {
  @IsString() @Length(2, 100) name: string;
  @Matches(HHMM, { message: 'Giờ vào dạng HH:mm' }) startTime: string;
  @Matches(HHMM, { message: 'Giờ ra dạng HH:mm' }) endTime: string;
  @Matches(HHMM, { message: 'Giờ bắt đầu nghỉ trưa dạng HH:mm' }) breakStart: string;
  @Matches(HHMM, { message: 'Giờ hết nghỉ trưa dạng HH:mm' }) breakEnd: string;
  @IsInt() @Min(0) @Max(120) graceMinutes: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true })
  workdays: number[];
  @IsOptional() @IsBoolean() isDefault?: boolean;
  /** Ca 3 làm thêm từ giờ ra ca 2. */
  @IsOptional() @IsBoolean() overtimeEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(240) overtimeMinMinutes?: number;
}

export class UnitShiftDto {
  /** null: theo đơn vị cấp trên. */
  @IsOptional() @IsInt() workShiftId: number | null;
}

export class SettingsDto {
  /** Đơn nghỉ quá số ngày này phải qua lãnh đạo nhà trường duyệt. */
  @IsNumber(days) @Min(0) @Max(60) leaveEscalateDays: number;
}

export class StaffQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() unitId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
}

export class UpdateStaffDto {
  @IsOptional() @IsInt() staffCategoryId?: number | null;
  /** Mã nhân viên trên máy chấm công; chuỗi rỗng hoặc null để gỡ. */
  @IsOptional() @IsString() @MaxLength(32) attendanceCode?: string | null;
}

/** Một dòng tệp ghép mã chấm công, đối tượng (giao diện đọc tệp, gửi JSON). */
export class StaffImportRow {
  @IsString() @Length(3, 64) username: string;
  @IsOptional() @IsString() @MaxLength(32) attendanceCode?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
}

export class StaffImportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000, { message: 'Mỗi lần nhập tối đa 1.000 dòng' })
  @ValidateNested({ each: true })
  @Type(() => StaffImportRow)
  rows: StaffImportRow[];
}

export class BalanceDto {
  @IsInt() @Min(2000) @Max(2100) year: number;
  /** null: theo đối tượng. */
  @IsOptional() @IsNumber(days) @Min(0) @Max(90) entitledDays: number | null;
  @IsNumber(days) @Min(0) @Max(90) carriedDays: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}

export class RolloverDto {
  /** Năm mới; phép còn của năm trước chuyển sang, tối đa maxCarry ngày. */
  @IsInt() @Min(2000) @Max(2100) year: number;
  @IsNumber(days) @Min(0) @Max(90) maxCarry: number;
}
