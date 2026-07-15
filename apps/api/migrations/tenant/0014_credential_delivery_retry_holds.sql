-- 0014_credential_delivery_retry_holds.sql — MAIL-2 Phase 1.
-- Rate-limit-aware retry for the credential-delivery poller. A provider rate-limit
-- or greylist (SMTP 421/450/451, HTTP 429, quota/throttle) is RETRYABLE_NO_ATTEMPT:
-- the poller reschedules the row via next_attempt_at WITHOUT incrementing `attempts`,
-- so a transient throttle can never exhaust the 3-attempt budget and mark an
-- otherwise-deliverable row FAILED. `retry_holds` counts these no-attempt reschedules
-- so a stuck row is observable; the poller caps holds at 50 → FAILED
-- (last_error = 'retry hold cap exceeded'). Channel-generic (email now, real SMS later).
-- Idempotent (safe to re-run on already-migrated tenants).
ALTER TABLE credential_deliveries
  ADD COLUMN IF NOT EXISTS retry_holds INT NOT NULL DEFAULT 0;
