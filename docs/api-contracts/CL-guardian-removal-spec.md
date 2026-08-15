# CL — Guardian Removal Feature + Soft-Delete Propagation

**Status:** Spec, not yet built.
**Trigger:** Audit found `guardians.deleted_at` (migration 0008) has zero write path
anywhere in the app — no endpoint, no service method, no admin UI. It's scaffolding for
a feature that was never finished. This spec finishes it.

**Current real-world risk:** none — the flag can never become non-null today except via
manual DB edit. This is a build-out, not an urgent fix.

## What "remove a guardian" should mean

A guardian being removed from a student doesn't delete the guardian's user account —
it should sever the guardian-student link (and by extension, that guardian's access to
that specific student's data). A guardian could plausibly be linked to multiple students
(siblings) — removal should be scoped to a specific guardian-student link, not the
guardian's account wholesale, unless it's their only link.

**Open question for the spec review, not for Claude Code to decide:** should removing a
guardian's last/only student link also deactivate their login entirely, or just leave
them logged in with zero visible children? Recommend: leave login intact but empty —
simpler, reversible, avoids a second parallel "deactivate user" code path. Flag if you
want it to work differently.

## Phase 0 — Shared helpers (build before anything else uses them)

Two shared helpers, per the audit's finding that ~25 call sites collapse into 2 query
shapes:

1. **`GuardianScopeService.assertOwnsStudent(callerId, studentId)`** — replaces the
   ~10 copy-pasted ownership/membership checks (finance ×4, payment gateways ×2,
   attendance ×2, exams, storage, timetable, corrections' second copy). Must filter
   `deleted_at IS NULL`. Throws/rejects the same way the existing copies do today, so
   swapping them in doesn't change error behavior for callers.

2. **`GuardianService.getActiveParentUserIds(studentId)`** (or similar) — replaces the
   ~12 audience/fan-out call sites (5 listener files, `sms.service.ts` ×3,
   `submission.service.ts`). Filters `deleted_at IS NULL`. Returns whatever shape each
   caller currently needs (phone, user id, etc. — check each call site's actual usage
   before finalizing the return shape).

**Checkpoint:** both helpers built and unit-tested in isolation, not yet wired into any
call site. Confirm they return identical results to the current unfiltered queries when
`deleted_at` is NULL everywhere (i.e., no behavior change yet — pure refactor at this
point).

## Phase 1 — The actual removal endpoint

- New endpoint, admin-role-gated (SCHOOL_OWNER/PRINCIPAL/ACADEMIC_COORDINATOR — match
  whatever role tier manages student records today), something like
  `DELETE /students/:studentId/guardians/:guardianId`
- Sets `deleted_at` on the guardian-student link (soft delete, matching this codebase's
  established soft-delete-only convention)
- If this was the guardian's only linked student, decide per the "open question" above
- Add an admin-facing "Remove guardian" action in the student profile page, where
  guardians are currently listed

**Checkpoint:** live removal via real HTTP call, Postgres read-back confirming
`deleted_at` is set. Confirm the guardian's own `GET /guardians/me` /
`GET /students/my-children` correctly stop showing the removed link (these already
filter correctly per the audit — this just confirms the write path feeds them right).

## Phase 2 — Wire the ownership-check sites to the shared helper

Replace all ~10 copy-pasted `assertGuardianOwnsStudent`/`assertParentOwnsStudent`
implementations (finance, payment gateways, attendance, exams, storage, timetable,
corrections) with calls to `GuardianScopeService.assertOwnsStudent`.

**Checkpoint:** live proof — remove a test guardian's link via Phase 1's endpoint, then
confirm that guardian's PARENT account gets rejected (403) on: viewing invoices/ledger,
initiating a payment, filing a leave application, viewing attendance history,
downloading a report card, viewing timetable, accessing presigned files. This is the
core proof that removal actually does something now.

## Phase 3 — Wire the audience/fan-out sites

Replace the ~12 listener/SMS/submission call sites with
`GuardianService.getActiveParentUserIds` (or the phone-resolution equivalent).

**Checkpoint:** live proof — confirm a removed guardian's PARENT account stops receiving:
absence alerts, notice pushes, assignment notifications, exam-result notifications,
payment/overdue alerts, and bulk broadcasts (ALL_PARENTS/class/section-scoped SMS).

## Phase 4 — Display site

Fix `student.service.ts`'s `fetchGuardians` (backs `GET /students`, `GET /students/:id`,
create/update response) to filter `deleted_at IS NULL`. One-off, single-site fix.

**Checkpoint:** live proof — removed guardian no longer appears in the student's admin
profile guardian list.

## Phase 5 — Full verification

- Live HTTP + Postgres read-back across every site touched in Phases 2-4, for one real
  test guardian-student link, removed once and checked everywhere
- Confirm nothing broke for guardians who were *not* removed — a false-positive filter
  bug here would lock active parents out, which is worse than the original gap
- Regression test coverage for both shared helpers, proven non-tautological (same
  standard as MON-1's guard: deliberately break something, confirm the test catches it,
  revert)

## Out of scope

- Bulk guardian management UI, guardian merge/dedup tooling — not asked for
- Any change to how guardians are *added* — this is purely about removal
