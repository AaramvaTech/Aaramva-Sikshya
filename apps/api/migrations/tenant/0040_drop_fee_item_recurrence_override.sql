-- 0040_drop_fee_item_recurrence_override.sql — bill_fee_structure_items.recurrence_override
-- was stored and returned but never read by billing (bill-line-resolver takes
-- recurrence from the fee head). Dropping it also drops its column-level CHECK.
-- Deploy the API build that stops writing it BEFORE running this; an older API
-- still INSERTs the column. Forward-only (recovery = restore-from-backup).
ALTER TABLE bill_fee_structure_items DROP COLUMN IF EXISTS recurrence_override;
