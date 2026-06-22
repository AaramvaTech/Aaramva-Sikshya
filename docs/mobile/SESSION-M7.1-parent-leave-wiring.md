# SESSION-M7.1 — Parent Leave-filing wiring

**Type:** Mobile wiring — the parent app's **first live write**. Swap the M7 mock submit for the live `POST /attendance/leave`, hard-scoped to the parent's own child. **No backend changes. No redesign.**

**Source of truth:**
- M7 build: `app/(parent)/request-leave.tsx` (the form, `ChildPicker` on `selectedChildId`, `MOCK_SUBMIT_OUTCOME`, and the `handleSubmit` swap comment → `POST /attendance/leave` `{ studentId, fromDate, toDate, reason }`).
- Audit / M4: `POST /attendance/leave` is WORKING and hard-scoped (403 cross-family).
- R2 demo: `parent@demo.school` / `Parent@123`, two children — Aarav (roll 1) and Binod (roll 2).

---

## Hard rules

1. **Step 0 gate first** — confirm the real contract before wiring (below).
2. **No backend changes.** If the live DTO needs a field the form can't trivially supply, **STOP and report**; don't reshape the backend here.
3. **Hard-scope.** `studentId` is **only ever** the selected child's id from `my-children`/`selectedChildId` — never an arbitrary or user-typed id. Server enforces 403 regardless.
4. **Prove the write live** (this is a write — the testing rule applies): POST against real Postgres and read the row back. Mocked assertions are not proof.
5. Remove or guard `MOCK_SUBMIT_OUTCOME`. Keep the submitting / success / error states M7 built.

---

## Step 0 — Gate (no wiring yet)

- Read the `POST /attendance/leave` DTO + controller and produce the **exact** request contract. Reconcile against the form's `{ studentId, fromDate, toDate, reason }`:
  - Single date or a `fromDate`/`toDate` **range**? Is the field really `studentId`? Is a **leaveType/category** or `academicYearId` required?
  - If the DTO needs one extra trivial field (e.g. a leave type with a small enum), add the minimal control to match — a small adjustment, not a redesign. If it diverges materially, STOP and report.
- Confirm the **success/error response shape** (201 + body).
- Clarify the **leave lifecycle**: does `POST /attendance/leave` create an **approved** leave (immediately reflected as LEAVE in the child's attendance) or a **pending request**? This determines what "success" should say and what the verification checks. Report it.
- **GATE:** contract reconciles (or a trivial form tweak suffices) and the lifecycle is understood → wire. Otherwise STOP and report.

---

## Wiring

- Replace the mock submit with `api.post('/attendance/leave', payload)`, where `studentId` = `selectedChildId` and `fromDate`/`toDate` are the AD strings the form already produces via `localDateKey(bsToAd(...))`.
- Keep the submitting / success (banner + reset) / error (banner + retry) states.
- On 201 success, **invalidate the child's attendance query** so the leave reflects (and, if a leave-history view exists, that too).
- Remove `MOCK_SUBMIT_OUTCOME`.

---

## Verification (live walk-through + write proof)

- Boot API + demo seed; log in as the demo parent (mobile path).
- **File leave for own child** (Aarav) with a valid range + reason → **201**. Then `SELECT` from Postgres to confirm the row persisted with the right `student_id`, dates, and reason (and any actor stamp like `requested_by`/`created_by` if present). Paste status + the SELECT result.
- **Multi-child:** switch to the second child (Binod) and file → confirm the row carries Binod's `student_id`, not Aarav's.
- **Hard-scope:** confirm the client only ever sends own-children ids; POST directly with a **non-child** `studentId` → server **403**. Paste it.
- **Lifecycle check:** per Step 0 — if the leave is immediately effective, confirm it shows as LEAVE on the child's attendance after filing; if it's a pending request, confirm success messaging reflects "submitted/pending," not "approved."
- **Validation + error:** submit disabled until child + valid range + non-empty reason; invalid range shows the error; the error path shows the banner + retry.
- `tsc --noEmit` → 0.
- **Paste:** POST status + the SELECT read-back, the multi-child filing, the hard-scope 403, and the per-state checklist. Verdict: wired / blocked.
