# SESSION-LV1 — Student Leave Approval Loop

**Type:** Backend + web. Closes the dead-end from M7.1: parents file student leave as `PENDING`, but there's no way for the school to approve/reject it and no notify-back. This makes the leave feature work end-to-end.

**Source of truth:** `docs/audits/FEATURE-COVERAGE-2026-06-23.md` (Task 3, leave loop); M7.1 (the parent write — `POST /attendance/leave` → status defaults `PENDING`, `applied_by` stamped, hard-scoped to the parent's own child).

**Stack:** NestJS + PostgreSQL (schema-per-tenant), Prisma + `TenantPrismaService`; Next.js 14 web admin (App Router, TailAdmin, shadcn/ui, TanStack Query). Sparrow SMS for notify-back (push deferred).

---

## Hard rules

1. **Step 0 read-and-report before editing** — surface the existing leave model, statuses, and who's allowed to decide, before building.
2. **Live-prove the state transition** against real Postgres (PENDING → APPROVED/REJECTED), with a read-back — not mocked. Writes follow the project's live-proof rule.
3. **Authorization:** only the roles permitted to decide leave (confirm in Step 0 — likely academic coordinator / principal / admin) may approve or reject. A teacher or parent must not. Prove the 403.
4. Don't change the parent-side filing (M7.1) or its hard-scope.

---

## Step 0 — Read and report (no edits)

- The leave record model: table, `status` enum/values, date fields, `applied_by`, any existing `reviewed_by` / decided-at / decision-note columns (or their absence).
- Existing endpoints touching leave (list / get / any decision route already present?).
- Which roles are authorized to decide (from the guards / role list — coordinator, principal, admin?).
- Whether an approved leave is meant to **reflect into attendance** as `LEAVE`, and if any code already does that.
- Where leave would live in the **web** admin IA (an existing approvals/requests area, or net-new page?).

Report this, propose the endpoint signatures + the web page, then proceed.

---

## Task 1 — Backend decision endpoints

- A **list** endpoint for pending (and recent) leave requests, scoped to the tenant, filterable by status, returning applicant + child + dates + reason. Confirm whether one already exists before adding.
- A **decision** endpoint (e.g. `PATCH /attendance/leave/:id` or `/decision`) that sets `APPROVED` or `REJECTED`, stamps the **decider** (`reviewed_by` from the token) and a decided-at timestamp, and accepts an optional decision note. Add the columns if absent (migration).
- Guard to the authorized decider roles only.
- On **APPROVE**, reflect the leave into attendance as `LEAVE` for the covered date range (confirm the intended behavior in Step 0; if the system treats leave as separate from attendance, follow that instead — don't invent).
- **Notify-back:** on a decision, send the applicant an SMS via Sparrow (approved/rejected + dates). Keep it idempotent / fire-once.

## Task 2 — Web approve/reject UI

- A **Leave requests** page in the admin portal: a list of PENDING requests (child, class/section, dates in BS via the web BS component, reason, applied-by), with **Approve** / **Reject** actions (reject prompts for an optional note).
- TanStack Query; optimistic or await-then-invalidate; loading / error / empty states; a recent-decisions view or status filter so decided items don't vanish without trace.
- Match the existing admin portal's patterns and components.

---

## Not in scope

- No change to the parent app's filing flow.
- No push notifications (SMS only; push is later).
- No teacher-leave (HR) changes — this is student attendance-leave.

---

## Verification

- `tsc --noEmit` (api + web) clean.
- **Live state transition (raw):** as the demo parent, file a leave (PENDING). As an authorized decider, **approve** it → `SELECT` confirms `status=APPROVED`, `reviewed_by` = decider, decided-at set; if leave reflects into attendance, confirm the `LEAVE` rows. Repeat with **reject** + note. Paste statuses + SELECT read-backs.
- **Authorization (raw):** a teacher and a parent hitting the decision endpoint → **403**. Paste them.
- **Notify-back:** confirm the Sparrow send fires once on decision (log/stub evidence).
- Verdict: wired / blocked.
