# FEE-CLASS-GUARD — Fee Structure Class/Section Assignment Guard

**Status:** Spec — not yet built
**Touches:** `apps/api` billing module (single-student assign, bulk-assign), `apps/web` admin billing UI (assignment forms)
**Depends on:** existing BILL-0→9 assignment endpoints (already merged)

## Problem

A fee structure is created against a specific class/year (and optionally a
section) — e.g. "Grade 1 — Day Scholar". Today, nothing at assignment time
checks that the fee structure's class matches the target student's/section's
class. A Grade 1 structure can currently be assigned — single-student or via
Bulk Assign — to a Grade 5 student with no warning and no block. The class
field on the fee structure is descriptive only; it is not enforced.

## Ruling

Default to **hard guard with explicit override**, not silent freedom:

- If a fee structure's class (and section, when the structure specifies one)
  does not match the target student's actual class/section, the assignment
  is **blocked by default**.
- The caller (web UI or any other client) may explicitly opt in to a
  cross-class assignment by passing an override flag. This exists to support
  legitimate cross-class structures (e.g. a "Transport" or "Hostel" fee
  structure shared across grades) — but it must be a deliberate, visible
  choice each time, not a default-on behavior.
- This is an API-level guard, not just a UI nicety — the check must live in
  the backend so it can't be bypassed by mobile clients, scripts, or a UI bug.

## Scope of change

### 1. Single-student assignment endpoint
(`.../students/:id/fee-structure-assignments` or equivalent — confirm exact
route from BILL-0 spec)

- Before creating the assignment, compare `feeStructure.classId` (and
  `feeStructure.sectionId` if set) against the student's current
  `classId`/`sectionId`.
- On mismatch:
  - If request does not include `allowCrossClassAssignment: true` → reject
    with `422` and a structured error body:
    ```json
    {
      "code": "CLASS_MISMATCH",
      "feeStructure": { "id": "...", "className": "Grade 1", "sectionName": null },
      "target": { "studentId": "...", "className": "Grade 5", "sectionName": "A" }
    }
    ```
  - If request includes `allowCrossClassAssignment: true` → proceed, and
    record `class_mismatch_overridden: true` plus `overridden_by_user_id`
    and `overridden_at` on the assignment row (accountability stamp,
    consistent with the `marked_by_user_id`/`entered_by_user_id` pattern
    used elsewhere).
- On match: proceed exactly as today, no behavior change.

### 2. Bulk Assign endpoint (background job)
(`.../billing/assignments/bulk` or equivalent)

- The class/section-mismatch check must run **per student inside the job**,
  not just once against the declared scope — because scope can be a
  hand-picked list of students spanning multiple classes/sections, not just
  a single class/section pick.
- Job-level request also accepts `allowCrossClassAssignment: true`, applied
  uniformly to every student processed in that run.
- Students skipped due to mismatch (when override is not set) must appear in
  the job's existing failure/summary reporting with a `CLASS_MISMATCH`
  reason per student — reuse the existing per-student outcome reporting
  pattern (`Will be charged` / `No fee assigned` / `Already billed` /
  `Excluded` / `Failed`), adding `Class mismatch` as a new outcome type.
- This must not change job semantics for matching students — one student's
  mismatch does not affect any other student in the run.

### 3. Web admin UI (assignment forms)

- **Single-student assignment (student Billing tab):** if the admin picks a
  fee structure whose class doesn't match the student's class, show an
  inline warning immediately (before submit) with both class names, and
  require an explicit checkbox/confirmation to proceed. Do not silently
  submit with the override flag — the admin must see the warning each time.
- **Bulk Assign:** default the class/section scope picker to the selected
  fee structure's own class/section. If the admin changes scope to a
  different class/section (or picks a hand-picked list spanning other
  classes), show the same warning before submit and require the same
  explicit confirmation.
- Fee Preview panel (student Billing tab) should also surface a mismatch
  indicator if an existing assignment was made with the override, so an
  admin reviewing a student later can see it was intentional, not a bug.

## Out of scope / open questions (do not build without a ruling)

- **Existing assignments:** no retroactive migration or backfill is
  authorized by this spec. Do not scan/flag existing mismatched assignments
  unless a follow-up ticket explicitly asks for it.
- **Section-level strictness:** if a fee structure has no section set (i.e.
  applies to the whole class), do not require the student to have any
  particular section — only class must match in that case.

## Proof required before this is considered done

Per project standard, live HTTP + Postgres SELECT read-back — no mocked
tests accepted as proof.

1. Create a Grade 1 fee structure. Attempt single-student assign to a real
   Grade 5 test student without the override flag → confirm `422
   CLASS_MISMATCH` response, and confirm via SELECT that no row was created
   in the assignment table.
2. Retry the same call with `allowCrossClassAssignment: true` → confirm
   `201`/success, and confirm via SELECT that the row exists with
   `class_mismatch_overridden = true`, `overridden_by_user_id` populated.
3. Bulk Assign the Grade 1 structure to a hand-picked list containing both
   Grade 1 and Grade 5 students, without override → confirm the job
   completes, Grade 1 students are assigned (SELECT confirms rows), Grade 5
   students are reported as `Class mismatch` and have no assignment row.
4. Same bulk run with override flag set → confirm all students, including
   Grade 5 ones, get assignment rows with the override stamp.
5. Confirm a same-class assignment (no mismatch) behaves exactly as before
   the change — no override flag needed, no new warning.

Evidence chain for the API half: `FEE-CLASS-GUARD-evidence.md` (that file is
the source of truth for what was proved, not any chat transcript).

---

## Addendum — rulings (2026-08-16, API checkpoint review)

These were decided after the API half was built and proved. They are binding.

### A1. A student with no class blocks

`students.class_id` is nullable. A student with `class_id IS NULL` is treated
as a **mismatch** and is blocked (overridable like any other mismatch). The
guard cannot confirm a match, and this feature defaults to blocking rather than
waving through. Confirmed, keep.

### A2. The override flag is deliberately NOT role-restricted

`allowCrossClassAssignment` is available to every role that can already assign a
fee structure (`ACCOUNTANT_AND_ABOVE`) — there is no extra role gate, no
approval workflow, and no threshold, unlike BILL-6's corrections.

The intended friction is **deliberate action plus the audit stamp**, not
permission: the caller must consciously pass the flag on that request, and the
row permanently records `class_mismatch_overridden` / `overridden_by_user_id` /
`overridden_at`. Cross-class structures (Transport, Hostel) are a normal, daily
part of the job for the same people who do ordinary assignment; gating them
behind a second role would push work onto an owner for a routine case and, in
practice, get worked around.

If this ever needs tightening, the stamp is already the reporting primitive —
add a review over `class_mismatch_overridden = true` before adding a role gate.

### A3. §2's outcome list was wrong; `failures[].reason` is the correct home

The outcome names in §2 (`Will be charged` / `No fee assigned` / `Already
billed` / `Excluded` / `Failed`) are **bill-run line outcomes**
(`BillRunLineOutcome`, `apps/web/components/finance/bill-run-outcome-badge.tsx`)
— they belong to a different feature and Bulk Assign never had them. Author's
error, acknowledged at the API checkpoint.

Bulk Assign's real per-student outcome reporting is
`bulk_assign_jobs.failures[]` (`{ studentId, error }`, rendered by
`bulk-job-progress.tsx`). The class-mismatch outcome is carried there as a new
**optional** `reason: 'CLASS_MISMATCH' | 'STUDENT_INVALID'` field.

`reason` is optional on purpose: `failures` is a `jsonb` column that was never
migrated, so every historical failure row has only `{studentId, error}`.
**Any consumer — web UI included — must handle `reason` being absent** and fall
back to rendering the `error` string.
