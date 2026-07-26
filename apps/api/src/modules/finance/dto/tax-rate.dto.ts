import {
  IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum TaxAppliesTo {
  ALL = 'ALL',
  TAXABLE_HEADS = 'TAXABLE_HEADS',
}

export class CreateTaxRateDto {
  @IsString() @MaxLength(100) name: string;
  // NUMERIC(5,3) — a percentage rate, not a currency amount, so this stays a
  // plain number (matches the existing discountPercent convention) rather
  // than @IsMoneyString(), which is hardcoded to 2dp and would reject a
  // genuine 3dp rate.
  @IsNumber({ maxDecimalPlaces: 3 }) @Min(0) @Max(100) rate: number;
  @IsOptional() @IsEnum(TaxAppliesTo) appliesTo?: TaxAppliesTo;
  @IsDateString() effectiveFrom: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateTaxRateDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class TaxRateQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;

  // "Active" for a tax rate isn't a stored flag — there's no is_active
  // column — it's whether today falls within [effective_from, effective_to].
  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isActive?: boolean;
}
