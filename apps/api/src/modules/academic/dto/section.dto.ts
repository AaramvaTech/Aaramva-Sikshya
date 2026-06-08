import { IsInt, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class CreateSectionDto {
  @IsString() @MinLength(1)
  name: string;

  @IsOptional() @IsInt() @Min(1)
  capacity?: number;

  @IsOptional() @IsUUID()
  classTeacherId?: string;
}

export class UpdateSectionDto {
  @IsOptional() @IsString() @MinLength(1)
  name?: string;

  @IsOptional() @IsInt() @Min(1)
  capacity?: number;

  @IsOptional() @IsUUID()
  classTeacherId?: string;
}
