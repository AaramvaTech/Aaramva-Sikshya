import {
  IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum FeeHeadRecurrence {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  TERM = 'TERM',
  ANNUAL = 'ANNUAL',
  ONE_TIME = 'ONE_TIME',
  ON_DEMAND = 'ON_DEMAND',
}

export enum ProrationPolicy {
  NONE = 'NONE',
  MONTHLY = 'MONTHLY',
}

export class CreateFeeHeadDto {
  @IsString() @MaxLength(100) name: string;
  @IsString() @MaxLength(30) code: string;
  @IsEnum(FeeHeadRecurrence) recurrence: FeeHeadRecurrence;
  @IsOptional() @IsBoolean() isTaxable?: boolean;
  @IsOptional() @IsBoolean() isRefundable?: boolean;
  @IsOptional() @IsEnum(ProrationPolicy) prorationPolicy?: ProrationPolicy;
  @IsOptional() @IsString() glAccountCode?: string;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
}

export class UpdateFeeHeadDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(30) code?: string;
  @IsOptional() @IsEnum(FeeHeadRecurrence) recurrence?: FeeHeadRecurrence;
  @IsOptional() @IsBoolean() isTaxable?: boolean;
  @IsOptional() @IsBoolean() isRefundable?: boolean;
  @IsOptional() @IsEnum(ProrationPolicy) prorationPolicy?: ProrationPolicy;
  @IsOptional() @IsString() glAccountCode?: string;
  @IsOptional() @IsInt() @Min(0) displayOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class FeeHeadQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isActive?: boolean;
}
