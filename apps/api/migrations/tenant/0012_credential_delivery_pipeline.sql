-- 0012_credential_delivery_pipeline.sql — REG-1 Phase 3 (REG-OBS-3 ruling).
-- Outbox delivery: add the poller backoff gate to the ledger, and the encrypted
-- temp-password store. NO BullMQ (removed in OPS-1) — a @nestjs/schedule poller
-- drains PENDING rows via FOR UPDATE SKIP LOCKED. Idempotent.
ALTER TABLE credential_deliveries
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Poller scan: PENDING rows that are due for an attempt.
CREATE INDEX IF NOT EXISTS idx_credential_deliveries_pending
  ON credential_deliveries (next_attempt_at)
  WHERE status = 'PENDING';

-- One encrypted temp password per user; HARD-deleted when the user's last
-- delivery row reaches a terminal state. Plaintext is NEVER stored — only
-- AES-256-GCM ciphertext + iv + auth_tag (all base64). Key = env
-- CREDENTIAL_SECRET_KEY. ON DELETE CASCADE so removing a user drops the secret.
CREATE TABLE IF NOT EXISTS credential_delivery_secrets (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ciphertext  TEXT NOT NULL,
  iv          TEXT NOT NULL,
  auth_tag    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
