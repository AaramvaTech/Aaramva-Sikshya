-- 0022_bill_run.sql — BILL-4 Checkpoint A (draft billing run engine)
-- Per BILL-4-SPEC.md §2. Purely additive: no existing table touched, no old
-- finance table modified (R10/R15 still in force). All four spec tables are
-- created now, in spec order, even though Checkpoint A's draft-generation
-- code only ever writes to bill_runs/bill_run_lines (zero bill_invoices /
-- bill_invoice_items rows this checkpoint — posting is Checkpoint B) — this
-- lets bill_run_lines.bill_invoice_id and bill_invoices.bill_run_id /
-- bill_invoice_items.bill_invoice_id FK correctly without a follow-up
-- migration.

CREATE TABLE IF NOT EXISTS bill_runs (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id  UUID          NOT NULL REFERENCES academic_years(id),
  bs_year           INT           NOT NULL,
  bs_month          INT           NOT NULL CHECK (bs_month BETWEEN 1 AND 12),
  scope             VARCHAR(15)   NOT NULL CHECK (scope IN ('CLASS','WHOLE_SCHOOL')),
  class_id          UUID          REFERENCES classes(id),
  status            VARCHAR(10)   NOT NULL DEFAULT 'DRAFT'
                       CHECK (status IN ('DRAFT','POSTING','POSTED','VOIDED')),
  issue_date        DATE          NOT NULL,
  due_date          DATE          NOT NULL,
  total_students    INT           NOT NULL DEFAULT 0,
  total_gross       NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_concession  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_tax         NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_net         NUMERIC(14,2) NOT NULL DEFAULT 0,
  idempotency_key   TEXT          NOT NULL,
  created_by        UUID          NOT NULL REFERENCES users(id),
  posted_by         UUID          REFERENCES users(id),
  posted_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

-- B4-3 idempotency: "per (tenant, academicYear, bsMonth, scope)". Partial
-- (not the spec DDL comment's bare UNIQUE) so voiding a DRAFT run (soft
-- delete) frees the key for a fresh draft — §3 "Void a draft... nothing to
-- unwind" implies re-drafting a voided period must be possible; a bare
-- UNIQUE would permanently block that. Same convention as
-- uq_sfsa_one_active_per_student_year (0020_bill_assignment.sql).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_runs_idempotency_key
  ON bill_runs (idempotency_key) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bill_runs_period
  ON bill_runs (academic_year_id, bs_year, bs_month);

CREATE TABLE IF NOT EXISTS bill_run_lines (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_run_id     UUID          NOT NULL REFERENCES bill_runs(id) ON DELETE CASCADE,
  student_id      UUID          NOT NULL REFERENCES students(id),
  outcome         VARCHAR(25)   NOT NULL CHECK (outcome IN
                     ('DRAFT','POSTED','SKIPPED_NO_ASSIGNMENT',
                      'SKIPPED_ALREADY_BILLED','EXCLUDED','FAILED')),
  skip_reason     TEXT,
  bill_invoice_id UUID,
  gross           NUMERIC(12,2) NOT NULL DEFAULT 0,
  concession      NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax             NUMERIC(12,2) NOT NULL DEFAULT 0,
  net             NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_run_lines_run ON bill_run_lines (bill_run_id);
CREATE INDEX IF NOT EXISTS idx_bill_run_lines_student ON bill_run_lines (student_id);

-- One line per student per run. Checkpoint A only ever inserts fresh rows
-- for a brand-new run, but this protects the invariant from day one (a
-- future "regenerate" rebuilds by deleting+reinserting, never duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_run_lines_run_student
  ON bill_run_lines (bill_run_id, student_id);

CREATE TABLE IF NOT EXISTS bill_invoices (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number      TEXT          UNIQUE,
  student_id          UUID          NOT NULL REFERENCES students(id),
  academic_year_id    UUID          NOT NULL REFERENCES academic_years(id),
  bill_run_id         UUID          NOT NULL REFERENCES bill_runs(id),
  bs_year             INT           NOT NULL,
  bs_month            INT           NOT NULL,
  issue_date          DATE          NOT NULL,
  due_date            DATE          NOT NULL,
  gross_amount        NUMERIC(12,2) NOT NULL,
  concession_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_base        NUMERIC(12,2) NOT NULL,
  tax_rate            NUMERIC(5,3),
  tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount          NUMERIC(12,2) NOT NULL,
  previous_balance    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_receivable    NUMERIC(12,2) NOT NULL,
  amount_in_words_en  TEXT,
  amount_in_words_ne  TEXT,
  status              VARCHAR(15)   NOT NULL DEFAULT 'POSTED'
                         CHECK (status IN ('POSTED','SETTLED','PARTIALLY_PAID','VOIDED')),
  ledger_entry_id     UUID,
  created_by          UUID          NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bill_invoices_student ON bill_invoices (student_id);
CREATE INDEX IF NOT EXISTS idx_bill_invoices_run ON bill_invoices (bill_run_id);

-- B4-3's other half: "already-invoiced students in that period are
-- skipped". Checkpoint A's SKIPPED_ALREADY_BILLED check queries against
-- this — table exists now even though nothing populates it until
-- Checkpoint B.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_invoices_student_period
  ON bill_invoices (student_id, academic_year_id, bs_year, bs_month) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS bill_invoice_items (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_invoice_id     UUID          NOT NULL REFERENCES bill_invoices(id) ON DELETE CASCADE,
  fee_head_id         UUID          NOT NULL REFERENCES fee_heads(id),
  fee_head_name       TEXT          NOT NULL,
  recurrence          TEXT,
  gross_amount        NUMERIC(12,2) NOT NULL,
  concession_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_taxable          BOOLEAN       NOT NULL DEFAULT false,
  net_amount          NUMERIC(12,2) NOT NULL,
  proration_note      TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_invoice_items_invoice ON bill_invoice_items (bill_invoice_id);

-- bill_run_lines.bill_invoice_id -> bill_invoices(id): added after
-- bill_invoices exists (Postgres can't forward-reference a table that
-- doesn't exist yet; the spec lists bill_run_lines before bill_invoices).
ALTER TABLE bill_run_lines
  ADD CONSTRAINT fk_bill_run_lines_invoice
  FOREIGN KEY (bill_invoice_id) REFERENCES bill_invoices(id);
