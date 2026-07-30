import { IsEnum, IsOptional, IsString } from 'class-validator';

const CHEQUE_TRANSITION_STATUSES = ['CLEARED', 'BOUNCED'] as const;
export type ChequeTransitionStatus = (typeof CHEQUE_TRANSITION_STATUSES)[number];

export class UpdateChequeStatusDto {
  @IsEnum(CHEQUE_TRANSITION_STATUSES) status: ChequeTransitionStatus;
  @IsOptional() @IsString() reason?: string;
}

export class VoidPaymentDto {
  @IsOptional() @IsString() reason?: string;
}
