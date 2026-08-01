-- 0028_cashier_shifts.sql — BILL-9 Checkpoint B (cashier daily-close)
-- Per BILL-9-SPEC.md §4. Purely additive: no existing table touched.
-- expected_cash/variance are computed SQL-side from bill_payments at close
-- time and stored as a snapshot — this table is never the source of truth
-- for money, `bill_payments` is (spec §2: "the truth is the payments").

CREATE TABLE IF NOT EXISTS cashier_shifts (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_user_id   UUID          NOT NULL REFERENCES users(id),
  academic_year_id  UUID          NOT NULL REFERENCES academic_years(id),
  opened_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  opened_bs_year    INT,
  opened_bs_month   INT,
  opened_bs_day     INT,
  opening_float     NUMERIC(12,2) NOT NULL DEFAULT 0,
  closed_at         TIMESTAMPTZ,
  closed_by         UUID          REFERENCES users(id),
  counted_cash      NUMERIC(12,2),
  expected_cash     NUMERIC(12,2),
  variance          NUMERIC(12,2),
  status            VARCHAR(10)   NOT NULL DEFAULT 'OPEN'
                       CHECK (status IN ('OPEN','CLOSED')),
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- B9-3: "one OPEN shift per cashier at a time" — partial unique, same
-- convention as uq_bill_runs_idempotency_key / uq_sfsa_one_active_per_student_year.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cashier_shifts_one_open
  ON cashier_shifts (cashier_user_id) WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_cashier
  ON cashier_shifts (cashier_user_id, opened_at);
