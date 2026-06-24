# SESSION-RS2 — Downloadable PDF Report Card

**Type:** Backend (PDF generation) + mobile (download buttons). Finishes results: students and parents can download their own report card as a PDF — all published terms + the annual summary.

**Source of truth:** RS1 (`getReportCard` is the single shared data source; publish gate + annual GPA now live); M6/M6.1 (student report-card screen); M4 (parent report-card).

**Stack:** NestJS + PostgreSQL; mobile = Expo (expo-file-system + sharing for the download). PDF generated **on demand** (no object storage needed — keeps this independent of the Tier 1 storage migration).

---

## Hard rules

1. **Step 0 read-and-report before editing** — pick the PDF approach and confirm the data source.
2. **Generate the PDF from the same `getReportCard` data** so it matches the on-screen report card exactly. One source of truth.
3. **Respect the publish gate and hard-scope:** the PDF contains only **published** terms; a student gets only their own, a parent only their own child's. Server enforces; prove the 403/own-only.
4. **Devanagari must render** — the classic PDF pitfall. The chosen PDF tool must **embed a Devanagari-capable font** (e.g. Noto Sans Devanagari) or Nepali text comes out as boxes. Verify Devanagari renders before calling it done.
5. **Live-prove** the generated PDF (open it, confirm contents) — not just a 200.

---

## Step 0 — Read and report (no edits)

- Confirm `getReportCard` returns everything the PDF needs (student identity, all published terms with subjects/marks/grades, annual GPA/grade/division). No data gap.
- Choose the server-side PDF approach (a Node PDF lib that embeds custom fonts — there's no PDF lib in deps yet, so this is a new dependency). Confirm it can embed a Devanagari font.
- Confirm where the **Download** button goes: the M6 student report-card screen and the parent report-card screen.

Report the choice + plan, then proceed.

---

## Task 1 — Backend: PDF endpoint (the heavy half)

- Endpoints: student self (e.g. `GET /students/me/report-card/pdf`) and parent-for-child (the existing parent report-card path + `/pdf`). Return `application/pdf`, hard-scoped (self / own-child).
- Layout mirrors the on-screen card: school logo + name header; student name, grade/section, roll, admission no., academic year; **per published term** — subject rows (theory / practical / total / grade), term GPA/grade/rank; then the **annual summary** (final weighted GPA, grade, division). BS dates where shown.
- Embed a Devanagari font so Nepali (school name, subject names) renders.
- If **no terms are published**, return a clean "not available yet" (e.g. 404/409 with a message), not a broken empty PDF.
- **Resumable:** this task is the risky half — if context runs long, stop here with the endpoint proven via curl, and do Task 2 next.

## Task 2 — Mobile: download button (student & parent)

- A **Download report card** button on the M6 student screen and the parent report-card screen.
- Fetch the authed PDF endpoint (send the token), save via `expo-file-system`, open the system share/open sheet. Handle loading (downloading…), error, and the "not published yet" case.
- No redesign — just the button + download flow.

---

## Not in scope

- No Word/.docx (PDF only, per decision).
- No object storage (generate on demand).
- No change to RS1's gate/annual logic or to marks entry.

---

## Verification

- `tsc --noEmit` (api + mobile) clean.
- **PDF contents (raw):** generate for the demo student (with published terms from RS1), **open the file**, confirm: identity header, each published term's marks, the annual summary matching RS1's numbers, and **Devanagari renders** (not boxes). Note the published-vs-unpublished term set matches the gate.
- **Hard-scope (raw):** student requesting another student's PDF → 403; parent requesting a non-child → 403.
- **Gate:** unpublished-only student → "not available yet", not a broken PDF.
- Mobile: confirm the button downloads and opens the file on the student and parent screens.
- Verdict: wired / blocked.
