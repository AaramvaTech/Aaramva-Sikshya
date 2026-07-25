-- 0018_widen_fine_per_day.sql — BILL-0 (money hardening)
-- Widens the two fine_per_day columns from NUMERIC(8,2) to NUMERIC(12,2),
-- matching the "all new money columns are NUMERIC(12,2)" rule this spec
-- otherwise applies. NOT invoices.fine_amount — Phase 0 discovery found that
-- column was already NUMERIC(10,2), never narrow; it is also frozen by R10
-- (the gateway rail). See BILL-BUGS.md BUGS-1.1 for the corrected premise.
-- Widening only, no data changes — safe to run against tenants with existing
-- rows (R15: no truncation, no data migration needed for a widen).

ALTER TABLE fee_structure_items ALTER COLUMN fine_per_day TYPE NUMERIC(12,2);
ALTER TABLE invoice_items ALTER COLUMN fine_per_day TYPE NUMERIC(12,2);
