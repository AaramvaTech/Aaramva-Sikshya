import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export enum PaymentMethod {
  CASH = 'CASH',
  ESEWA = 'ESEWA',
  KHALTI = 'KHALTI',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHEQUE = 'CHEQUE',
}

export class RecordPaymentDto {
  @IsUUID() invoiceId: string;
  @IsNumber() @Min(0.01) amount: number;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() notes?: string;
}

export class PaymentQueryDto {
  page?: number;
  limit?: number;
  invoiceId?: string;
  studentId?: string;
  method?: PaymentMethod;
  fromDate?: string;
  toDate?: string;
}
