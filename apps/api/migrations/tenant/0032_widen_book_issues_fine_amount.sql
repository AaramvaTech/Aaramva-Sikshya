-- MON-1 Phase D: widen book_issues.fine_amount from NUMERIC(8,2) to
-- NUMERIC(10,2), matching every other money column in the schema
-- (payment_transactions.amount, salary_slips.*, bill_* all use >= (10,2)).
-- Flagged in QA-1, never done. Safe/no-op-repeatable: widening a NUMERIC's
-- precision never truncates existing data, and re-running ALTER COLUMN TYPE
-- to the same target type is itself a no-op.

ALTER TABLE book_issues
  ALTER COLUMN fine_amount TYPE NUMERIC(10,2);
