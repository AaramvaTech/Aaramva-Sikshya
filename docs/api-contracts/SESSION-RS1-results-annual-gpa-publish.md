# SESSION-RS1 — Results: Annual GPA + Publish Gate

**Type:** Backend + web (+ light mobile/contract). Turn on the annual GPA (currently stubbed), stitch all terms into an annual view for students and parents, and add a per-term **publish** gate so results only appear once the school is ready.

**Source of truth:** `docs/audits/FEATURE-COVERAGE-2026-06-23.md` (results last-mile); M6/M6.1 (student report-card screen + `StudentResults` contract — `annualResult` already handled as nullable); M4 (parent report-card).

**Stack:** NestJS + PostgreSQL (schema-per-tenant), Prisma + `TenantPrismaService`; Next.js 14 web admin; mobile already consumes report-card.

---

## Hard rules

1. **Step 0 read-and-report before editing.**
2. **Follow the backend's existing weighting intent — don't invent a rule.** The annual GPA is currently *computed then discarded* (weighted % computed at `result.service.ts` ~526, then `finalGpa/finalGrade` hardcoded null). Step 0 determines whether exams carry weights; the annual GPA uses them if so, else a straight average of terms. Report which it is before building.
3. **Live-prove** the annual GPA against real Postgres (read-back), and prove the publish gate actually hides/shows results.
4. Don't break M6/M6.1 (student) or the parent report-card — the `annualResult` shape they already accept should now arrive populated instead of null.

---

## Step 0 — Read and report (no edits)

- The result/exam model: how a term result is computed and stored, the discarded weighted-% path (`result.service.ts`), and whether **exam types carry a weight** (so annual = weighted) or not (annual = straight average of terms).
- The report-card endpoints: `/students/me/report-card` (student self) and the parent path — confirm both already return **all** terms (`examResults[]`) or only one; the parent must get the full per-child view.
- Whether any **publish/visibility** flag exists on results today (likely not — confirm).
- Where a publish toggle would live in the **web** admin results IA.

Report this (especially the weighting answer), propose the changes, then proceed.

---

## Task 1 — Annual GPA (un-stub, following Step 0's weighting)

- Compute and return the real `finalGpa` / `finalGrade` from the term results, using the backend's existing weighting if exams carry weights, else a straight average across terms. Stop discarding the computed value.
- Return it in `annualResult` (the shape M6/M4 already accept). Define behavior when only some terms exist (e.g. annual shown only once all terms for the year are present/published — confirm in Step 0, default to "compute from whatever terms are published").

## Task 2 — Publish gate

- Add a per-term **publish** flag (migration if absent). Results for a term are visible to **students/parents** only when that term is published.
- Teacher marks-entry and admin views are unaffected (they see unpublished). The gate applies to the student/parent report-card responses.
- **Web:** a publish/unpublish control per term in the admin results area (with a clear published/unpublished state).

## Task 3 — All-terms + annual view (student & parent)

- Confirm the report-card responses return **every published term** plus the populated `annualResult`. Adjust the parent path if it returns only one term.
- Mobile: the M6 screen already has a term selector + `annualResult` handling — confirm it now renders the annual section (no longer null) and shows all published terms. Light change only; no redesign.

---

## Not in scope

- No PDF/Word download — that's RS2.
- No new grading-policy config UI — follow existing weighting only.
- No change to marks entry.

---

## Verification

- `tsc --noEmit` (api + web) clean.
- **Annual GPA (raw):** for a demo student with multiple published terms, `GET /students/me/report-card` → `annualResult` populated; `SELECT`/recompute confirms the value follows the Step 0 weighting. Paste it. (If only one term exists, compute a second so the annual is provable.)
- **Publish gate (raw):** unpublished term → not in the student/parent response; publish it → now present. Paste both states.
- **Parent parity:** parent report-card for a child returns all published terms + annual. Paste.
- Mobile: confirm the annual section now renders for the demo student.
- Verdict: wired / blocked.
