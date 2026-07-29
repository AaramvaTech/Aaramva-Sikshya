-- 0024_bill_payments.sql — BILL-5 Checkpoint A (payment engine core)
-- Per BILL-5-SPEC.md §2. Purely additive: no existing bill_* table is
-- altered or dropped. One necessary widen: student_ledger_entries.entry_type
-- (0021_bill_ledger.sql) only anticipated OPENING_BALANCE, INVOICE, PAYMENT,
-- REFUND, CREDIT_NOTE, FINE, WRITE_OFF, ADJUSTMENT — B5-9 requires a DEPOSIT
-- entry type for pure-advance payments (no invoice touched). Not listed in
-- BILL-5-SPEC's own §8 cross-phase touch register — found while implementing,
-- logged in BILL-BUGS.md. Widened via a catalog-driven DO block (not a
-- hardcoded constraint name) since the original CHECK was inline on the
-- column, so Postgres auto-named it rather than it being explicitly given a
-- name in 0021.

CREATE TABLE IF NOT EXISTS bill_payments (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number     TEXT          NOT NULL UNIQUE,
  student_id         UUID          NOT NULL REFERENCES students(id),
  academic_year_id   UUID          NOT NULL REFERENCES academic_years(id),
  amount             NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method             VARCHAR(15)   NOT NULL CHECK (method IN
                        ('CASH','CHEQUE','BANK_TRANSFER','ESEWA','KHALTI')),
  status             VARCHAR(10)   NOT NULL DEFAULT 'CLEARED'
                        CHECK (status IN ('CLEARED','PENDING','BOUNCED','VOIDED')),
  received_date      DATE          NOT NULL,
  received_bs_year   INT,
  received_bs_month  INT,
  received_bs_day    INT,
  reference          TEXT,
  cheque_bank        TEXT,
  cheque_date        DATE,
  allocation_mode    VARCHAR(15)   NOT NULL CHECK (allocation_mode IN
                        ('AUTO_FIFO','MANUAL','ADVANCE_ONLY')),
  ledger_entry_id    UUID,
  gateway_txn_ref    TEXT,
  notes              TEXT,
  received_by        UUID          NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bill_payments_student ON bill_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_status ON bill_payments (status);
CREATE INDEX IF NOT EXISTS idx_bill_payments_received_date ON bill_payments (received_date);

CREATE TABLE IF NOT EXISTS bill_payment_allocations (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_payment_id  UUID          NOT NULL REFERENCES bill_payments(id) ON DELETE CASCADE,
  bill_invoice_id  UUID          NOT NULL REFERENCES bill_invoices(id),
  amount           NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bpa_payment ON bill_payment_allocations (bill_payment_id);
CREATE INDEX IF NOT EXISTS idx_bpa_invoice ON bill_payment_allocations (bill_invoice_id);

-- One payment never allocates twice to the same invoice — a second top-up
-- against the same invoice is a second bill_payment, not a second row here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bpa_payment_invoice
  ON bill_payment_allocations (bill_payment_id, bill_invoice_id);

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'student_ledger_entries'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%entry_type%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE student_ledger_entries DROP CONSTRAINT %I', con_name);
  END IF;

  ALTER TABLE student_ledger_entries
    ADD CONSTRAINT student_ledger_entries_entry_type_check
    CHECK (entry_type IN ('OPENING_BALANCE','INVOICE','PAYMENT','DEPOSIT',
                           'REFUND','CREDIT_NOTE','FINE','WRITE_OFF','ADJUSTMENT'));
END $$;
