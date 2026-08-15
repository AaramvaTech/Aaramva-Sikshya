# BILLING-CUTOVER — Discovery Doc

**Status:** DONE — all five phases complete, old Finance module fully retired. See
`BILLING-CUTOVER-phase-0-*` through `-phase-4-hard-retirement.md` for the per-phase record
(Phase 0 was folded into the Phase 0 commit directly; Phases 1-4 each have their own doc).
**Decision owner:** Srijan
**Type:** One-way door (old Finance module is deleted, not deprecated-in-place) — door closed.

## Context

Finance was the original fee/invoice/payment system. Billing (BILL-0 through BILL-9) is
the rebuilt replacement — same job, proper append-only ledger instead of direct
invoice/payment tables. Both have been running side by side deliberately since Billing
shipped, pending a deliberate cutover decision. That decision has now been made.

**Trigger:** Investigation into a reported "billing not working on student profile" bug
(see BILL-STUDENT-PROFILE-BUG findings below) confirmed Billing's admin-side plumbing is
sound. That cleared the way to scope the full cutover.

**Key simplification:** the schools currently on Billing/Finance (`motherland-school`,
`test`, demo tenant) are all dummy/test data. **No data migration, no old-vs-new
reconciliation, no ledger backfill.** This turns the cutover from a careful historical-data
migration into: complete any missing role coverage, then hard-delete the old module.

## Scope decision: which roles get Billing

| Role | Gets Billing? | Notes |
|---|---|---|
| Admin (SCHOOL_OWNER/PRINCIPAL/ACADEMIC_COORDINATOR/ACCOUNTANT) | Yes — already has it | Confirmed working (see bug findings) |
| Parent | Yes — needs completeness audit | Parent is the financially-responsible-party view |
| Teacher | Yes — needs completeness audit | Exposure likely minimal, confirm not zero |
| Student | **No — explicitly excluded** | Matches existing WEB-P Phase 4 decision: student has zero finance API access. This was reaffirmed, not revisited, during this scoping. Do not build student-facing billing. |

## BILL-STUDENT-PROFILE-BUG — findings (already resolved, folded in as Phase 0)

Diagnosis confirmed this was **not** a missing feature. The admin Billing tab on
`/students/[id]` (UI-2: fee assignment, overrides, concessions, transport, fee preview) is
fully built, correctly gated, correctly wired. Root cause was scratch-data hygiene, not code:

- Every fee structure in the demo tenant is soft-deleted (leftover from past live-proof
  sessions) — nobody reseeded a real one afterward
- `GET /finance/bill/fee-structures` correctly returns empty — that's accurate, not a bug
- One student's fee-structure-assignment record still references a now-deleted structure
  ID, which the UI silently falls back to displaying as a raw UUID
  (`fee-structure-assignment-panel.tsx:37` — `structureName()` fallback)

### Phase 0 — data hygiene checkpoint (do first, before any audit)

1. Seed one real, permanent, non-deleted fee structure in the demo tenant (so audits below
   aren't testing against an empty-by-accident state)
2. Fix `structureName()` fallback to render `"Fee structure (deleted)"` instead of a bare
   UUID — cheap defensive fix, prevents this exact confusion recurring on any tenant
3. Verify: `GET /finance/bill/fee-structures` returns the seeded structure; assignment
   panel resolves names correctly; live Postgres read-back confirms `deleted_at IS NULL`
   on the seeded row

**Checkpoint.** Confirm Phase 0 clean before starting Phase 1.

## Phase 1 — Parent completeness audit

Confirm Billing has parity with whatever Finance exposed to parents. For each parent-facing
surface (invoices/dues, payment history, receipts, statements, whatever Finance had):

- Does an equivalent exist in Billing?
- Does it return correct, non-empty data for a parent with real (dummy) billing history?
- Live HTTP call + Postgres read-back per endpoint, not a mocked test

Output: a gap list — what Finance had for parents that Billing doesn't yet cover.

**Checkpoint.** Report gap list before deciding whether to close gaps now or descope.

## Phase 2 — Teacher completeness audit

Same method as Phase 1, teacher role. Expect this to be small (teachers likely never had
much Finance exposure) — confirm rather than assume.

**Checkpoint.**

## Phase 3 — Nav retirement

Remove "Finance" from sidebar/nav across admin, parent, and teacher portals. Point any
remaining internal links/redirects at Billing equivalents. Student portal nav is untouched
(never had Finance nav to begin with, per existing design).

## Phase 4 — Hard retirement of Finance module

Since this is dummy data with nothing worth preserving, this is a clean removal rather than
soft-deprecate-and-redirect:

- Delete old Finance routes/controllers
- Delete old Finance-only DB tables (confirm no Billing code path reads from them first —
  grep for references before dropping)
- Remove old Finance frontend pages/components across all portals

**Checkpoint.** This step is irreversible — explicit go-ahead required before Claude Code
touches DB schema or deletes routes.

## Phase 5 — Verification

Per role (admin, parent, teacher): live HTTP calls against every Billing endpoint that
replaces a former Finance one, plus Postgres SELECT read-backs confirming the data is
correct. No old-vs-new number matching needed (no migration happened). Standard proof
bar — mocked tests not accepted.

## Open questions for Srijan before build starts

- Phase 0 fixes: bundle into this doc's build, or do them right now as a standalone quick
  task since they're unrelated to the cutover itself?
- Any known Finance-only feature you already know Billing is missing for parent/teacher,
  so Phase 1/2 audits aren't starting blind?
