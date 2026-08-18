# Billing module audit — 2026-08

**Scope:** `main` @ `0ff3f64` ("Feat/cal 1 calendar holidays (#62)"), read-only.
**Method:** static reading of `apps/api/src/modules/finance/**`, `modules/reports/**`,
`apps/web/**`, `apps/mobile/**`, `apps/api/migrations/tenant/**`, plus live `psql`
against the **local dev** database. No code was changed.

> **FEE-CLASS-GUARD is NOT on main.** It is the open PR on
> `feat/fee-class-guard`. Everything below describes main as it stands, so the
> gap that ticket closes is still open here and is not re-reported.

**Headline:** no Critical findings. Tenant isolation is sound; the money-moving
paths (payments, corrections, ledger posting mechanics) are rigorously
validated. The weaknesses are concentrated in (a) the *setup* write paths —
overrides, concessions, transport — which are bare INSERTs with no cross-entity
validation, and (b) a roadmap that understates what is already built.

---

## Severity summary

| # | Severity | Finding |
|---|---|---|
| H1 | High | UI-5, UI-6 and UI-7 are all built and merged — the "not built" claim is wrong |
| H2 | High | `POST /finance/ledger/adjustments` writes to the ledger with zero validation |
| H3 | High | Overrides / concessions / transport: three bare-INSERT write paths, no cross-entity checks |
| H4 | High | FK violations surface as `500 INTERNAL_ERROR`, not a 4xx |
| H5 | High | Local dev DB is at `0038`; main is at `0037` — `migrate:tenants` from main aborts |
| M1 | Medium | Zero controller specs in the finance module — RBAC and PARENT scoping are untested |
| M2 | Medium | Invoice posting round-trips every amount through a JS `number` |
| M3 | Medium | Bill-run roster is class-based and ignores the run's academic year |
| M4 | Medium | `PERCENT` concessions have no upper bound |
| M5 | Medium | Nine shipped endpoints have no consumer in web or mobile |
| M6 | Medium | No `effective_from <= effective_to` guard on overrides / concessions / transport |
| L1 | Low | Money columns are `NUMERIC(12,2)`/`(14,2)`, not `(10,2)` — the audit premise was wrong |
| L2 | Low | `PATCH /finance/transport-assignments/:id` can swap the route with no revalidation |
| L3 | Low | Mobile consumes only 4 of ~70 finance endpoints |

---

## What I could NOT verify

State these before trusting anything above.

1. **Production migration state.** Item 6 asked whether main matches "what the 8
   production tenants actually have applied". I have no production DB access
   from this session. **Everything in H5 is measured against the LOCAL dev
   database** (`localhost:5432/aaramva_shikshya`), which happens to contain 8
   tenants. Whether prod matches is unknown and untested.
2. **Runtime behaviour of any finding.** This is a static audit; the API server
   was not running and I made no HTTP calls. Every claim below is derived from
   source and schema. The 500-on-FK-violation claim (H4) in particular is
   read from the filter's mapping table, not observed.
3. **Whether the orphaned endpoints in M5 are reachable from somewhere I did
   not search** — I grepped `apps/web/{lib,app,components}` and
   `apps/mobile/{lib,hooks}`. A caller in a script, a Postman collection, or an
   ops runbook would not show up.
4. **UI-5/6/7 completeness against their specs.** H1 establishes the pages
   *exist and are wired*; I did not read `UI-5-SPEC.md`/`UI-6-SPEC.md`/
   `UI-7-discovery.md` section-by-section to confirm every requirement shipped.
5. **`git log` provenance per ticket.** Item 1 asked for ticket-to-code
   reconciliation; I verified by *code presence*, not by tracing each BILL-N
   commit. "Shipped but never ticketed" is therefore only partially answerable —
   see the note under H1.

---

# High

## H1 — UI-5, UI-6 and UI-7 are all built; the roadmap says they are not

**Claimed:** "UI-5 (corrections), UI-6 (reports + cashier daily-close), UI-7
(settings) not built."
**Actual:** all three are on main, wired end to end.

| Ticket | Evidence on main |
|---|---|
| UI-5 corrections | `apps/web/app/(school)/finance/bill/corrections/page.tsx`, `.../new/page.tsx`, `.../[id]/page.tsx`; `components/finance/decide-correction-dialog.tsx`; `components/finance/correction-type-badge.tsx`; `lib/api/bill-correction.api.ts` calls all 8 correction endpoints |
| UI-6 reports + cashier | `apps/web/app/(school)/finance/bill/reports/page.tsx:36` — its own header comment reads *"UI-6 §4 — one page, eight tabs"*; daybook tab at `:107`; `lib/api/cashier.api.ts` calls `shifts/open`, `shifts/:id/close`, `shifts` |
| UI-7 settings | `apps/web/app/(school)/settings/page.tsx:38` and `:300` are explicitly commented `UI-7`; `:552-564` is the owner-only finance-settings card using `useFinanceSettings`/`useUpdateFinanceSettings`; test at `app/(school)/settings/__tests__/settings-page.test.tsx:8` |

**Why it matters:** this is the most expensive kind of stale doc — it invites
someone to rebuild three shipped features. It also means the true remaining
UI gap is *not* what the roadmap says it is (see M5 for what is actually
missing).

**On "shipped but never ticketed":** BILL-0..9 all have specs in
`docs/api-contracts/` and corresponding code. I found no billing code without a
ticket. I did **not** trace commits per ticket, so I can only say the code
exists, not that each ticket shipped exactly what it claimed.

*Suggestion:* correct the roadmap/CLAUDE.md from the file list above before
anyone plans UI work.

---

## H2 — `POST /finance/ledger/adjustments` writes to the ledger with no validation

`apps/api/src/modules/finance/ledger.service.ts:169-181`

```ts
async adjustment(dto: LedgerAdjustmentDto, createdById: string) {
  return this.withStudentLock(dto.studentId, async (tx) => {
    const { debit, credit } = directionToDebitCredit(dto.amount, dto.direction);
    ...
    const entry = await this.insertEntry(tx, { studentId: dto.studentId, academicYearId: dto.academicYearId, ... });
    await this.bumpBalance(tx, dto.studentId, dto.academicYearId, delta, entry.id);
```

There is **no check that `studentId` exists**, that it is not soft-deleted, that
`academicYearId` exists, or that the two belong together. It goes straight from
DTO to an immutable `student_ledger_entries` insert plus a
`student_account_balances` mutation.

Compare `BillPaymentService.recordPayment` (`bill-payment.service.ts:69-76`),
which does exactly these checks before touching money, and
`BillCorrectionService` (`bill-correction.service.ts:51-63`), which does them
three times over. The adjustment path is the outlier.

Consequences: an adjustment can be posted against a soft-deleted student
(the FK cannot see `deleted_at`), or against a student/academic-year pair that
never existed together, and it lands in a table whose own trigger makes it
immutable — recoverable only by a reversing entry.

`openingBalance()` (`ledger.service.ts:139-166`) has the same gap; it guards
against *double* import but never checks the student or year exists.

Mitigating: both routes are `OWNER_ONLY` (`ledger.controller.ts:50-57`).

*Suggestion:* lift the three-line student/year existence check from
`bill-payment.service.ts:69-76` into `insertEntry`, so every ledger writer
inherits it.

---

## H3 — Three bare-INSERT write paths with no cross-entity validation

This is the FEE-CLASS-GUARD shape the audit asked for: **an id is accepted
because it exists, not because it is valid in this context.** All three accept
a foreign key and write immediately.

### H3a — Fee overrides
`apps/api/src/modules/finance/student-fee-override.service.ts:18-35`

`create()` is a single INSERT of `studentId`, `feeHeadId`, `academicYearId`,
`overrideAmount`. Not checked:
- the student exists / is not soft-deleted;
- the fee head exists / is active / is not soft-deleted;
- **the fee head is one the student is actually billed for** — you can override
  a head that appears in no structure assigned to them, and it silently does
  nothing;
- `academicYearId` matches the student's assignment year.

DTO (`dto/student-fee-override.dto.ts:5-13`) validates shape only.

### H3b — Concessions
`apps/api/src/modules/finance/student-concession.service.ts:18-39`

Same pattern, wider surface: `studentId`, `feeHeadId` (nullable = whole bill),
`academicYearId`, `discountReasonId` all accepted unchecked. A concession can
be attached to a discount reason that is soft-deleted, or to a fee head the
student is never charged.

### H3c — Transport assignments
`apps/api/src/modules/finance/student-transport-assignment.service.ts:18-34`

`studentId` + `transportRouteId`, unchecked. Nothing prevents assigning a
soft-deleted or inactive route; `findActiveForStudent()` (`:94-109`) then
resolves it into the fee preview and, through
`BillLineResolverService`, onto a **posted invoice**.

There is also no overlap guard: two active transport assignments covering the
same date both satisfy `findActiveForStudent`, which resolves the ambiguity with
`ORDER BY effective_from DESC LIMIT 1` — silently, non-deterministically from
the user's point of view.

*Suggestion:* one shared `assertBelongsToStudent(tx, {studentId, feeHeadId?, routeId?, academicYearId})` helper called by all three creates, mirroring how `bill-correction.service.ts` already does it.

---

## H4 — Foreign-key violations surface as `500 INTERNAL_ERROR`

`apps/api/src/modules/common/filters/http-exception.filter.ts:177-181`

```ts
private codeForPrisma(prismaCode: string): ErrorCode {
  if (prismaCode === 'P2002') return 'CONFLICT_DUPLICATE';
  if (prismaCode === 'P2025') return 'RESOURCE_NOT_FOUND';
  return 'INTERNAL_ERROR';
}
```

`P2003` (foreign-key constraint failed) and `P2000`/`P2004` are unmapped, so
they fall through to `INTERNAL_ERROR` → HTTP 500 with the generic
"Something went wrong on our side. Ref: …" message.

This compounds H3 directly: because those three services do no existence
checks, the *only* thing catching a bad `feeHeadId` is the FK — and it reports
the caller's bad input as a server fault. The client sees a 500, Sentry sees an
error, and the admin is told it is our fault.

Every well-validated path (payments, corrections) never reaches this, which is
why it has not been noticed.

*Suggestion:* map `P2003` to a 422 with `VALIDATION_FAILED`, which fixes the
symptom fleet-wide while H3 is fixed properly.

---

## H5 — Local dev DB is one migration ahead of main

- **main, on disk:** `0001`–`0037`, **contiguous, no gaps or duplicates**,
  37 files (`apps/api/migrations/tenant/`).
- **local dev DB, all 8 tenant schemas:** 38 applied, latest
  `0038_fee_structure_class_guard`.

`0038` exists only on the unmerged `feat/fee-class-guard` branch. Because
`TenantMigrationService.assertChecksumsMatch`
(`apps/api/src/modules/tenant/tenant-migration.service.ts:124-140`) aborts when
an *applied* migration has no file on disk, **running `npm run migrate:tenants`
from main right now fails for every tenant** with
`Applied migration "0038_fee_structure_class_guard" has no file on disk`.

This is self-inflicted by the FEE-CLASS-GUARD work (that branch applied `0038`
to the dev fleet before merging) and resolves itself the moment the PR merges.
It is listed because anyone running migrations from main today hits a hard stop
and the message does not obviously say "you are on the wrong branch".

**Not verified:** whether production is in the same state. See "could not
verify" #1.

*Suggestion:* none needed if the PR merges; otherwise delete the 8 ledger rows.

---

# Medium

## M1 — No controller specs anywhere in the finance module

18 controllers/services have no spec file; **all 14 finance controllers are
among them**:

```
bill-assignment.controller.ts   bill-catalog.controller.ts
bill-correction.controller.ts   bill-fine.controller.ts
bill-invoice.controller.ts      bill-payment.controller.ts
bill-pdf.controller.ts          bill-receipt.controller.ts
bill-run.controller.ts          cashier.controller.ts
finance-settings.controller.ts  ledger.controller.ts
payment-gateways.controller.ts  esewa/*.controller.ts  khalti/*.controller.ts
bill-receipt.service.ts   (the only service with no spec)
```

Everything asserted about billing RBAC is therefore asserted about *services*,
never about the `@Roles()` decorators that actually gate them. Specifically
untested: the `ACCOUNTANT_AND_ABOVE` vs `OWNER_ONLY` split, PARENT read access
on `bill/invoices/:id`, `payments/:id`, `corrections`, `ledger`, `statement`,
and the route-ordering hazards the module has already been bitten by twice
(`payment-gateways` vs `payments/:id`; `me` before `:id`).

**On coverage honesty generally:** of 46 finance spec files, every
*service* spec mocks `TenantPrismaService` via `useValue`. The 10 that do not
(`bill-*.util.spec.ts`, `bill-pdf.service.spec.ts`, `bill-print-labels.spec.ts`)
are pure-function tests that need no DB — those are genuine. `apps/api/test/`
contains only `app.e2e-spec.ts`; **there is no integration or e2e test touching
billing at all.** Per project standard, the entire billing module's DB behaviour
is proven only by the live-proof transcripts in the ticket docs, never by
anything that runs in CI.

*Suggestion:* controller specs for the two role tiers plus PARENT scoping would
cover the highest-risk untested surface in a day.

---

## M2 — Invoice posting round-trips every amount through a JS `number`

`apps/api/src/modules/finance/bill-line-resolver.service.ts:116, 140-146, 170, 195`

```ts
const preview = await this.feePreviewService.preview(studentId, {...});   // :116
...
const gross = toMoney(head.grossAmount).mul(factor);                      // :145
const net   = toMoney(head.netAmount).mul(factor);                        // :146
const transportAmount = toMoney(preview.transport.amount);                // :170
... acc.add(toMoney(c.amount).mul(fraction))                              // :195
```

`FeePreviewResponseDto` (`fee-preview.service.ts:32-44`) types every amount as
`number`, produced by `Money.toNumber()`. So the authoritative amounts that get
**posted onto an invoice** travel `NUMERIC → Money → JS double → Money →
NUMERIC`.

At Nepali school-fee magnitudes a double is exact for these values, so this is
not producing wrong invoices today. It matters because:
1. it is precisely the coupling MON-1 exists to remove, and it sits on the
   posting path rather than a display path;
2. `no-float-coercion.spec.ts:24` bans only `parseFloat(` and `\bNumber(`, so a
   `.toNumber()` round-trip passes the guard silently — the module's own
   safety net cannot see this;
3. any future MON-1 migration to `Prisma.Decimal` has to change this seam, and
   it is not currently listed as one.

*Suggestion:* note it on MON-1 as the remaining float bridge — an internal
`previewMoney()` returning `Money` would remove it without touching the DTO.

---

## M3 — Bill-run roster is class-based and ignores the run's academic year

`apps/api/src/modules/finance/bill-run.service.ts:298-302`

```ts
private async resolveRoster(scope: BillRunScope, classId?: string) {
  `SELECT id FROM students WHERE class_id = $1::uuid AND deleted_at IS NULL AND status = 'ACTIVE' ...`
```

`dto.academicYearId` is validated to *exist* (`:47-49`) and `dto.classId` to
*exist* (`:53-56`), but the two are never checked against each other and the
roster query does not mention the year. `students.class_id` is the student's
**current** class, so a run created for a past academic year bills whoever is in
that class *today*.

Same shape as FEE-CLASS-GUARD: the academic year is accepted because it exists,
not because it is coherent with the roster being billed.

*Suggestion:* either reject a non-current `academicYearId` for CLASS scope, or
resolve the roster from enrolment-as-of-year rather than `students.class_id`.

---

## M4 — `PERCENT` concessions have no upper bound

`student_concessions.value` is `NUMERIC(12,2)` with no CHECK
(`migrations/tenant/0019_bill_catalog.sql`, `0020_bill_assignment.sql`), and
`CreateStudentConcessionDto` (`dto/student-concession.dto.ts:17`) validates only
`@IsMoneyString()`. A `PERCENT` concession of `500.00` is accepted.

It does not produce a negative invoice —
`bill-line-resolver.service.ts:47-48,200` clamps net to zero — so the effect is
a **silently zero bill** rather than money moving the wrong way. Wrong, but
contained.

*Suggestion:* `CHECK (type <> 'PERCENT' OR value <= 100)` on the table.

---

## M5 — Nine shipped endpoints have no consumer in web or mobile

Cross-referencing the controller inventory against every `/finance` and
`/reports` path referenced in `apps/web/lib/api/**` and `apps/mobile/{lib,hooks}`:

| Endpoint | Source | Consumer |
|---|---|---|
| `POST /finance/late-fees/run` | `bill-fine.controller.ts:28` | none |
| `GET /finance/late-fees/runs` | `bill-fine.controller.ts:34` | none |
| `POST /finance/late-fees/accruals/:id/reverse` | `bill-fine.controller.ts:40` | none |
| `POST /finance/ledger/opening-balances/preview` | `ledger.controller.ts:38` | none |
| `POST /finance/ledger/opening-balances/confirm` | `ledger.controller.ts:44` | none |
| `POST /finance/ledger/adjustments` | `ledger.controller.ts:50` | none |
| `POST /finance/ledger/entries/:id/reverse` | `ledger.controller.ts:56` | none |
| `GET /finance/students/:studentId/ledger` | `ledger.controller.ts:62` | none |
| `GET /finance/bill/invoices/:id/pdf` | `bill-pdf.controller.ts:31` | none |
| `GET /finance/bill/payments/:id/receipt` | `bill-receipt.controller.ts:24` | none |
| `POST /finance/bill/runs/:id/print` | `bill-pdf.controller.ts:47` | none |
| `POST /finance/bill/print/class` | `bill-pdf.controller.ts:57` | none |

So **BILL-7 (late fees) has no UI at all**, **BILL-3's opening-balance import
and every ledger write have no UI**, and **BILL-8's entire print/PDF surface —
the module's most user-visible deliverable — is unreachable from the product.**
`/reports/finance/fines` *is* consumed by the reports page, so fines are
visible but cannot be run or reversed.

This, not UI-5/6/7, is the real remaining UI gap.

**No UI-without-endpoint cases found** — every web finance page resolves to a
real route.

Mobile consumes exactly four: `/finance/payment-gateways`,
`/finance/payments/{esewa,khalti}/initiate`, and `/finance/students/…`.

*Suggestion:* triage into "needs UI" (BILL-8 print, late-fee run) vs
"deliberately API-only" (ledger adjustments) and record the ruling.

---

## M6 — No `effective_from <= effective_to` guard on the three dated tables

`0035_fee_structure_assignment_date_check.sql` added
`chk_sfsa_effective_to_after_from` — but **only to
`student_fee_structure_assignments`.** `student_fee_overrides`,
`student_concessions` and `student_transport_assignments` all carry the same
`effective_from`/`effective_to` pair with no CHECK and no service-level guard
(the three `create()`/`update()` methods cited in H3 pass the dates straight
through).

BILL-DATA-1 found 10 inverted rows in motherland-school on the one table that
now has the constraint. The same corruption is still possible on three others,
and an inverted row is invisible: it simply never matches
`findActiveForStudent`'s range predicate, so the override/concession/route
silently stops applying.

*Suggestion:* the same one-line CHECK on all three tables.

---

# Low

## L1 — Money columns are `NUMERIC(12,2)`, not `(10,2)`

The audit brief assumed `NUMERIC(10,2)`. Live schema (`tenant_demo`, 38 numeric
columns across billing tables) is **consistent and deliberate**:

- `NUMERIC(12,2)` — 33 row-level money columns (invoices, items, payments,
  allocations, ledger debit/credit, balances, corrections, fines, concessions,
  overrides, cashier shifts).
- `NUMERIC(14,2)` — exactly 4, all `bill_runs` aggregate totals
  (`total_gross`, `total_concession`, `total_tax`, `total_net`,
  `migrations/tenant/0022_bill_run.sql:23-26`). Correct: sums of many rows need
  more headroom.
- `NUMERIC(5,3)` — `bill_invoices.tax_rate`, a rate, not money.

The `NUMERIC(10,2)` columns that exist in migration history belong to the
pre-BILL finance tables dropped in `0031_drop_old_finance_tables.sql`.

**No finding — recorded to correct the premise.**

## L2 — Transport assignment update can swap the route with no revalidation

`student-transport-assignment.service.ts:65-83` — `PATCH` accepts
`transportRouteId` and writes it directly. Same class as H3c but on the update
path, which H3's create-side fix would not automatically cover.

## L3 — Mobile's finance surface is four endpoints

Only payment initiation and gateway discovery. Parents cannot see an invoice
PDF, a receipt, or a ledger on mobile. Consistent with M5 (those endpoints have
no consumer anywhere) — noted so it is a decision rather than an oversight.

---

# Verified sound (no action)

Recorded so the findings above are read in proportion.

- **Tenant isolation — clean.** `TenantMatchGuard` is registered **globally** as
  an `APP_GUARD` (`apps/api/src/app.module.ts:84`), so it covers every finance
  route without per-controller wiring. It compares canonical `tenantId`s, never
  slugs (`common/guards/tenant-match.guard.ts:72`), logs and 403s on mismatch,
  and its two no-op branches are both correct: no `req.user` (public routes) and
  no `req.tenant` (middleware-excluded routes — super-admin, `/health`, and the
  eSewa/Khalti public callbacks, which carry the slug in the path by design).
  **No billing endpoint sits outside it.** BUG-4 stays closed.
- **Payment allocation — correct.** `bill-payment.service.ts:314-326` scopes
  `fetchInvoicesByIds` by `bi.student_id`, so a cross-student invoice id yields
  "Invoice X not found for this student" (`:149`), and `:161` rejects
  over-allocation. This is the FEE-CLASS-GUARD check done right.
- **Corrections — correct, twice.** `bill-correction.service.ts:71-72` and
  `:222-223` explicitly reject an invoice that does not belong to the student;
  `:82-83` rejects an item that is not on the invoice; student, year and reason
  existence are all checked (`:51-63`).
- **Money coercion guard.** `__tests__/no-float-coercion.spec.ts` lexically bans
  `parseFloat(`/`Number(` across `finance`, `hr`, `dashboard`, `library`. It
  passes. (Its blind spot is M2.)
- **Migration ledger on main is contiguous** — `0001`–`0037`, no gaps, no
  duplicate numbers.
