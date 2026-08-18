-- FEE-CLASS-GUARD — class/section mismatch guard on fee-structure assignment.
--
-- A bill_fee_structure is scoped to a class (and optionally a section); nothing
-- checked that against the target student at assignment time. The check itself
-- lives in the application (single-assign service + bulk-assign runner); these
-- columns are the accountability stamp for the deliberate override, mirroring
-- student_attendance.marked_by / marks.entered_by.
--
-- Purely additive and backfill-free by design: the spec explicitly withholds
-- authorization to touch existing rows, so every pre-existing assignment reads
-- as "not overridden" (DEFAULT false) — which is exactly true, since no
-- override could have been recorded before this migration existed. It does NOT
-- mean those rows were class-matched; auditing them needs its own ticket.

ALTER TABLE student_fee_structure_assignments
  ADD COLUMN IF NOT EXISTS class_mismatch_overridden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overridden_by_user_id     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS overridden_at             TIMESTAMPTZ;

-- The stamp is all-or-nothing: an overridden row carries both who and when,
-- a normal row carries neither. Cheap backstop against a future write path
-- setting the flag without the attribution (or vice versa).
ALTER TABLE student_fee_structure_assignments
  ADD CONSTRAINT chk_sfsa_override_stamp_complete
  CHECK (
    (class_mismatch_overridden = false AND overridden_by_user_id IS NULL AND overridden_at IS NULL)
    OR
    (class_mismatch_overridden = true AND overridden_by_user_id IS NOT NULL AND overridden_at IS NOT NULL)
  );

-- Job-level flag (spec §2: "applied uniformly to every student processed in
-- that run"). Frozen onto the job row at creation for the same reason
-- scope_student_ids is — the poller must never re-derive what the caller asked
-- for, and a job's audit trail should show the flag it actually ran under.
ALTER TABLE bulk_assign_jobs
  ADD COLUMN IF NOT EXISTS allow_cross_class BOOLEAN NOT NULL DEFAULT false;
