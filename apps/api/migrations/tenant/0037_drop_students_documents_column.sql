-- STUDENT-DOCS-1 Phase 3: drop the vestigial students.documents JSONB column.
-- Unlike 0002's students.guardians (which had real historical data and needed
-- a backfill before dropping), this column was confirmed unused across its
-- entire history: read once (student.entity.ts's toStudentResponse, always
-- `row.documents ?? []`), written by nothing — no INSERT/UPDATE in
-- student.service.ts ever references it, it only ever held its own
-- '[]'::jsonb DEFAULT. Verified empirically zero non-empty rows across all
-- 8 tenants before writing this migration. No backfill needed.
--
-- The real feature (STUDENT-DOCS-1 Phases 1-2) uses the student_documents
-- table (0036) instead, which this column was never wired to.

ALTER TABLE {{schema}}.students DROP COLUMN IF EXISTS documents;
