-- 0025_bill_payment_cheque_void_audit.sql — BILL-5 Checkpoint B
-- Per BILL-5-SPEC.md §4/§5/B5-11. Purely additive: 8 nullable audit columns
-- on bill_payments (created 0024). B5-11: cheque status transitions and
-- void are the only allowed post-creation changes to a payment — these
-- columns record who did it, when, and (for bounce/void) why, since
-- bill_payments has no dedicated audit columns beyond received_by/notes.

ALTER TABLE bill_payments
  ADD COLUMN IF NOT EXISTS cleared_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleared_by    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS bounced_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_by    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS bounce_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS void_reason   TEXT;
