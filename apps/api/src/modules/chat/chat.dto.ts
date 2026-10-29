import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class DirectoryQuery {
  @IsOptional() @IsString() @Length(0, 100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() unitId?: number;
}

export class OpenDirectDto {
  @IsInt() userId!: number;
}

export class CreateGroupDto {
  @Transform(trim) @IsString() @Length(1, 100) name!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(199) @IsInt({ each: true }) memberIds!: number[];
}

export class CreateUnitGroupDto {
  @IsInt() unitId!: number;
  @IsOptional() @IsBoolean() includeSubunits?: boolean;
}

export class UpdateConversationDto {
  @IsOptional() @Transform(trim) @IsString() @Length(1, 100) name?: string;
  @IsOptional() @IsBoolean() includeSubunits?: boolean;
}

export class AddMembersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(199) @IsInt({ each: true }) userIds!: number[];
}

export class ListMessagesQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) before?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class SendMessageDto {
  @Transform(trim) @IsString() @Length(1, 4000) body!: string;
}

export class ReadDto {
  @IsInt() @Min(1) messageId!: number;
}

export class MuteDto {
  @IsBoolean() muted!: boolean;
}
