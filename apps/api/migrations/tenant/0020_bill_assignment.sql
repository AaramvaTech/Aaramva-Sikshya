-- 0020_bill_assignment.sql — BILL-2 (Phase 3: assignment and concessions)
-- Per BILL-SPEC.md §6. Purely additive: no existing table is touched. Assigns
-- a whole bill_fee_structure (BILL-1) to a student, layers per-head overrides
-- and concessions on top, and tracks transport route assignment separately.
--
-- bulk_assign_jobs is new infrastructure not given explicit DDL by the spec
-- (spec only describes the job's *behavior*: "a job row exposing progress and
-- a per-student failure list", GET /finance/jobs/:id). Modeled after this
-- codebase's one existing outbox table (credential_deliveries,
-- 0010/0012_credential_delivery_*.sql) but with progress counters instead of
-- a single retry-attempt counter, since a bulk-assign job's unit of work is
-- "N students in this job", not "retry this one row". No deleted_at — same
-- reasoning as payment_transactions/device_tokens: this is an operational
-- audit log of a background run, not a soft-deletable domain entity.

CREATE TABLE IF NOT EXISTS student_fee_structure_assignments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID          NOT NULL REFERENCES students(id),
  fee_structure_id UUID          NOT NULL REFERENCES bill_fee_structures(id),
  academic_year_id UUID          NOT NULL REFERENCES academic_years(id),
  effective_from   DATE          NOT NULL,
  effective_to     DATE,
  assigned_by      UUID          NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

-- Spec §6: "partial unique: one active assignment per student per academic
-- year". Scoped to deleted_at IS NULL so a soft-deleted assignment never
-- blocks a fresh one (same convention as uq_guardians_one_primary_per_student,
-- 0011_guardians_primary_unique.sql). A student may accumulate any number of
-- CLOSED (effective_to NOT NULL) rows — that's the assignment history — but
-- at most one OPEN row per (student, year).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sfsa_one_active_per_student_year
  ON student_fee_structure_assignments (student_id, academic_year_id)
  WHERE effective_to IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sfsa_fee_structure
  ON student_fee_structure_assignments (fee_structure_id);

CREATE TABLE IF NOT EXISTS student_fee_overrides (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID          NOT NULL REFERENCES students(id),
  fee_head_id      UUID          NOT NULL REFERENCES fee_heads(id),
  academic_year_id UUID          NOT NULL REFERENCES academic_years(id),
  override_amount  NUMERIC(12,2) NOT NULL,
  reason           TEXT,
  effective_from   DATE          NOT NULL,
  effective_to     DATE,
  created_by       UUID          NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sfo_student_year
  ON student_fee_overrides (student_id, academic_year_id);

CREATE TABLE IF NOT EXISTS student_concessions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          UUID          NOT NULL REFERENCES students(id),
  fee_head_id         UUID          REFERENCES fee_heads(id), -- NULL = whole bill
  academic_year_id    UUID          NOT NULL REFERENCES academic_years(id),
  type                VARCHAR(10)   NOT NULL CHECK (type IN ('PERCENT','AMOUNT')),
  value               NUMERIC(12,2) NOT NULL,
  cap_amount          NUMERIC(12,2),
  discount_reason_id  UUID          NOT NULL REFERENCES discount_reasons(id),
  effective_from      DATE          NOT NULL,
  effective_to        DATE,
  notes               TEXT,
  created_by          UUID          NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sc_student_year
  ON student_concessions (student_id, academic_year_id);

CREATE TABLE IF NOT EXISTS student_transport_assignments (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID          NOT NULL REFERENCES students(id),
  transport_route_id UUID          NOT NULL REFERENCES transport_routes(id),
  effective_from     DATE          NOT NULL,
  effective_to       DATE,
  assigned_by        UUID          NOT NULL REFERENCES users(id),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sta_student
  ON student_transport_assignments (student_id);

CREATE TABLE IF NOT EXISTS bulk_assign_jobs (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_id  UUID          NOT NULL REFERENCES bill_fee_structures(id),
  academic_year_id  UUID          NOT NULL REFERENCES academic_years(id),
  scope_type        VARCHAR(15)   NOT NULL CHECK (scope_type IN ('CLASS','STUDENT_LIST')),
  scope_class_id    UUID          REFERENCES classes(id),
  scope_section_id  UUID          REFERENCES sections(id),
  scope_student_ids JSONB,
  effective_from    DATE          NOT NULL,
  status            VARCHAR(12)   NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  total             INT           NOT NULL DEFAULT 0,
  processed         INT           NOT NULL DEFAULT 0,
  failed_count      INT           NOT NULL DEFAULT 0,
  failures          JSONB         NOT NULL DEFAULT '[]',
  created_by        UUID          NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ
);

-- Poller pickup index — mirrors credential_deliveries' partial index on
-- status='PENDING' (0012_credential_delivery_pipeline.sql).
CREATE INDEX IF NOT EXISTS idx_bulk_assign_jobs_pending
  ON bulk_assign_jobs (created_at)
  WHERE status IN ('PENDING','RUNNING');
