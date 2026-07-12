-- 0007_assignments.sql — EDU-1 (assignments & homework, Phase B first module)
-- Two tables. assignments: teacher-authored homework for a class (section
-- nullable = whole class), FILE-1 attachment keys in JSONB, DRAFT→PUBLISHED
-- (assignment.published event fires on that edge only)→CLOSED.
-- assignment_submissions: one live row per (assignment, student) — resubmission
-- UPDATEs it (no history this session); LATE = submitted after the due date's
-- end-of-day in Asia/Kathmandu (computed in the service, stored as status).
CREATE TABLE IF NOT EXISTS {{schema}}.assignments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID          NOT NULL REFERENCES {{schema}}.academic_years(id),
  class_id         UUID          NOT NULL REFERENCES {{schema}}.classes(id),
  section_id       UUID          REFERENCES {{schema}}.sections(id),
  subject_id       UUID          NOT NULL REFERENCES {{schema}}.subjects(id),
  created_by       UUID          NOT NULL REFERENCES {{schema}}.users(id),
  title            VARCHAR(200)  NOT NULL,
  description      TEXT,
  due_date         DATE          NOT NULL,
  attachment_keys  JSONB         NOT NULL DEFAULT '[]',
  status           VARCHAR(12)   NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED')),
  published_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assignments_class_section
  ON {{schema}}.assignments (class_id, section_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_status_due
  ON {{schema}}.assignments (status, due_date) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS {{schema}}.assignment_submissions (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID          NOT NULL REFERENCES {{schema}}.assignments(id),
  student_id    UUID          NOT NULL REFERENCES {{schema}}.students(id),
  text_answer   TEXT,
  file_key      TEXT,
  submitted_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  status        VARCHAR(12)   NOT NULL DEFAULT 'SUBMITTED'
                  CHECK (status IN ('SUBMITTED', 'LATE', 'REVIEWED')),
  marks         NUMERIC(5,2),
  feedback      TEXT,
  reviewed_by   UUID          REFERENCES {{schema}}.users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_student
  ON {{schema}}.assignment_submissions (student_id);
