-- STUDENT-DOCS-1 Phase 1: student document records, mirroring staff_documents
-- (FILE-1's existing pattern for staff) column-for-column, FK'd to students(id)
-- directly rather than users(id) — a student's identity IS students.id (staff
-- ties to users.id because staff_profiles/users are separate rows; students
-- has no such split). document_type is free text (matches staff_documents'
-- own VARCHAR(50), no DB enum) — the curated kind list lives in the frontend
-- dropdown (Phase 2), same convention staff already uses.

CREATE TABLE student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id),
  document_type VARCHAR(50) NOT NULL,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_student_documents_student ON student_documents (student_id) WHERE deleted_at IS NULL;
