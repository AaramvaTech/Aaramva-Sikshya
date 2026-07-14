-- 0010_credential_deliveries.sql — REG-1 Phase 1.
-- Append-only ledger of credential deliveries (email/SMS) issued when a REG-1
-- account is provisioned, or when credentials are resent. One row per
-- (channel x recipient). NO deleted_at by design: rows are never deleted, and are
-- updated only by the delivery worker (status / attempts / last_error). BUG-1
-- lesson (no silent delivery failure): every delivery is visible + resendable.
-- Idempotent (safe to re-run on already-migrated tenants).
CREATE TABLE IF NOT EXISTS credential_deliveries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id),
  recipient_user_id UUID        REFERENCES users(id),
  channel           TEXT        NOT NULL CHECK (channel IN ('EMAIL', 'SMS')),
  recipient         TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SENT_DRY')),
  attempts          INT         NOT NULL DEFAULT 0,
  last_error        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GET /credential-deliveries?userId= filters the ledger by the account's user_id.
CREATE INDEX IF NOT EXISTS idx_credential_deliveries_user
  ON credential_deliveries (user_id);
