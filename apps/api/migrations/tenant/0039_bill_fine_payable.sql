-- 0039_bill_fine_payable.sql — BILL-7 checkout gap: late fees are visible
-- (they post a real FINE debit to student_ledger_entries at accrual time)
-- but had no payable target anywhere in the checkout stack — the whole
-- allocation model (bill_payment_allocations) only ever knew about invoices.
-- Purely additive: no existing column dropped, no existing row touched.

-- bill_invoice_id was NOT NULL; a fine-targeted allocation has no invoice.
ALTER TABLE bill_payment_allocations ALTER COLUMN bill_invoice_id DROP NOT NULL;

ALTER TABLE bill_payment_allocations
  ADD COLUMN bill_fine_accrual_id UUID REFERENCES bill_fine_accruals(id);

-- Exactly one target per allocation row — never both, never neither.
ALTER TABLE bill_payment_allocations
  ADD CONSTRAINT chk_bpa_exactly_one_target
  CHECK ((bill_invoice_id IS NOT NULL) <> (bill_fine_accrual_id IS NOT NULL));

-- The old plain UNIQUE(bill_payment_id, bill_invoice_id) can't survive
-- bill_invoice_id going nullable — two fine-only rows on the same payment
-- would both read (payment_id, NULL) and Postgres treats distinct NULLs as
-- not-equal, so the old index would silently stop enforcing anything for
-- fine rows anyway. Replaced with two partial unique indexes, one per
-- target column, each enforcing "no double-allocation to the same target
-- from one payment" exactly like the original did for invoices alone.
DROP INDEX IF EXISTS uq_bpa_payment_invoice;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bpa_payment_invoice
  ON bill_payment_allocations (bill_payment_id, bill_invoice_id)
  WHERE bill_invoice_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bpa_payment_fine_accrual
  ON bill_payment_allocations (bill_payment_id, bill_fine_accrual_id)
  WHERE bill_fine_accrual_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bpa_fine_accrual ON bill_payment_allocations (bill_fine_accrual_id);
