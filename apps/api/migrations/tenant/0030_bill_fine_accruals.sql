-- 0030_bill_fine_accruals.sql — BILL-7 Checkpoint A (late-fee accrual engine)
-- Per BILL-7-SPEC.md §2. Purely additive: no existing table touched. Reuses
-- late_fee_rules (0019_bill_catalog.sql, already ships per-tenant, empty,
-- is_enabled default false — B7-4's "off by default" is this existing
-- column, no new tenant-level toggle needed) and the ledger's FINE entry
-- type (0021_bill_ledger.sql). This migration only adds accrual tracking
-- (with its own snapshot columns, B7-8) and a run log.

CREATE TABLE IF NOT EXISTS bill_fine_runs (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by         VARCHAR(10)   NOT NULL CHECK (triggered_by IN ('SCHEDULED','MANUAL')),
  triggered_by_user_id UUID          REFERENCES users(id),
  run_date             DATE          NOT NULL,
  started_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  finished_at          TIMESTAMPTZ,
  invoices_scanned     INT           NOT NULL DEFAULT 0,
  invoices_fined       INT           NOT NULL DEFAULT 0,
  total_fine_posted    NUMERIC(12,2) NOT NULL DEFAULT 0,
  status               VARCHAR(10)   NOT NULL DEFAULT 'RUNNING'
                          CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bill_fine_runs_run_date ON bill_fine_runs (run_date);

-- B7-7/B7-10: the UNIQUE constraint is the hard idempotency backstop — a
-- second accrual for the same invoice on the same accrued-through date
-- cannot be inserted no matter what the application logic computes.
CREATE TABLE IF NOT EXISTS bill_fine_accruals (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_invoice_id     UUID          NOT NULL REFERENCES bill_invoices(id),
  student_id          UUID          NOT NULL REFERENCES students(id),
  late_fee_rule_id    UUID          NOT NULL REFERENCES late_fee_rules(id),
  accrued_through     DATE          NOT NULL,
  days_overdue        INT           NOT NULL,
  total_fine          NUMERIC(12,2) NOT NULL,
  delta_posted        NUMERIC(12,2) NOT NULL,
  rule_type_snapshot  TEXT,
  rule_value_snapshot NUMERIC(12,2),
  rule_cap_snapshot   NUMERIC(12,2),
  ledger_entry_id     UUID          NOT NULL REFERENCES student_ledger_entries(id),
  fine_run_id         UUID          REFERENCES bill_fine_runs(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (bill_invoice_id, accrued_through)
);

CREATE INDEX IF NOT EXISTS idx_bill_fine_accruals_invoice ON bill_fine_accruals (bill_invoice_id);
CREATE INDEX IF NOT EXISTS idx_bill_fine_accruals_student ON bill_fine_accruals (student_id);
CREATE INDEX IF NOT EXISTS idx_bill_fine_accruals_run ON bill_fine_accruals (fine_run_id);
