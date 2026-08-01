-- 0029_bill_corrections.sql — BILL-6 Checkpoint A (credit notes + approval workflow)
-- Per BILL-6-SPEC.md §2. Purely additive: no existing table touched.
--
-- correction_reasons: deliberately a NEW lookup, not a reuse of discount_reasons.
-- discount_reasons is scoped to fee discounts/concessions applied at billing
-- time (student-concession.service.ts); a credit-note/refund/write-off reason
-- ("billing error", "family relocated — uncollectable") is a different domain
-- and would pollute that dropdown. Same shape as discount_reasons by design —
-- same CRUD pattern, same gl_account_code hook for the future ACC-1 mapping.

CREATE TABLE IF NOT EXISTS correction_reasons (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100)  NOT NULL,
  code            VARCHAR(30)   NOT NULL UNIQUE,
  gl_account_code TEXT,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- No new ledger table (student_ledger_entries already permits CREDIT_NOTE/
-- REFUND/WRITE_OFF — see 0021_bill_ledger.sql). This is the workflow + audit
-- wrapper; the ledger entry (via LedgerService) is the money effect.
CREATE TABLE IF NOT EXISTS bill_corrections (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_number      TEXT          UNIQUE NOT NULL,
  type                   VARCHAR(15)   NOT NULL CHECK (type IN ('CREDIT_NOTE','REFUND','WRITE_OFF')),
  student_id             UUID          NOT NULL REFERENCES students(id),
  academic_year_id       UUID          NOT NULL REFERENCES academic_years(id),
  target_invoice_id      UUID          REFERENCES bill_invoices(id),
  target_invoice_item_id UUID          REFERENCES bill_invoice_items(id),
  amount                 NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reason_id              UUID          NOT NULL REFERENCES correction_reasons(id),
  refund_method          VARCHAR(15)   CHECK (refund_method IN ('CASH','BANK_TRANSFER')),
  refund_reference       TEXT,
  status                 VARCHAR(10)   NOT NULL DEFAULT 'REQUESTED'
                           CHECK (status IN ('REQUESTED','APPROVED','REJECTED')),
  requested_by           UUID          NOT NULL REFERENCES users(id),
  requested_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  decided_by             UUID          REFERENCES users(id),
  decided_at             TIMESTAMPTZ,
  decision_note          TEXT,
  ledger_entry_id        UUID          REFERENCES student_ledger_entries(id),
  requires_approval      BOOLEAN       NOT NULL,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bill_corrections_student ON bill_corrections (student_id);
CREATE INDEX IF NOT EXISTS idx_bill_corrections_status ON bill_corrections (status);
CREATE INDEX IF NOT EXISTS idx_bill_corrections_type ON bill_corrections (type);
CREATE INDEX IF NOT EXISTS idx_bill_corrections_invoice ON bill_corrections (target_invoice_id)
  WHERE target_invoice_id IS NOT NULL;
