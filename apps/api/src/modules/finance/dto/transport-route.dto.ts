import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export class CreateTransportRouteDto {
  @IsString() @MaxLength(100) name: string;
  @IsString() @MaxLength(30) code: string;
  @IsMoneyString() monthlyAmount: string;
}

export class UpdateTransportRouteDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(30) code?: string;
  @IsOptional() @IsMoneyString() monthlyAmount?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class TransportRouteQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @Transform(({ value }) => value === 'true') @IsBoolean()
  isActive?: boolean;
}
