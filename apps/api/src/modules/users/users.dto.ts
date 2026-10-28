import { Role } from '../../generated/prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, ValidateNested } from 'class-validator';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateUserDto {
  @Matches(/^[a-z0-9._-]{3,64}$/, {
    message: 'Tên đăng nhập 3–64 ký tự: chữ thường không dấu, số, dấu chấm, - hoặc _',
  })
  username: string;
  @IsString() @Length(2, 255) fullName: string;
  @IsOptional() @IsString() @MaxLength(100) rank?: string;
  @IsOptional() @IsString() @MaxLength(255) position?: string;
  @IsOptional() @IsEmail({}, { message: 'Địa chỉ thư không hợp lệ' }) email?: string;
  @IsInt() unitId: number;
  @IsEnum(Role) role: Role;
  /** Mật khẩu tạm; người dùng phải đổi ở lần đăng nhập đầu. */
  @IsString() @Length(10, 128) temporaryPassword: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @Length(2, 255) fullName?: string;
  @IsOptional() @IsString() @MaxLength(100) rank?: string;
  @IsOptional() @IsString() @MaxLength(255) position?: string;
  @IsOptional() @IsEmail({}, { message: 'Địa chỉ thư không hợp lệ' }) email?: string | null;
  @IsOptional() @IsInt() unitId?: number;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ResetPasswordDto {
  @IsString() @Length(10, 128) temporaryPassword: string;
}

export class ListUsersQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() unitId?: number;
}

/** Một dòng trong tệp Excel nhập tài khoản (giao diện đọc tệp, gửi lên dạng JSON). */
export class ImportUserRow {
  @Matches(/^[a-z0-9._-]{3,64}$/, { message: 'Tên đăng nhập 3–64 ký tự: chữ thường không dấu, số, . - _' })
  username: string;
  @IsString() @Length(2, 255) fullName: string;
  @IsString() @Length(2, 20) unitCode: string;
  /** Không cho nhập tài khoản quản trị bằng tệp. */
  @IsIn(['STAFF', 'UNIT_HEAD', 'LEADER']) role: 'STAFF' | 'UNIT_HEAD' | 'LEADER';
  @IsOptional() @IsString() @MaxLength(100) rank?: string;
  @IsOptional() @IsString() @MaxLength(255) position?: string;
  @IsOptional() @IsEmail({}, { message: 'Địa chỉ thư không hợp lệ' }) email?: string;
}

export class ImportUsersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300, { message: 'Mỗi lần nhập tối đa 300 tài khoản' })
  @ValidateNested({ each: true })
  @Type(() => ImportUserRow)
  rows: ImportUserRow[];
}
