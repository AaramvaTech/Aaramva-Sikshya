-- Run once at platform setup against the public schema.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING).

CREATE TABLE IF NOT EXISTS platform_admins (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plans (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(50)   NOT NULL UNIQUE,
  monthly_price NUMERIC(10,2) NOT NULL,
  annual_price  NUMERIC(10,2) NOT NULL,
  max_students  INT           NOT NULL,
  max_staff     INT           NOT NULL,
  features      JSONB         NOT NULL DEFAULT '{}',
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenants (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(200) NOT NULL,
  slug          VARCHAR(50)  NOT NULL UNIQUE,
  logo_url      TEXT,
  primary_color VARCHAR(7)   NOT NULL DEFAULT '#2563EB',
  address       TEXT,
  phone         VARCHAR(20),
  email         VARCHAR(255),
  pan_number    VARCHAR(20),
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL UNIQUE REFERENCES tenants(id),
  plan_id       UUID        NOT NULL REFERENCES plans(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'TRIAL',
  trial_ends_at TIMESTAMPTZ,
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID         NOT NULL REFERENCES platform_admins(id),
  action      VARCHAR(100) NOT NULL,
  target_type VARCHAR(50),
  target_id   UUID,
  details     JSONB,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO plans (name, monthly_price, annual_price, max_students, max_staff, features)
VALUES
  ('Trial',      0,     0,     100,   10,   '{"sms":false,"elearning":false,"reports":true}'),
  ('Basic',      999,   9990,  500,   50,   '{"sms":true,"elearning":false,"reports":true}'),
  ('Pro',        2499,  24990, 2000,  200,  '{"sms":true,"elearning":true,"reports":true}'),
  ('Enterprise', 4999,  49990, 99999, 9999, '{"sms":true,"elearning":true,"reports":true,"api":true}')
ON CONFLICT (name) DO NOTHING;

-- Seed initial platform admin. Replace password_hash before going live.
-- Generate fresh hash: node -e "require('bcrypt').hash('Admin@1234',10).then(console.log)"
INSERT INTO platform_admins (email, first_name, last_name, password_hash)
VALUES ('admin@aaramvashikshya.com', 'Srijan', 'Pradhan', '$REPLACE_WITH_FRESH_BCRYPT_HASH')
ON CONFLICT (email) DO NOTHING;
