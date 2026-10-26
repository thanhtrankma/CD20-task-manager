import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateUnitDto {
  @Matches(/^[A-Za-z0-9_-]{2,20}$/, { message: 'Mã đơn vị 2–20 ký tự: chữ, số, - hoặc _' })
  code: string;
  @IsString() @Length(2, 255) name: string;
  @IsOptional() @IsInt() parentId?: number;
}

export class UpdateUnitDto {
  @IsOptional() @IsString() @Length(2, 255) name?: string;
  @IsOptional() @IsInt() parentId?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
