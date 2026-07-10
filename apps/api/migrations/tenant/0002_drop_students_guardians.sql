-- 0002_drop_students_guardians.sql — MIG-2
-- Retire the legacy students.guardians JSONB column. The write path moved to the
-- normalized `guardians` table in T1; this migration (1) backfills any JSONB
-- guardian entries written before or around the cutover into the normalized
-- table (idempotent, ON CONFLICT DO NOTHING — the SAME semantics as the 0001
-- baseline backfill), then (2) drops the JSONB column. Both statements run in
-- ONE transaction (the runner wraps each migration atomically), so the backfill
-- is guaranteed to complete before the column is dropped.
--
-- 0001 still creates students.guardians and runs its own backfill for fresh
-- tenants; 0002 then drops it. New-tenant provisioning therefore stays correct
-- with zero changes to 0001 (immutability preserved).

-- (1) Idempotent backfill: JSONB guardian entries -> normalized guardians table.
INSERT INTO {{schema}}.guardians (id, student_id, relation, first_name, last_name, phone, email, is_primary)
SELECT COALESCE((g->>'id')::uuid, gen_random_uuid()), s.id, COALESCE(g->>'relation', 'GUARDIAN'), COALESCE(g->>'firstName', ''), g->>'lastName', g->>'phone', g->>'email', COALESCE((g->>'isPrimary')::boolean, false)
FROM {{schema}}.students s, jsonb_array_elements(s.guardians) g
WHERE s.guardians IS NOT NULL AND jsonb_typeof(s.guardians) = 'array'
ON CONFLICT (id) DO NOTHING;

-- (2) Drop the retired JSONB column.
ALTER TABLE {{schema}}.students DROP COLUMN IF EXISTS guardians;
