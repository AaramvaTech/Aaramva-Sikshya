-- 0027_bill_print_jobs.sql — BILL-8 Checkpoint C (bulk print)
-- Per BILL-8-SPEC.md §5/§7/B8-9: "bulk-print is a background job (established
-- scheduler/outbox pattern) producing one merged PDF to MinIO with a
-- presigned link." Modeled directly on bulk_assign_jobs
-- (0020_bill_assignment.sql) — same PENDING/RUNNING/COMPLETED/FAILED shape,
-- progress counters, frozen scope. Two differences: the frozen scope here is
-- a list of bill_invoice ids (not student ids — a print job's unit of work is
-- "render this invoice", not "assign this student"), and a job carries
-- result_key once COMPLETED (bulk_assign_jobs has no analogous output
-- artifact — its result IS the DB writes). No deleted_at — same reasoning as
-- bulk_assign_jobs/payment_transactions/device_tokens: an operational audit
-- log of a background run, not a soft-deletable domain entity.

CREATE TABLE IF NOT EXISTS bill_print_jobs (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type       VARCHAR(10)   NOT NULL CHECK (job_type IN ('RUN','CLASS')),
  ref_run_id     UUID          REFERENCES bill_runs(id),
  ref_class_id   UUID          REFERENCES classes(id),
  ref_section_id UUID          REFERENCES sections(id),
  ref_bs_year    INT,
  ref_bs_month   INT,
  invoice_ids    JSONB         NOT NULL,
  language       VARCHAR(4)    NOT NULL DEFAULT 'EN',
  status         VARCHAR(12)   NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  total          INT           NOT NULL DEFAULT 0,
  processed      INT           NOT NULL DEFAULT 0,
  failed_count   INT           NOT NULL DEFAULT 0,
  failures       JSONB         NOT NULL DEFAULT '[]',
  result_key     TEXT,
  created_by     UUID          NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ
);

-- Poller pickup index — same shape as idx_bulk_assign_jobs_pending.
CREATE INDEX IF NOT EXISTS idx_bill_print_jobs_pending
  ON bill_print_jobs (created_at)
  WHERE status IN ('PENDING','RUNNING');
