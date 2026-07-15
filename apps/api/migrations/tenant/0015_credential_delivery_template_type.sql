-- 0015_credential_delivery_template_type.sql — MAIL-3 Phase 1.
-- Per-recipient credential template type on the ledger, so the poller renders the
-- correct email/SMS body + sender identity without guessing, and every send is
-- auditable. NOT NULL + CHECK on the five values, NO default (enqueue must set it
-- explicitly). Existing rows are backfilled by derivation from the account owner's
-- role + whether the row is guardian-routed (recipient_user_id set). Idempotent.
ALTER TABLE credential_deliveries
  ADD COLUMN IF NOT EXISTS template_type TEXT;

-- Backfill by derivation. Join users (users are soft-deleted, never hard-deleted,
-- so the user_id FK always resolves).
UPDATE credential_deliveries cd
SET template_type = CASE
    WHEN u.role = 'SCHOOL_OWNER' THEN 'NEW_SCHOOL_OWNER'
    WHEN u.role = 'STUDENT' AND cd.recipient_user_id IS NOT NULL THEN 'STUDENT_VIA_GUARDIAN'
    WHEN u.role = 'STUDENT' THEN 'STUDENT_SELF'
    WHEN u.role = 'PARENT' THEN 'GUARDIAN_SELF'
    ELSE 'STAFF'
  END
FROM users u
WHERE u.id = cd.user_id AND cd.template_type IS NULL;

-- Safety net: any row that somehow didn't resolve falls back to STAFF so SET NOT NULL holds.
UPDATE credential_deliveries SET template_type = 'STAFF' WHERE template_type IS NULL;

ALTER TABLE credential_deliveries ALTER COLUMN template_type SET NOT NULL;

ALTER TABLE credential_deliveries DROP CONSTRAINT IF EXISTS credential_deliveries_template_type_check;
ALTER TABLE credential_deliveries ADD CONSTRAINT credential_deliveries_template_type_check
  CHECK (template_type IN ('NEW_SCHOOL_OWNER', 'STAFF', 'GUARDIAN_SELF', 'STUDENT_VIA_GUARDIAN', 'STUDENT_SELF'));
