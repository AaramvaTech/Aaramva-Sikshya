import { IsBoolean } from 'class-validator';

export class UpdateFinanceSettingsDto {
  @IsBoolean() invoiceNumberingReset: boolean;
}
