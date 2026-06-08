import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum FeeCategoryType {
  ONE_TIME = 'ONE_TIME',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUALLY = 'ANNUALLY',
  EXAM = 'EXAM',
}

export class CreateFeeCategoryDto {
  @IsString() @MaxLength(100) name: string;
  @IsEnum(FeeCategoryType) type: FeeCategoryType;
  @IsOptional() @IsString() description?: string;
}

export class UpdateFeeCategoryDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsEnum(FeeCategoryType) type?: FeeCategoryType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class FeeCategoryQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  type?: FeeCategoryType;
  isActive?: boolean;
}
