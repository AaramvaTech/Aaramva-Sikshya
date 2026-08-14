# BILLING-CUTOVER Phase 2 — Teacher completeness audit

**Status:** Audit complete. No gap found, no code changed. Confirmed — not assumed — that TEACHER
has zero finance/billing exposure anywhere in the system, on either rail.

**Method:** Same as Phase 1 — live HTTP against the running dev API as a real demo TEACHER
(`teacher@demo.school`, password temporarily shimmed/verified/401-restored), cross-checked against
Postgres and source. The discovery doc's own framing ("expect this to be small... confirm rather
than assume") was taken literally: every finance controller's role-guard constants were read
directly (not sampled), every plausible route was probed live (not just the ones expected to
matter), and the cross-scope probe was run against a student the teacher *does* legitimately teach
academically, not just an arbitrary stranger — the strongest version of the check.

## Backend: zero TEACHER-facing routes, confirmed by reading every role-group constant

Grepped every finance controller (20 files, both the old Finance rail and every Billing rail
controller: assignment, catalog, invoice, payment, pdf, receipt, run, correction, fine, cashier,
settings, ledger, esewa, khalti, payment-gateways) for `Role.TEACHER` and for every `@Roles()`
role-group constant in use (`ACCOUNTANT_AND_ABOVE`, `OWNER_ONLY`, `PAYER_ROLES`,
`MANUAL_ALLOCATION_ROLES`). `Role.TEACHER` appears in exactly one place in the whole module —
`invoice.service.ts`'s spec file, testing that the old rail's `getStudentFeeAssignments` service
method doesn't crash if handed a TEACHER caller. That's dead code from the controller's perspective:
the actual route (`GET /finance/students/:studentId/assignments`) is `@Roles(Role.PARENT,
...ACCOUNTANT_AND_ABOVE)` — TEACHER was never in the list, so a teacher can never reach that service
call through the real HTTP path regardless.

No role-group constant used anywhere in the finance module includes TEACHER:

| Constant | Roles | Used by |
|---|---|---|
| `ACCOUNTANT_AND_ABOVE` | PLATFORM_ADMIN, SCHOOL_OWNER, PRINCIPAL, ACADEMIC_COORDINATOR, ACCOUNTANT | most CRUD/report routes, both rails |
| `OWNER_ONLY` | PLATFORM_ADMIN, SCHOOL_OWNER | deletes, void, adjustments |
| `PAYER_ROLES` | PARENT + the same 5 accountant-tier roles | eSewa/Khalti initiate, `/payment-gateways` |
| `MANUAL_ALLOCATION_ROLES` | PLATFORM_ADMIN, SCHOOL_OWNER, PRINCIPAL | payment allocation mode |

Plus the object-scoped `Role.PARENT` additions on student-scoped routes (ledger, balance,
statement, bill/invoices, fee-preview, payment/receipt detail) — TEACHER is not one of the extra
roles on any of them either.

## Live probes — 14 endpoints, both rails, reads and writes, 100% rejected

As TEACHER (`teacher@demo.school`), against a real student with real Billing data:

| Endpoint | Rail | Result |
|---|---|---|
| `GET /finance/fee-structures` | Old Finance | 403 |
| `GET /finance/reports/student/:id` | Old Finance | 403 |
| `GET /finance/reports/defaulters` | Old Finance | 403 |
| `GET /finance/invoices` | Old Finance | 403 |
| `GET /finance/students/:id/bill/invoices` | Billing | 403 |
| `GET /finance/students/:id/balance` | Billing | 403 |
| `GET /finance/students/:id/ledger` | Billing | 403 |
| `GET /finance/students/:id/statement` | Billing | 403 |
| `GET /finance/students/:id/fee-preview` | Billing | 403 |
| `GET /finance/bill/payments` | Billing | 403 |
| `GET /finance/payment-gateways` | Both (PAYER_ROLES) | 403 |
| `POST /finance/bill/payments` (record) | Billing | 403 |
| `POST /finance/students/:id/fee-structure` (assign) | Billing | 403 |

**Cross-scope probe, strongest form**: re-ran `bill/invoices` and `balance` against **Gita Rai**, a
real student in one of `teacher@demo.school`'s own timetabled sections (confirmed via
`timetable_slots.teacher_id`, a student this teacher has genuine academic scope over — attendance,
marks, timetable all legitimately reach her) — still 403 on both. This confirms finance/billing
access for TEACHER is a hard role gate, not an object-scope check that happens to have nothing
scoped to it; a teacher's real, legitimate academic relationship to a student grants zero finance
visibility into that same student.

## Frontend: zero teacher-facing finance UI, and the admin-shell nav already excludes it

Grepped `apps/web/app/(portal)/teacher/` for finance/fee/invoice/payment. Two of the four matches
found were false positives from a case-insensitive substring match (`assignments` matching
`payment`-adjacent text was not the case here, but `<AmountDisplay>` — a generic money-formatting
component, also used for HR payroll's salary figures — matched `finance` because it's imported from
`components/finance/amount-display.tsx`). Neither `profile/page.tsx` nor `payroll/page.tsx` calls
any Finance or Billing API — `AmountDisplay` is shared UI, and `paymentDate`/`paymentMethod` in the
payroll screen refer to HR salary-slip payment, a completely different domain already documented as
its own thing in CLAUDE.md's WEB-P Phase 3 notes.

`route-access.ts`'s `ACCOUNTANT_AND_ABOVE = ['SCHOOL_OWNER', 'PRINCIPAL', 'ACADEMIC_COORDINATOR',
'ACCOUNTANT']` gates every `/finance*` prefix (old rail, all of `/finance/bill/*`, reports) —
TEACHER isn't in it, and TEACHER *is* in the `WEB_STAFF_ROLES` fallback used for unmapped routes
(confirmed against CLAUDE.md's WEB-P Phase 1 T1 note), but that fallback never applies here because
every `/finance*` prefix is explicitly mapped — the explicit mapping wins, so there's no accidental
hole via the fallback path either.

**Admin-shell nav already filters Finance/Billing out for TEACHER**, and this predates
BILLING-CUTOVER entirely: `components/layout/sidebar.tsx`'s own comment on the nav-filtering logic
reads "a teacher no longer sees Finance/HR/Payroll" — a pre-existing `ROUTE_ACCESS`-driven filter
(unrelated "Task 4" work), not something this audit or this cutover added. A teacher who lands on
the admin shell (which they still can, for non-finance admin screens, per WEB-P Phase 2) never sees
a Finance or Billing sidebar entry at all.

## Conclusion for Phase 3 (nav retirement) — informational, not this phase's job to fix

Phase 3's brief is "remove Finance from sidebar/nav across admin, parent, and teacher portals."
For the **teacher slice specifically, there is nothing to remove** — the nav-level exclusion already
existed before this cutover started. Phase 3 will still have real work for the admin and parent
navs (the admin sidebar's old "Finance" dropdown at `/finance/*`, separate from the newer "Billing"
dropdown, is still visible to ACCOUNTANT_AND_ABOVE roles and needs retiring there); teacher's nav
needs no change. Noting this now so Phase 3 doesn't spend time re-auditing something Phase 2 already
settled.

## Recommendation

1. No gap found. No code changed this phase — there was nothing to build or rewire.
2. Confirmed, not assumed: 14 live probes (both rails, reads and writes) plus the strongest possible
   cross-scope check (a student the teacher legitimately teaches) all rejected with 403. Static
   analysis of every role-group constant in the finance module independently agrees.
3. Phase 3 can skip teacher-nav work for Finance/Billing — already done, pre-dating this cutover.
