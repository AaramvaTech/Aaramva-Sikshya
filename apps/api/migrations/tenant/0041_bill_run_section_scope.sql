-- 0041_bill_run_section_scope.sql — a CLASS-scoped bill run may now be narrowed to one
-- section of that class. Nullable: NULL = the whole class (every existing row). The scope
-- CHECK is unchanged (still CLASS | WHOLE_SCHOOL); idempotency keys of existing runs are
-- untouched (the key only gains a section segment when section_id is set).
-- Additive: an older API simply ignores the column, so deploy order does not matter.
ALTER TABLE bill_runs ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES sections(id);
