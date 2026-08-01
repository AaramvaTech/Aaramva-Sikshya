import { IsBoolean, IsOptional } from 'class-validator';
import { IsMoneyString } from '../../../common/money/is-money-string.validator';

export class UpdateFinanceSettingsDto {
  @IsOptional() @IsBoolean() invoiceNumberingReset?: boolean;

  /** BILL-6 B6-3. */
  @IsOptional() @IsMoneyString() creditNoteApprovalThreshold?: string;
}
