-- 0021_bill_ledger.sql — BILL-3 (Phase 4: ledger core)
-- The load-bearing table set. Purely additive: no existing table is touched,
-- no old finance table is dropped (that cutover is separate, "after the
-- ledger is proven", per BILL-SPEC.md §2 and R15).

CREATE TABLE IF NOT EXISTS student_ledger_entries (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID          NOT NULL REFERENCES students(id),
  academic_year_id  UUID          NOT NULL REFERENCES academic_years(id),
  entry_date        DATE          NOT NULL,
  entry_bs_year     INT,
  entry_bs_month    INT,
  entry_bs_day      INT,
  entry_type        VARCHAR(20)   NOT NULL CHECK (entry_type IN
                       ('OPENING_BALANCE','INVOICE','PAYMENT','REFUND',
                        'CREDIT_NOTE','FINE','WRITE_OFF','ADJUSTMENT')),
  debit             NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit            NUMERIC(12,2) NOT NULL DEFAULT 0,
  ref_doc_type      TEXT,
  ref_doc_id        UUID,
  narration         TEXT,
  reverses_entry_id UUID          REFERENCES student_ledger_entries(id),
  created_by        UUID          NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (NOT (debit > 0 AND credit > 0)),
  CHECK (debit > 0 OR credit > 0)
);

CREATE INDEX IF NOT EXISTS idx_sle_student_date
  ON student_ledger_entries (student_id, entry_date, created_at);

CREATE INDEX IF NOT EXISTS idx_sle_reverses
  ON student_ledger_entries (reverses_entry_id)
  WHERE reverses_entry_id IS NOT NULL;

-- R3, enforced by Postgres, not discipline: an unconditional BEFORE
-- UPDATE OR DELETE trigger. TG_OP/OLD are available in both branches, so one
-- function covers both operations.
CREATE OR REPLACE FUNCTION enforce_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'student_ledger_entries is append-only: % is not permitted on id=%', TG_OP, OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_immutable ON student_ledger_entries;
CREATE TRIGGER trg_ledger_immutable
  BEFORE UPDATE OR DELETE ON student_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION enforce_ledger_immutability();

-- Denormalized cache — one row per student (lifetime running balance, not
-- per academic year; academic_year_id here just records which year the
-- most recent posting belonged to). "For list views only" (spec) — the
-- app's own single-student reads always recompute the live SQL sum instead
-- of trusting this table, so this row is never itself the source of truth.
CREATE TABLE IF NOT EXISTS student_account_balances (
  student_id        UUID          PRIMARY KEY REFERENCES students(id),
  academic_year_id  UUID          NOT NULL REFERENCES academic_years(id),
  balance           NUMERIC(12,2) NOT NULL DEFAULT 0,
  last_entry_id     UUID          REFERENCES student_ledger_entries(id),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
