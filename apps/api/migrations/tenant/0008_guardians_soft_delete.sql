-- 0008_guardians_soft_delete.sql — QA-1 OBS-A.
-- The guardians table was the one main entity missing the platform soft-delete
-- column (deleted_at), unlike students/staff/etc. There is no guardian delete
-- path today (hard or soft), so this adds the column to bring guardians in line
-- with the "soft delete via deleted_at only" convention and make a future
-- guardian removal correct-by-construction. Idempotent.
ALTER TABLE {{schema}}.guardians
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial index: the guardian reads filter `deleted_at IS NULL`, so index the
-- live rows only (matches the student_id lookups the guardian queries do).
CREATE INDEX IF NOT EXISTS idx_guardians_student_active
  ON {{schema}}.guardians (student_id)
  WHERE deleted_at IS NULL;
