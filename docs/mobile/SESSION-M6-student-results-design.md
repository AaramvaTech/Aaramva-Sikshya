# SESSION-M6 — Student Results / Report-card screen (Claude Design build)

**Type:** Mobile UI build (Claude Design). Build the screen with **mock data shaped exactly like the live endpoint** so the later wiring session is a clean swap. **No live data wiring, no backend changes** — that's M6.1.

**Why:** the student app has no way to see its own marks; the endpoints already exist (`GET /students/me/results`, `GET /students/me/report-card`, added in R1). This builds the missing screen.

**Stack & conventions (match the existing student app):** NativeWind v4 + React Native Reusables, the token system (`useThemeColors`, per-tenant theming), `BsDate` for any dates, `NpText` for Devanagari. Match the visual language already in the app — clean light cards, subject-color accent chips (as on Timetable), the school-logo header. Reuse the existing loading skeleton / `ErrorState`+retry / `EmptyState` patterns.

---

## Placement

The student bottom bar already has 5 tabs (Home, Attendance, Routine, Notices, Profile) — don't add a 6th. Add a **"Results" card to Home → "Quick access"** (alongside Attendance / Routine / Notices) that navigates to an **off-tab Results screen**. (Same pattern the teacher app uses for off-tab screens.)

## Data shape to mock (match for clean wiring)

The report-card endpoint returns `{ student, examResults[], annualResult }` (confirmed via the parent report-card in M4 — example: "First Terminal · GPA 2.8 · grade B · rank 4 · Mathematics 75/100 B+"). Mock it as:

- `student`: name, grade, section, roll, admission no.
- `examResults[]`: one per exam term — `{ examName, gpa, grade, rank, subjects[] }`, where each `subject` = `{ name, theory, practical, total, grade }` (some exams are theory-only — practical may be null).
- `annualResult`: aggregate `{ gpa, grade, ... }` (may be null until year-end).

The wiring session will confirm the exact `/students/me/results` vs `/me/report-card` field names; build to this shape and they'll reconcile.

## Layout

- **Header:** school logo + "Results", student name · grade/section beneath (use the deduped `Grade N · Section X` form — no "Class Grade").
- **Term selector:** if more than one exam term exists, a segmented control or pill row to switch term; default to the most recent. If only one, no selector.
- **Summary card** for the selected term: GPA, overall grade, rank, prominent and readable (proper contrast — this is the headline number).
- **Per-subject list:** subject name (subject-color accent chip), theory / practical / total, and grade. For theory-only subjects, show total only — don't render an empty practical cell awkwardly.
- **Annual result** section if `annualResult` is present.

## States (all required)

- **Loading:** skeleton matching the card layout.
- **Error:** `ErrorState` + retry.
- **Empty:** **important** — results are often not published yet. A clean "No results published yet" state, not a blank screen or zeros.

## Avoid the defects M3.1/R2 already fixed

No "Class Grade" prefix; no raw `Date` strings; legible contrast on the summary numbers and subject rows (don't repeat the faint-grey legend/title problem). Route all colors through the token system.

## Out of scope

No live data, no API calls, no backend. Mock data only. No changes to other screens beyond adding the Home "Quick access" entry point.
