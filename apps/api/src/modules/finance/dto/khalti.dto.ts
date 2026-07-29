import { IsUUID } from 'class-validator';

/**
 * Initiation takes ONLY the invoice id — the payable amount is computed
 * server-side from the invoice's outstanding balance (PAY-2 invariant 2:
 * the client never sends an amount; Khalti additionally receives it in paisa).
 *
 * BILL-5 Checkpoint C: `invoiceId` refers to a `bill_invoices.id` (not the
 * pre-BILL-5 `invoices.id`). Field name kept as-is (no rename) — only what
 * it points to changed.
 */
export class InitiateKhaltiPaymentDto {
  @IsUUID()
  invoiceId: string;
}
