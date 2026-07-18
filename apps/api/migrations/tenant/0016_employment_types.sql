-- 0016_employment_types.sql
-- Promotes staff_profiles.employment_type from a hardcoded 4-value enum to a
-- real per-school lookup table, mirroring the existing departments/designations
-- pattern (admin-manageable via HR Setup). Forward-only: seeds the 4 existing
-- enum values as rows, backfills every staff_profiles row onto the new FK, then
-- drops the legacy VARCHAR column — all in this one transaction, so the backfill
-- is guaranteed to complete before the column is dropped (same guarantee as
-- 0002_drop_students_guardians.sql).

CREATE TABLE IF NOT EXISTS employment_types (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(50)  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- (1) Seed the 4 default rows, matching the old enum's values. Idempotent.
INSERT INTO employment_types (name)
SELECT v.name FROM (VALUES ('Permanent'), ('Temporary'), ('Part Time'), ('Contract')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM employment_types et WHERE et.name = v.name);

-- (2) Add the FK column (nullable for now — populated by the backfill below).
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS employment_type_id UUID REFERENCES employment_types(id);

-- (3) Backfill: map each staff row's old enum string to the matching new row.
UPDATE staff_profiles sp
   SET employment_type_id = et.id
  FROM employment_types et
 WHERE et.name = CASE sp.employment_type
                    WHEN 'PERMANENT' THEN 'Permanent'
                    WHEN 'TEMPORARY' THEN 'Temporary'
                    WHEN 'PART_TIME' THEN 'Part Time'
                    WHEN 'CONTRACT' THEN 'Contract'
                    ELSE NULL
                  END
   AND sp.employment_type_id IS NULL;

-- (4) Lock it down and drop the legacy column.
ALTER TABLE staff_profiles ALTER COLUMN employment_type_id SET NOT NULL;
ALTER TABLE staff_profiles DROP COLUMN IF EXISTS employment_type;
