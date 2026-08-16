-- BILL-DATA-1 Phase 3: DB-level guard against the exact bug found in
-- motherland-school (10 assignment rows with effective_to < effective_from).
-- The only place effective_to is ever written is StudentFeeStructureAssignment
-- Service.assign()'s close-out UPDATE (effective_to = new effective_from - 1),
-- an internally-computed value that never goes through DTO validation — so an
-- application-level guard was added there too, but this CHECK constraint is
-- the backstop that holds regardless of which code path writes the row.
-- Verified zero existing violations across all 8 tenants before this migration
-- was written (all live and soft-deleted rows checked).

ALTER TABLE student_fee_structure_assignments
  ADD CONSTRAINT chk_sfsa_effective_to_after_from
  CHECK (effective_to IS NULL OR effective_to >= effective_from);
