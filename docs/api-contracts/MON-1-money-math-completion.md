# MON-1 — Money Math Completion (HR / Dashboard / Library)

**Status:** Spec, not yet built.
**Type:** Contained fix — 6 files, 3 modules. Not an API-wide migration.

## Context

The real money-math migration already happened under BILL-0: a `Money` class
(`apps/api/src/common/money/money.ts`) wraps `Prisma.Decimal`, used across 46 files on
the Billing rail, enforced by a regression test
(`modules/finance/__tests__/no-float-coercion.spec.ts`) that bans `parseFloat`/`Number(`
under `modules/finance/**` and has already caught a real violation live.

What's left is extending that same pattern to 3 modules the original migration didn't
reach: HR, Dashboard, Library. No evidence of an actual rounding-drift bug exists —
this is preventative, not a fix for something broken.

## Scope — in priority order

### Phase A — Payroll (highest risk, do first)

`hr/payroll.service.ts:202` — `base_salary / 30 * unpaidLeaveDays`. Division-then-multiply
in floating point is the classic shape for rounding drift, and this is salary math.

`hr/payroll.service.ts:121-122` — allowance/deduction `.reduce((s,a)=>s+a.amount,0)`.

Convert both to use the `Money` class. Replace the ad-hoc `toNum = parseFloat` helper in
`hr/entities/hr.entity.ts` with `Money`, consistent with how the Billing rail does it.

**Checkpoint:** live payroll calculation for a real test employee (with unpaid leave days
and at least one allowance/deduction), Postgres read-back confirming the stored amount
matches manual calculation to the cent.

### Phase B — Dashboard

`dashboard/dashboard.service.ts:141,143,300` — pending/collection-rate math, `parseFloat`
on payment rows.

Convert to `Money`. Note: report *aggregation* is already correctly done in SQL
(`SUM()`) across the board — this is specifically about math done in JS after the SQL
result comes back, not a re-architecture of the queries themselves.

**Checkpoint:** live dashboard load, Postgres read-back confirming the displayed
collection-rate/pending figures match a manual SQL calculation.

### Phase C — Library

`library/issue.service.ts:94` — fine calculation (already self-tagged in-code as
`BUG-3 → MON-1`). Lower real risk than payroll (integer × NUMERIC multiply, not a
division), but still worth finishing for consistency.

Replace the ad-hoc `toNum` helper in `library/entities/library.entity.ts` and
`reports/report.util.ts` with `Money`.

**Checkpoint:** live fine calculation for a real overdue book-issue record, Postgres
read-back.

### Phase D — Small cleanup, fold in wherever convenient

- Widen `book_issues.fine_amount` from `NUMERIC(8,2)` to `NUMERIC(10,2)` — flagged in
  QA-1, never done. Cheap migration, do it alongside Phase C since it's the same table.
- Extend `no-float-coercion.spec.ts`'s banned pattern to cover `modules/hr/**`,
  `modules/dashboard/**`, `modules/library/**` once each phase lands, so this can't
  regress the same way BILL-0's original modules are protected.
- Update QA-1's bug doc — its original file citations
  (`invoice.service.ts`, `fee-structure.service.ts`, `report.service.ts`) point at files
  BILLING-CUTOVER already deleted. Note this so nobody chases ghosts later.

## Out of scope

- The Billing rail itself — already done, already guarded, not touched here
- Report aggregation — already SQL-side, not JS-side, nothing to change
- Any DB schema type changes beyond the one `book_issues` widening — every money column
  is already `NUMERIC`, never `Float`

## Proof standard

Same as always: live HTTP/service calls + Postgres SELECT read-back per phase, not
mocked tests. Each phase gets its own checkpoint before moving to the next.
