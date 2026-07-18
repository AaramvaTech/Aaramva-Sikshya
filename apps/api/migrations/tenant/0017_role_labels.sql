-- 0017_role_labels.sql
-- Per-school override for how staff-facing role names are displayed (e.g.
-- "Academic Coordinator" -> "Vice Principal"). Purely a display layer: the
-- underlying Role enum, @Roles() guards, and RolesGuard are completely
-- untouched. No seed rows — an absent row means "use the default" (Title Case
-- of the enum value), computed in RoleLabelService, not here.

CREATE TABLE IF NOT EXISTS role_labels (
  role        VARCHAR(30)  PRIMARY KEY,
  label       VARCHAR(50)  NOT NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
