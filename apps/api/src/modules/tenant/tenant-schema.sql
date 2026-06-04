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
  gender            VARCHAR(10)  NOT NULL,
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
  status            VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  created_by        UUID         REFERENCES users(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_students_class      ON students(class_name, section_name);
CREATE INDEX idx_students_name       ON students(first_name, last_name);
CREATE INDEX idx_students_status     ON students(status) WHERE deleted_at IS NULL;
