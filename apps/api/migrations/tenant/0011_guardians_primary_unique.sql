-- 0011_guardians_primary_unique.sql — REG-1 Phase 1.
-- Enforce AT MOST ONE primary guardian per student among live (non-soft-deleted)
-- rows. REG-1 §2 wants "exactly one primary guardian per student": the DTO layer
-- rejects a student registration that has no isPrimary guardian (the "at least
-- one" half); this partial unique index is the "at most one" half. Scoped to
-- deleted_at IS NULL so a soft-deleted primary never blocks designating a new one.
--
-- Deliberately NOT unique on (student_id, phone): father and mother may share a
-- phone (MIG-3 decision). Only the single-primary invariant is constrained here.
--
-- If a tenant already holds a student with >1 live primary guardian, this index
-- creation fails on that tenant and the runner halts (forward-only, no down
-- migration) — canary the demo school first and reconcile any offender by hand.
CREATE UNIQUE INDEX IF NOT EXISTS uq_guardians_one_primary_per_student
  ON guardians (student_id)
  WHERE is_primary = true AND deleted_at IS NULL;
