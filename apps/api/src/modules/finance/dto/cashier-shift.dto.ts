import { IsOptional, IsString, IsUUID } from 'class-validator';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export class OpenShiftDto {
  @IsUUID() academicYearId: string;
  @IsMoneyString() openingFloat: string;
  @IsOptional() @IsString() notes?: string;
}

export class CloseShiftDto {
  @IsMoneyString() countedCash: string;
  @IsOptional() @IsString() notes?: string;
}
