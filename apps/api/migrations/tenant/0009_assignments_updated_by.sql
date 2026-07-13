-- 0009_assignments_updated_by.sql — QA-1 Phase 4 (architect decision 3).
-- Assignment writes are SOFT-scoped (any teacher may edit/publish/close any
-- assignment — cover-teacher reality). That is intentional ONLY if the write
-- records the actor. created_by captures the author; updated_by now captures
-- whoever last edited / published / closed it, so a cross-teacher edit is
-- accountable instead of anonymous. Idempotent.
ALTER TABLE {{schema}}.assignments
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES {{schema}}.users(id);
