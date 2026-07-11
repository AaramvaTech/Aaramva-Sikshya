-- 0003_dedup_guardians.sql — MIG-3
-- Remove duplicate guardian rows created by 0002's PK-keyed backfill (rows that
-- share identical (student_id, phone, first_name, last_name, relation) but got
-- fresh ids, so ON CONFLICT (id) DO NOTHING could not catch them).
--
-- Survivor rule, in priority order:
--   1. A row with user_id IS NOT NULL (account-linked — deleting it would break
--      a parent's login/ownership checks); if multiple, earliest created_at.
--   2. Else earliest created_at, tiebreak smallest id.
--
-- Safety invariant (checked BEFORE the delete): if any duplicate group contains
-- more than one DISTINCT non-null user_id, two real accounts share one identity
-- row-group — that needs a human decision, so the migration fails rather than
-- guesses. The runner wraps the whole file in one transaction, so a raised
-- exception rolls everything back.
--
-- Idempotent by construction: a second run finds rn > 1 for zero rows.
--
-- Deliberately NO unique constraint here: a father and mother can legitimately
-- share one phone, so (student_id, phone) uniqueness would reject real Nepali
-- household data. Duplicate prevention is the write path's job (guardian.service,
-- MIG-2 T1), which creates rows deliberately.

-- (1) Multi-account invariant guard.
DO $$
DECLARE
  bad_groups integer;
BEGIN
  SELECT COUNT(*) INTO bad_groups
  FROM (
    SELECT student_id, phone, first_name, last_name, relation
    FROM {{schema}}.guardians
    WHERE user_id IS NOT NULL
    GROUP BY student_id, phone, first_name, last_name, relation
    HAVING COUNT(DISTINCT user_id) > 1
  ) conflicted;

  IF bad_groups > 0 THEN
    RAISE EXCEPTION 'MIG-3 dedup aborted: % duplicate guardian group(s) contain more than one distinct user_id — two real accounts share one identity row-group; resolve manually before rerunning', bad_groups;
  END IF;
END $$;

-- (2) Idempotent dedup delete: keep rn = 1 per duplicate group.
DELETE FROM {{schema}}.guardians g
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY student_id, phone, first_name, last_name, relation
           ORDER BY (user_id IS NOT NULL) DESC, created_at ASC, id ASC
         ) AS rn
  FROM {{schema}}.guardians
) ranked
WHERE g.id = ranked.id
  AND ranked.rn > 1;
