# SESSION-R1 — Backend Gap Remediation

**Type:** Backend remediation. Closes the three gaps surfaced by the audit so the Student and Parent apps can be wired. No frontend work in this session.

**Source of truth:** `docs/audits/BACKEND-AUDIT-2026-06-21.md` — read it before anything else.

**Stack:** NestJS + PostgreSQL 17 (schema-per-tenant), Prisma + `TenantPrismaService`, Redis, BullMQ, Sparrow SMS.

---

## Decisions locked (do not re-open in this session)

- **BUG-1 → Option B.** A dedicated guardian-provisioning path. Admission (`admitStudent`) is **not** changed; its JSONB guardian write stays as the admission record. Portal access is created by an explicit, idempotent provisioning action. The relational `guardians` table is the source of truth for parent-portal linkage.
- **BUG-2 → it is a bug.** Reading another staff member's leave-balance / salary-history is HR confidentiality, not the intentional teacher soft-scope. Lock to **self, or admin/principal**.

---

## Hard rules

1. **Step 0 read-and-report before editing** (below). No edits until the report is produced.
2. **Do not weaken the proven hard-scope guards.** The audit proved parent cross-family access returns 403 with ownership firing before the year-lookup. Nothing in this session may regress that — re-run the cross-family probe at the end to confirm it still 403s.
3. **Do not touch the intentional teacher soft-scope** for *acting on sections* (attendance/marks writes recording `marked_by_user_id` / `entered_by_user_id`). BUG-2 is only about HR *reads*.
4. **Prove each fix with a live HTTP smoke probe** against a booted server + live Postgres + the demo seed. Green unit tests are not acceptable proof on their own (the audit exists because mocked tests are blind to SQL-level errors).
5. **Idempotency** everywhere new (re-provisioning the same guardian must not duplicate rows or accounts), matching the demo-seed discipline.
6. **Paste raw output at session end:** `tsc --noEmit -p tsconfig.build.json`, server boot log tail, and the raw status/shape lines from every smoke probe.

---

## Step 0 — Read and report (no edits)

Read, then report your understanding plus the **exact** signatures you will implement:

- The audit report.
- The relational `guardians` table schema, and the **parent ↔ student linkage** table/columns that the hard-scope queries read (the linkage that made the §B child 403 work). Name them exactly.
- How **student and teacher user accounts are created today** — the credential issuance + Sparrow SMS pattern. Parent provisioning must mirror this existing pattern, not invent a new one. If parents authenticate via the code-entry / branded-login screen, identify the exact credential that screen consumes.
- The service currently backing the parent exam-results / report-card endpoints (Task 2 reuses it, scoped to self).
- The controllers for staff `leave-balance/:userId` and `salary-history/:userId` (Task 3).

Report this, propose the concrete endpoint signatures, then proceed.

---

## Task 1 — BUG-1: Guardian provisioning (Option B) — blocks Parent app

Add a runtime path that turns an admission's guardian into a working parent-portal account. A relational guardian row alone is **not** enough — the parent still can't log in — so this task must do all of:

1. **Create/find the relational guardian** for the student (tenant schema), idempotent on a stable key (e.g. phone). Accept guardian details in the request body; optionally allow promoting a guardian already present in the student's admission JSONB (nice-to-have, only if cheap).
2. **Create the Parent user account** (role = parent) if none exists for that guardian, using the **same credential + Sparrow SMS pattern** student/teacher accounts already use. Re-provisioning an existing parent must not create a duplicate or re-fire SMS unintentionally.
3. **Write the parent ↔ student linkage** — exactly the linkage the hard-scope queries read, so the new parent immediately resolves to their own child and only their own child.

**Endpoint:** `POST /students/:studentId/guardians` (or align to existing route conventions). Admin/principal-scoped. Returns the created/linked guardian + whether a parent account was created.

**Update the demo seed** to provision its parent through this new service path (replacing the manual SQL insert used during the audit), so the demo tenant ships a real provisioned parent and future sessions need no hand-inserts. Keep the seed idempotent and service-layer-based.

**Acceptance (smoke):**
- Provision a parent for a demo §A student → 201; relational guardian + parent user + linkage all exist.
- Re-run the same provision → no duplicate guardian, no duplicate user, idempotent.
- Log in as that new parent (mobile path) → reads own child's attendance/results/fees → 200, own data only.
- Same parent requests a §B child → still **403** (hard-scope intact).
- Non-admin caller hitting the provisioning endpoint → 403.

---

## Task 2 — Student self-results endpoint — blocks Student marks screen

The Student app has no way to read a student's own marks. Add a **self-scoped** results endpoint.

- Reuse the existing results/report-card service; add an entry point scoped to the authenticated student's own record (e.g. `GET /me/results`, plus report-card if the app needs it).
- Hard-scoped to self: a student token returns only their own results; there is no path to another student's id.

**Acceptance (smoke):**
- Student token → own results → 200, own marks only.
- Confirm no parameter lets a student fetch another student's results (probe and expect 403/empty, never another student's data).

---

## Task 3 — BUG-2: Teacher HR self-scope — confidentiality fix

`leave-balance/:userId` and `salary-history/:userId` currently have no self-check.

- Restrict to: the authenticated user's **own** `:userId`, **or** admin/principal role (admin may read anyone).
- Do not change the teacher soft-scope for section actions — only these HR reads.

**Acceptance (smoke):**
- Teacher → own leave-balance / salary-history → 200.
- Teacher → a colleague's → **403**.
- Admin → any → 200.

---

## Not in scope (do not do here)

- No frontend / app wiring (separate sessions).
- No change to `admitStudent`'s JSONB write or the web admission UI.
- No header-vs-JWT tenant-binding change (audit flagged it as not exploitable under schema isolation; backlog it).
- No Admin/Principal mobile work (web-only, decided).

---

## Session-end deliverable

Paste, raw and unsummarized:
- `tsc --noEmit -p tsconfig.build.json` result.
- Server boot log tail.
- Every smoke probe's status + shape line, grouped by task, including the re-run of the parent cross-family 403 probe proving hard-scope did not regress.

Then a one-line verdict per task: fixed / not fixed.
