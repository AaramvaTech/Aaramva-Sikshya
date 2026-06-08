import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateSubjectDto {
  @IsString() @MinLength(1)
  name: string;

  @IsOptional() @IsString()
  code?: string;

  @IsOptional() @IsIn(['THEORY', 'PRACTICAL', 'BOTH'])
  type?: string;
}

export class UpdateSubjectDto {
  @IsOptional() @IsString() @MinLength(1)
  name?: string;

  @IsOptional() @IsString()
  code?: string;

  @IsOptional() @IsIn(['THEORY', 'PRACTICAL', 'BOTH'])
  type?: string;
}

export class ListSubjectsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number = 20;
}
