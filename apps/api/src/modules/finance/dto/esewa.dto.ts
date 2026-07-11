import { IsUUID } from 'class-validator';

/**
 * Initiation takes ONLY the invoice id — the payable amount is computed
 * server-side from the invoice's outstanding balance (PAY-1 invariant 2:
 * the client never sends an amount).
 */
export class InitiateEsewaPaymentDto {
  @IsUUID()
  invoiceId: string;
}
