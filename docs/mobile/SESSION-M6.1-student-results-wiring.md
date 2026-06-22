# SESSION-M6.1 — Student Results screen wiring

**Type:** Mobile wiring. Swap the M6 mock for the live endpoint, hard-scoped to the student's own record. **No backend changes. No redesign.**

**Source of truth:**
- M6 build: `app/(student)/results.tsx`, `hooks/useStudentMe.ts` (`useMyResults()` mock with the swap comment + `MOCK_RESULTS_STATE`), and the typed `StudentResults` contract in `types/index.ts`.
- R1 endpoints: `GET /students/me/results`, `GET /students/me/report-card`.
- R2 demo: `student@demo.school` / `Student@123` (Aarav Shrestha, Grade 9 A).

---

## Hard rules

1. **Step 0 gate first** (below). No wiring until it passes.
2. **No backend changes.** If the live shape diverges from the contract in a way the screen needs and only backend can fix, **STOP and report**.
3. **Hard-scope.** The hook calls the self `/me` endpoint only — no student id from the client, no path to another student's results. Server enforces 403 regardless.
4. **Response-shape discipline** (`.data.data` etc.) — audit the live response, don't assume.
5. Keep the three states M6 built (loading / error / empty). Remove or guard `MOCK_RESULTS_STATE`.
6. Reuse the existing patterns; no restyle.

---

## Step 0 — Gate (no wiring yet)

- Call the live endpoints as the demo student and **reconcile field-for-field** against the typed `StudentResults` contract (`{ student, examResults[], annualResult }`). Determine which endpoint feeds the screen — `report-card` is the full `{student, examResults, annualResult}`; if `/me/results` is a lighter list, wire **report-card**. Note any field-name differences (handled by a mapping in the hook — not a redesign).
- **Confirm the demo student has computed/published results to render.** The R2 reseed may not have computed any. If there are none, compute them via the existing compute path (data setup, no code change) so the live render is provable. Record what's now present.
- **GATE:** contract reconciles and data exists → wire. If the live shape is materially missing fields the screen needs → STOP and report.

---

## Wiring

- Replace `useMyResults()`'s mock `queryFn` with the real `api.get('/students/me/report-card')` (per the swap comment), parsing at the correct depth.
- Map live fields → the `StudentResults` contract; keep the term selector / summary / per-subject / annual rendering unchanged.
- Remove or guard `MOCK_RESULTS_STATE`.

---

## Verification (live walk-through + logs)

- Boot API + demo seed; log in as the demo student (mobile path).
- Results screen renders **real** marks (term, GPA, rank, per-subject theory/practical/total/grade).
- **Empty state** reachable (a student or term with no published results) — confirm it shows "No results published yet", not zeros/blank.
- **Hard-scope:** confirm there's no client path to another student's results; probe another student's id directly → server 403.
- `tsc --noEmit` → 0.
- **Paste:** the live GET status + response shape, the rendered values for the demo student, the per-state checklist (data / loading / error / empty), and the hard-scope probe. Verdict: wired / blocked.
