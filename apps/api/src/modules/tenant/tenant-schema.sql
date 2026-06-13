-- Called once per new school registration.
-- The provisioning code replaces :schema with the tenant schema name (e.g. tenant_sxs)
-- and runs every statement inside a single transaction.

CREATE SCHEMA IF NOT EXISTS ":schema";

-- LOCAL so it is scoped to the provisioning transaction (we run this through a
-- pooled connection; a non-LOCAL SET would leak into later queries).
SET LOCAL search_path TO ":schema";

-- Users table (lives inside tenant schema — each school's users are isolated)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'TEACHER',
  phone VARCHAR(20),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_users_email ON users(email);

-- Students
CREATE TABLE students (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL,
  student_id        VARCHAR(20)  UNIQUE NOT NULL,
  first_name        VARCHAR(100) NOT NULL,
  last_name         VARCHAR(100) NOT NULL,
  date_of_birth     DATE         NOT NULL,
  gender            VARCHAR(10)  NOT NULL CHECK (gender IN ('MALE', 'FEMALE', 'OTHER')),
  blood_group       VARCHAR(5),
  religion          VARCHAR(50),
  ethnicity         VARCHAR(50),
  nationality       VARCHAR(50)  NOT NULL DEFAULT 'Nepali',
  mother_tongue     VARCHAR(50),
  phone             VARCHAR(20),
  email             VARCHAR(255),
  permanent_address JSONB,
  temporary_address JSONB,
  guardians         JSONB,
  class_name        VARCHAR(50),
  section_name      VARCHAR(50),
  roll_number       INT,
  admission_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
  academic_year     VARCHAR(20),
  previous_school   VARCHAR(255),
  photo_url         TEXT,
  documents         JSONB        NOT NULL DEFAULT '[]',
  status            VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PASSED_OUT', 'EXPELLED', 'TRANSFERRED', 'DROPPED')),
  created_by        UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_students_class      ON students(class_name, section_name);
CREATE INDEX idx_students_name       ON students(first_name, last_name);
CREATE INDEX idx_students_status     ON students(status) WHERE deleted_at IS NULL;

-- ─── ACADEMIC YEAR ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_years (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(20)  NOT NULL,
  year_bs      INT          NOT NULL,
  start_date   DATE         NOT NULL,
  end_date     DATE         NOT NULL,
  is_current   BOOLEAN      NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_current_academic_year
  ON academic_years (is_current) WHERE is_current = true AND deleted_at IS NULL;

-- ─── CLASSES ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(50)  NOT NULL,
  alias         VARCHAR(20),
  order_index   INT          NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  UNIQUE (name, deleted_at)
);

-- ─── SECTIONS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id          UUID         NOT NULL REFERENCES classes(id),
  name              VARCHAR(20)  NOT NULL,
  capacity          INT          NOT NULL DEFAULT 40,
  class_teacher_id  UUID         REFERENCES users(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE (class_id, name, deleted_at)
);

-- ─── SUBJECTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(20),
  type        VARCHAR(20)  NOT NULL DEFAULT 'THEORY',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ─── CLASS–SUBJECT MAPPING ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_subjects (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id         UUID NOT NULL REFERENCES classes(id),
  subject_id       UUID NOT NULL REFERENCES subjects(id),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  full_marks       INT  NOT NULL DEFAULT 100,
  pass_marks       INT  NOT NULL DEFAULT 40,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, subject_id, academic_year_id)
);

-- ─── TIMETABLE ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timetable_slots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id       UUID         NOT NULL REFERENCES sections(id),
  subject_id       UUID         NOT NULL REFERENCES subjects(id),
  teacher_id       UUID         NOT NULL REFERENCES users(id),
  academic_year_id UUID         NOT NULL REFERENCES academic_years(id),
  day_of_week      SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  period_number    SMALLINT     NOT NULL,
  start_time       TIME         NOT NULL,
  end_time         TIME         NOT NULL,
  room             VARCHAR(50),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (teacher_id, academic_year_id, day_of_week, period_number),
  UNIQUE (section_id, academic_year_id, day_of_week, period_number)
);

-- ─── MIGRATE existing students.class_name / section_name ─────────────────────
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS class_id   UUID REFERENCES classes(id),
  ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id);

-- ─── STUDENT ATTENDANCE ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_attendance (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID      NOT NULL REFERENCES students(id),
  section_id       UUID      NOT NULL REFERENCES sections(id),
  academic_year_id UUID      NOT NULL REFERENCES academic_years(id),
  date             DATE      NOT NULL,
  status           VARCHAR(10) NOT NULL,
  remarks          TEXT,
  marked_by        UUID      NOT NULL REFERENCES users(id),
  marked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (student_id, date, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_section_date
  ON student_attendance (section_id, date);

CREATE INDEX IF NOT EXISTS idx_attendance_student
  ON student_attendance (student_id, academic_year_id);

-- ─── STAFF ATTENDANCE ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_attendance (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID      NOT NULL REFERENCES users(id),
  date        DATE      NOT NULL,
  status      VARCHAR(10) NOT NULL,
  check_in    TIME,
  check_out   TIME,
  remarks     TEXT,
  marked_by   UUID      NOT NULL REFERENCES users(id),
  marked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date
  ON staff_attendance (user_id, date);

-- ─── SEQUENCES ────────────────────────────────────────────────────────────────
-- Atomic per-tenant counters for invoice / payment numbers
CREATE TABLE IF NOT EXISTS sequences (
  key   VARCHAR(50) PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0
);

-- ─── FEE CATEGORIES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_categories (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(20)  NOT NULL,   -- ONE_TIME | MONTHLY | QUARTERLY | ANNUALLY | EXAM
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ─── FEE STRUCTURES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_structures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id         UUID NOT NULL REFERENCES classes(id),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (class_id, academic_year_id)
);

CREATE TABLE IF NOT EXISTS fee_structure_items (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_structure_id  UUID          NOT NULL REFERENCES fee_structures(id) ON DELETE CASCADE,
  fee_category_id   UUID          NOT NULL REFERENCES fee_categories(id),
  amount            NUMERIC(10,2) NOT NULL,
  due_day_of_month  SMALLINT,
  due_date          DATE,
  fine_per_day      NUMERIC(8,2)  NOT NULL DEFAULT 0,
  grace_period_days SMALLINT      NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── STUDENT FEE ASSIGNMENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_fee_assignments (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID          NOT NULL REFERENCES students(id),
  fee_structure_item_id UUID          NOT NULL REFERENCES fee_structure_items(id),
  academic_year_id      UUID          NOT NULL REFERENCES academic_years(id),
  custom_amount         NUMERIC(10,2),
  discount_percent      NUMERIC(5,2)  NOT NULL DEFAULT 0,
  discount_reason       TEXT,
  is_waived             BOOLEAN       NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, fee_structure_item_id, academic_year_id)
);

-- ─── INVOICES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   VARCHAR(30)   NOT NULL UNIQUE,
  student_id       UUID          NOT NULL REFERENCES students(id),
  academic_year_id UUID          NOT NULL REFERENCES academic_years(id),
  due_date         DATE          NOT NULL,
  status           VARCHAR(20)   NOT NULL DEFAULT 'UNPAID',
  subtotal         NUMERIC(10,2) NOT NULL,
  discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  fine_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount     NUMERIC(10,2) NOT NULL,
  paid_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  balance          NUMERIC(10,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  created_by       UUID          NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status  ON invoices(status, due_date);

-- invoice_items snapshots fee data at time of invoice creation
-- fine_per_day / grace_period_days are snapshotted here (like fee_category_name)
-- so recalculate-fine does not need to rejoin fee_structure_items
CREATE TABLE IF NOT EXISTS invoice_items (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        UUID          NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  fee_category_id   UUID          NOT NULL REFERENCES fee_categories(id),
  fee_category_name VARCHAR(100)  NOT NULL,
  original_amount   NUMERIC(10,2) NOT NULL,
  discount_percent  NUMERIC(5,2)  NOT NULL DEFAULT 0,
  discounted_amount NUMERIC(10,2) NOT NULL,
  fine_per_day      NUMERIC(8,2)  NOT NULL DEFAULT 0,
  grace_period_days SMALLINT      NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── PAYMENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number VARCHAR(30)   NOT NULL UNIQUE,
  invoice_id     UUID          NOT NULL REFERENCES invoices(id),
  student_id     UUID          NOT NULL REFERENCES students(id),
  amount         NUMERIC(10,2) NOT NULL,
  method         VARCHAR(30)   NOT NULL,
  reference      VARCHAR(100),
  notes          TEXT,
  received_by    UUID          NOT NULL REFERENCES users(id),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);

-- ─── DEPARTMENTS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ─── DESIGNATIONS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS designations (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title          VARCHAR(100) NOT NULL,
  department_id  UUID         REFERENCES departments(id),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

-- ─── STAFF PROFILES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_profiles (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID         NOT NULL UNIQUE REFERENCES users(id),
  employee_id             VARCHAR(30)  NOT NULL UNIQUE,
  department_id           UUID         REFERENCES departments(id),
  designation_id          UUID         REFERENCES designations(id),
  date_of_birth           DATE,
  gender                  VARCHAR(10),
  nationality             VARCHAR(50)  DEFAULT 'Nepali',
  phone                   VARCHAR(20),
  permanent_address       TEXT,
  temporary_address       TEXT,
  join_date               DATE         NOT NULL,
  end_date                DATE,
  employment_type         VARCHAR(20)  NOT NULL DEFAULT 'PERMANENT',
  base_salary             NUMERIC(10,2) NOT NULL DEFAULT 0,
  pan_number              VARCHAR(20),
  bank_name               VARCHAR(100),
  bank_account            VARCHAR(30),
  photo_url               TEXT,
  emergency_contact_name  VARCHAR(100),
  emergency_contact_phone VARCHAR(20),
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);

-- ─── LEAVE TYPES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_types (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(50)  NOT NULL,
  days_per_year SMALLINT     NOT NULL,
  is_paid       BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- ─── STAFF LEAVE REQUESTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_leave_requests (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES users(id),
  leave_type_id UUID         NOT NULL REFERENCES leave_types(id),
  from_date     DATE         NOT NULL,
  to_date       DATE         NOT NULL,
  total_days    SMALLINT     NOT NULL,
  reason        TEXT,
  status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
  applied_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_by   UUID         REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  reviewer_note TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- ─── PAYROLL MONTHS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_months (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  month_bs         SMALLINT     NOT NULL,
  year_bs          SMALLINT     NOT NULL,
  academic_year_id UUID         NOT NULL REFERENCES academic_years(id),
  status           VARCHAR(20)  NOT NULL DEFAULT 'DRAFT',
  finalized_at     TIMESTAMPTZ,
  created_by       UUID         NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (month_bs, year_bs)
);

-- ─── SALARY SLIPS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_slips (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_month_id UUID          NOT NULL REFERENCES payroll_months(id),
  user_id          UUID          NOT NULL REFERENCES users(id),
  staff_profile_id UUID          NOT NULL REFERENCES staff_profiles(id),
  base_salary      NUMERIC(10,2) NOT NULL,
  allowance_total  NUMERIC(10,2) NOT NULL DEFAULT 0,
  allowances       JSONB         NOT NULL DEFAULT '[]',
  deduction_total  NUMERIC(10,2) NOT NULL DEFAULT 0,
  deductions       JSONB         NOT NULL DEFAULT '[]',
  unpaid_leave_days SMALLINT     NOT NULL DEFAULT 0,
  leave_deduction  NUMERIC(10,2) NOT NULL DEFAULT 0,
  gross_salary     NUMERIC(10,2) GENERATED ALWAYS AS (base_salary + allowance_total) STORED,
  net_salary       NUMERIC(10,2) GENERATED ALWAYS AS (base_salary + allowance_total - deduction_total - leave_deduction) STORED,
  payment_date     DATE,
  payment_method   VARCHAR(20),
  notes            TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (payroll_month_id, user_id)
);

-- ─── STAFF DOCUMENTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_documents (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES users(id),
  document_type VARCHAR(50)  NOT NULL,
  file_url      TEXT         NOT NULL,
  file_name     VARCHAR(255),
  uploaded_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- ─── GRADING SCALES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grading_scales (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50) NOT NULL,
  is_default  BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS grade_thresholds (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  grading_scale_id UUID         NOT NULL REFERENCES grading_scales(id),
  grade            VARCHAR(5)   NOT NULL,
  gpa_point        NUMERIC(3,2),
  min_percent      NUMERIC(5,2) NOT NULL,
  max_percent      NUMERIC(5,2) NOT NULL,
  remarks          VARCHAR(50),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── EXAM TYPES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_types (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(50)  NOT NULL,
  weight_percent   NUMERIC(5,2) NOT NULL DEFAULT 100,
  academic_year_id UUID         NOT NULL REFERENCES academic_years(id),
  grading_scale_id UUID         REFERENCES grading_scales(id),
  order_index      SMALLINT     NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (name, academic_year_id)
);

-- ─── EXAM SCHEDULES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_schedules (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type_id     UUID         NOT NULL REFERENCES exam_types(id),
  class_id         UUID         NOT NULL REFERENCES classes(id),
  subject_id       UUID         NOT NULL REFERENCES subjects(id),
  exam_date        DATE         NOT NULL,
  start_time       TIME         NOT NULL,
  end_time         TIME         NOT NULL,
  full_marks       NUMERIC(6,2) NOT NULL,
  pass_marks       NUMERIC(6,2) NOT NULL,
  theory_marks     NUMERIC(6,2),
  practical_marks  NUMERIC(6,2),
  room             VARCHAR(50),
  invigilator_id   UUID         REFERENCES users(id),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (exam_type_id, class_id, subject_id)
);

-- ─── MARKS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marks (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_schedule_id UUID         NOT NULL REFERENCES exam_schedules(id),
  student_id       UUID         NOT NULL REFERENCES students(id),
  marks_obtained   NUMERIC(6,2),
  theory_marks     NUMERIC(6,2),
  practical_marks  NUMERIC(6,2),
  is_absent        BOOLEAN      NOT NULL DEFAULT false,
  is_expelled      BOOLEAN      NOT NULL DEFAULT false,
  remarks          TEXT,
  entered_by       UUID         NOT NULL REFERENCES users(id),
  entered_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (exam_schedule_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_marks_student ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_exam    ON marks(exam_schedule_id);

-- ─── RESULTS (computed + stored) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_results (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID         NOT NULL REFERENCES students(id),
  exam_type_id     UUID         NOT NULL REFERENCES exam_types(id),
  academic_year_id UUID         NOT NULL REFERENCES academic_years(id),
  total_marks      NUMERIC(8,2) NOT NULL,
  obtained_marks   NUMERIC(8,2) NOT NULL,
  percentage       NUMERIC(5,2) NOT NULL,
  gpa              NUMERIC(3,2),
  grade            VARCHAR(5),
  division         VARCHAR(20),
  rank_in_section  INT,
  rank_in_class    INT,
  is_pass          BOOLEAN      NOT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'PASS',
  computed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, exam_type_id)
);

CREATE TABLE IF NOT EXISTS student_subject_results (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  student_result_id UUID         NOT NULL REFERENCES student_results(id) ON DELETE CASCADE,
  subject_id        UUID         NOT NULL REFERENCES subjects(id),
  subject_name      VARCHAR(100) NOT NULL,
  full_marks        NUMERIC(6,2) NOT NULL,
  marks_obtained    NUMERIC(6,2),
  theory_marks      NUMERIC(6,2),
  practical_marks   NUMERIC(6,2),
  is_absent         BOOLEAN      NOT NULL DEFAULT false,
  percentage        NUMERIC(5,2),
  grade             VARCHAR(5),
  is_pass           BOOLEAN      NOT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── NOTICE BOARD ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notices (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title        VARCHAR(200) NOT NULL,
  body         TEXT         NOT NULL,
  type         VARCHAR(30)  NOT NULL DEFAULT 'GENERAL',
  audience     VARCHAR(20)  NOT NULL DEFAULT 'ALL',
  class_id     UUID         REFERENCES classes(id),
  is_published BOOLEAN      NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_by   UUID         NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

-- ─── SMS LOG ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_logs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  to_number     VARCHAR(20)  NOT NULL,
  message       TEXT         NOT NULL,
  trigger       VARCHAR(50)  NOT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
  provider_ref  VARCHAR(100),
  error_message TEXT,
  student_id    UUID         REFERENCES students(id),
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_student ON sms_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status  ON sms_logs(status, created_at);

-- ─── IN-APP NOTIFICATIONS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID         NOT NULL REFERENCES users(id),
  title      VARCHAR(200) NOT NULL,
  body       TEXT         NOT NULL,
  type       VARCHAR(30)  NOT NULL,
  is_read    BOOLEAN      NOT NULL DEFAULT false,
  read_at    TIMESTAMPTZ,
  data       JSONB,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- ─── LIBRARY MEMBERS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_members (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES users(id),
  student_id    UUID        REFERENCES students(id),
  member_number VARCHAR(20) NOT NULL UNIQUE,
  max_books     SMALLINT    NOT NULL DEFAULT 2,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  joined_at     DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT chk_member_type CHECK (
    (user_id IS NOT NULL AND student_id IS NULL) OR
    (user_id IS NULL AND student_id IS NOT NULL)
  )
);

-- ─── BOOK CATEGORIES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS book_categories (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- ─── BOOKS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS books (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title         VARCHAR(300) NOT NULL,
  author        VARCHAR(200),
  publisher     VARCHAR(200),
  isbn          VARCHAR(20),
  category_id   UUID         REFERENCES book_categories(id),
  edition       VARCHAR(50),
  language      VARCHAR(30)  NOT NULL DEFAULT 'Nepali',
  description   TEXT,
  cover_url     TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_books_title ON books USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_books_isbn  ON books(isbn) WHERE isbn IS NOT NULL;

-- ─── BOOK COPIES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS book_copies (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id          UUID        NOT NULL REFERENCES books(id),
  copy_number      VARCHAR(20) NOT NULL,
  accession_number VARCHAR(30) UNIQUE,
  shelf_location   VARCHAR(50),
  condition        VARCHAR(20) NOT NULL DEFAULT 'GOOD',
  is_available     BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ,
  UNIQUE (book_id, copy_number)
);

CREATE INDEX IF NOT EXISTS idx_copies_available ON book_copies(book_id, is_available)
  WHERE deleted_at IS NULL;

-- ─── BOOK ISSUES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS book_issues (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  book_copy_id UUID          NOT NULL REFERENCES book_copies(id),
  member_id    UUID          NOT NULL REFERENCES library_members(id),
  issued_by    UUID          NOT NULL REFERENCES users(id),
  issued_at    DATE          NOT NULL DEFAULT CURRENT_DATE,
  due_date     DATE          NOT NULL,
  returned_at  DATE,
  returned_to  UUID          REFERENCES users(id),
  fine_per_day NUMERIC(6,2)  NOT NULL DEFAULT 5,
  fine_days    INT           NOT NULL DEFAULT 0,
  fine_amount  NUMERIC(8,2)  NOT NULL DEFAULT 0,
  fine_paid    BOOLEAN       NOT NULL DEFAULT false,
  status       VARCHAR(20)   NOT NULL DEFAULT 'ISSUED',
  notes        TEXT,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issues_member ON book_issues(member_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_copy   ON book_issues(book_copy_id, status);
CREATE INDEX IF NOT EXISTS idx_issues_due    ON book_issues(due_date, status) WHERE status = 'ISSUED';

-- ─── LEAVE APPLICATIONS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_applications (
  id               UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID      NOT NULL REFERENCES students(id),
  academic_year_id UUID      NOT NULL REFERENCES academic_years(id),
  from_date        DATE      NOT NULL,
  to_date          DATE      NOT NULL,
  reason           TEXT      NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  applied_by       UUID      NOT NULL REFERENCES users(id),
  reviewed_by      UUID      REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

-- ─── GUARDIANS (normalized — replaces JSONB guardians column on students) ────
-- IDs preserved from existing JSONB data so guardianId URL params still work.
CREATE TABLE IF NOT EXISTS guardians (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relation    VARCHAR(50) NOT NULL,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100),
  phone       VARCHAR(20),
  email       VARCHAR(255),
  is_primary  BOOLEAN     NOT NULL DEFAULT false,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guardians_student ON guardians(student_id);
CREATE INDEX IF NOT EXISTS idx_guardians_user    ON guardians(user_id) WHERE user_id IS NOT NULL;

-- Migrate existing JSONB guardian data into the new table.
-- Uses the 'id' field already embedded in each JSONB element so URL params stay valid.
-- ON CONFLICT (id) DO NOTHING makes this idempotent (safe to re-run).
INSERT INTO guardians (id, student_id, relation, first_name, last_name, phone, email, is_primary)
SELECT COALESCE((g->>'id')::uuid, gen_random_uuid()), s.id, COALESCE(g->>'relation', 'GUARDIAN'), COALESCE(g->>'firstName', ''), g->>'lastName', g->>'phone', g->>'email', COALESCE((g->>'isPrimary')::boolean, false) FROM students s, jsonb_array_elements(s.guardians) g WHERE s.guardians IS NOT NULL AND jsonb_typeof(s.guardians) = 'array' ON CONFLICT (id) DO NOTHING;

-- ─── DEVICE TOKENS ───────────────────────────────────────────────────────────
-- Hard delete (no deletedAt) — deliberate convention exception.
-- Stale tokens cause failed push sends with zero audit value.
-- See CLAUDE.md for the documented exception.
CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(200) NOT NULL UNIQUE,
  platform    VARCHAR(10)  NOT NULL CHECK (platform IN ('ANDROID', 'IOS')),
  device_name VARCHAR(100),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
