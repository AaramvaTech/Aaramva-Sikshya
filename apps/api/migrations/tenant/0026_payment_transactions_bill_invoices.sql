-- 0026_payment_transactions_bill_invoices.sql — BILL-5 Checkpoint C
-- Per BILL-5-SPEC.md §7/§8 and Srijan's pre-flight ruling
-- (docs/api-contracts/BILL-5-checkpoint-c-preflight.md). Purely additive:
-- payment_transactions' existing columns, meaning, and constraints are
-- fully preserved for every historical row (invoice_id stays populated for
-- them, unchanged). Only NEW gateway-initiated rows (after this migration)
-- set bill_invoice_id instead — mirrors the exact one-of-two-kinds CHECK
-- pattern already used for bill_invoice_items.fee_head_id/
-- transport_route_id (TRANSPORT-ITEM).

ALTER TABLE payment_transactions
  ALTER COLUMN invoice_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS bill_invoice_id UUID REFERENCES bill_invoices(id),
  ADD COLUMN IF NOT EXISTS bill_payment_id UUID REFERENCES bill_payments(id);

ALTER TABLE payment_transactions
  ADD CONSTRAINT chk_payment_transactions_one_invoice_kind
  CHECK ((invoice_id IS NOT NULL)::int + (bill_invoice_id IS NOT NULL)::int = 1);
