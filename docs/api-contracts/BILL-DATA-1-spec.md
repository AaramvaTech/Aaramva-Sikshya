# BILL-DATA-1 — Fee Assignment Gap + Academic Year Date Integrity Fix

**Status:** Spec, not yet built.
**Trigger:** Student billing tab investigation found `motherland_school` has zero
students with a fee-structure assignment for its current academic year (0/57), plus
overlapping AY date ranges and 10 assignment rows with inverted `effective_to <
effective_from`. This is a data problem, not a code bug — the app already degrades
gracefully when it hits this.

## Phase 1 — Tenant-wide audit (read-only, all 8 tenants)

For each tenant, check and report:
1. Does every active student have a fee-structure assignment for the tenant's current
   (`is_current = true`) academic year? Report the ratio (like `0/57` for
   motherland_school), don't just say yes/no.
2. Do any academic years for that tenant have overlapping AD date ranges?
3. Any assignment rows where `effective_to < effective_from`?
4. Any other AY/assignment date anomalies noticed while looking (report, don't fix yet)

**Checkpoint:** full 8-tenant table, same shape as the motherland_school finding, before
touching any data.

## Phase 2 — Fix per tenant, based on Phase 1 findings

For each tenant with gaps found:
- **Missing assignments:** determine the correct fee structure per student (check what
  the *other* year's assignment shows, if one exists, as a reference for what "should"
  apply — don't guess blindly; if there's no reasonable inference, flag that tenant/
  student for manual decision rather than assigning something made up)
- **Overlapping AY dates:** fix the date ranges so adjacent years don't overlap. Check
  which year should hold which range based on the school's actual calendar, not just
  make ranges non-overlapping arbitrarily
- **Inverted date ranges:** for the 10+ rows with `effective_to < effective_from`,
  investigate what the correct dates likely were (check creation timestamp, surrounding
  rows) rather than blindly swapping the two values — a swap could be wrong if one of
  the two values itself is bad, not just their order

**Checkpoint per tenant:** live proof — for a sample of previously-broken students,
confirm the billing tab now shows their real fee structure instead of the empty state.
Postgres read-back confirming the specific rows fixed, before/after.

## Phase 3 — Guard against recurrence

- Add a data-integrity check (regression test or a lightweight validation on
  assignment/AY creation) that would have caught this — e.g., reject creating an AY
  whose date range overlaps an existing one for the same tenant; reject an assignment
  row with `effective_to < effective_from`
- Non-tautological proof: attempt to create an overlapping/inverted row after the guard
  is added, confirm it's rejected

## Out of scope

- Any tenant not showing a gap in Phase 1 — don't touch tenants that are fine
- Broader seed-data regeneration — this is a targeted data fix, not a reseed
