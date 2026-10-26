import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsString() @Length(1, 64) username: string;
  @IsString() @Length(1, 128) password: string;
  @IsOptional() @Matches(/^\d{6}$/, { message: 'Mã xác thực gồm 6 chữ số' }) otp?: string;
}

export class ChangePasswordDto {
  @IsString() @Length(1, 128) currentPassword: string;
  @IsString() @Length(10, 128) newPassword: string;
}

export class OtpCodeDto {
  @Matches(/^\d{6}$/, { message: 'Mã xác thực gồm 6 chữ số' }) code: string;
}

export class DisableOtpDto extends OtpCodeDto {
  @IsString() @Length(1, 128) password: string;
}
