import {
  IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export enum LateFeeRuleScope {
  GLOBAL = 'GLOBAL',
  FEE_HEAD = 'FEE_HEAD',
}

export enum LateFeeRuleType {
  FLAT = 'FLAT',
  PER_DAY = 'PER_DAY',
  PERCENT = 'PERCENT',
}

export class CreateLateFeeRuleDto {
  @IsEnum(LateFeeRuleScope) scope: LateFeeRuleScope;
  @IsOptional() @IsUUID() feeHeadId?: string;
  @IsEnum(LateFeeRuleType) type: LateFeeRuleType;
  @IsMoneyString() value: string;
  @IsOptional() @IsInt() @Min(0) graceDays?: number;
  @IsOptional() @IsMoneyString() capAmount?: string;
  @IsOptional() @IsBoolean() isEnabled?: boolean;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateLateFeeRuleDto {
  @IsOptional() @IsMoneyString() value?: string;
  @IsOptional() @IsInt() @Min(0) graceDays?: number;
  @IsOptional() @IsMoneyString() capAmount?: string;
  @IsOptional() @IsBoolean() isEnabled?: boolean;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class LateFeeRuleQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isEnabled?: boolean;
}
