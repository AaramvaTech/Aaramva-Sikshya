import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateClassDto {
  @IsString() @MinLength(1)
  name: string;

  @IsOptional() @IsString()
  alias?: string;

  @IsInt() @Min(0)
  orderIndex: number;
}

export class UpdateClassDto {
  @IsOptional() @IsString() @MinLength(1)
  name?: string;

  @IsOptional() @IsString()
  alias?: string;

  @IsOptional() @IsInt() @Min(0)
  orderIndex?: number;
}

export class ListClassesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 20;
}
