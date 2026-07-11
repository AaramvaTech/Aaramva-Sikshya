# POL-1 — Polish Sweep: API + Web

**Save location:** `docs/api-contracts/POL-1-api-web-polish.md`
**Scope:** apps/api + apps/web. Closes audit P2 items 18–19 (web half) and accumulated backlog bugs. Mobile polish is POL-2.
**Baseline:** 404 api tests, all-green on main.

## Step 0 — Read and report (per item, before editing that item)
For each task below, locate the code, confirm the problem still exists as described, and report file:line. If an item turns out already fixed or materially different, say so and skip/adapt.

## Tasks

### T1 (api) — fee-structures dueDate bug
PAY-1 found `POST /finance/fee-structures` rejects `dueDate` (text-vs-date cast). Diagnose properly (likely the raw-SQL text-column gotcha from CLAUDE.md), fix, regression test, and verify the PAY-1 workaround (`dueDayOfMonth`) still works.

### T2 (api) — guardian-profile endpoint
The mobile parent app synthesizes the guardian's display name from their email because no profile endpoint exists. Add `GET /guardians/me` (PARENT role, self-scoped): name, relation, phone, email, linked children summary. Mirror the established /me patterns. (POL-2 consumes it.)

### T3 (api) — parent access to report-card PDF
Students have a self-service report-card PDF; parents don't for their children. Add the parent-scoped variant reusing the existing PDF generation, hard-scoped through the guardians linkage (403 cross-family probe test, IDOR discipline).

### T4 (api) — force-change-temp-password-on-first-login
MAIL-1's backlog item. `must_change_password` flag (tenant migration 0006 via the runner, canary-first — also add it to the users provisioning defaults where temp passwords are generated); login response carries the flag; change-password clears it. Enforcement UX: the WEB shell redirects flagged users to the change-password page until cleared (mobile equivalent is POL-2). Guard subtlety: the flag must not block the change-password/logout endpoints themselves.

### T5 (web) — defaulter export
Replace the leftover `console.log` (finance/reports) with a real CSV download of the defaulters table (client-side CSV from the fetched data is fine; BS dates formatted as displayed).

### T6 (web) — grading-scale CRUD UI
Backend + types exist; build the missing settings/examination page for grading scales using the established module patterns (list, create, edit; the Radix Select computed-span convention from CLAUDE.md where async data feeds selects).

### T7 (web) — error boundaries
Failed GETs currently render silently-empty pages. Add a shared query-error state (retry button, error message) wired into the module page patterns — at minimum on the highest-traffic list pages (students, finance, attendance, exams) plus a route-level error boundary. Not a whole-app refactor; establish the pattern + apply where it hurts.

## Verification — raw
1. T1: create fee structure with dueDate live → 201 → SELECT read-back; regression test.
2. T2/T3: live parent login → /guardians/me payload; report-card PDF 200 + magic bytes for own child; 403 probe for another family's child (both raw).
3. T4: migration canary→all with ledger read-backs; live flow — temp-password user logs in → flag in response → web redirects to change-password → change → flag cleared (SELECT) → normal navigation. Also prove logout works while flagged.
4. T5: exported CSV pasted (first rows).
5. T6: CRUD round-trip via UI-driven HTTP (create/edit/list raw).
6. T7: kill the API mid-session → students page shows the error state, not a blank (DOM/text proof).
7. Suites: api ≥404 (+new), web tsc clean, push + all-green. All crafted rows cleaned with read-backs.

## Out of scope
Mobile (POL-2), Nepali i18n, Swagger/e2e (still future), FILE-1/EAS.
