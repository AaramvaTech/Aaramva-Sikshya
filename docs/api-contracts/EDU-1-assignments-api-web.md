# EDU-1 — Assignments & Homework: API + Web

**Save location:** `docs/api-contracts/EDU-1-assignments-api-web.md`
**Scope:** apps/api + apps/web (teacher/admin management). Mobile (student submit, parent view, teacher on-the-go) is EDU-2. Phase B's first module — the most-requested missing feature category.
**Baseline:** 450 api tests, all-green on main. Uses FILE-1 storage (attachments) and PUSH-1 events (notifications).

---

## Domain design (fixed)
- **assignments** (tenant migration `0007`, runner, canary-first): id, academic_year, class_id, section_id (nullable = whole class), subject_id, teacher (created_by user), title, description, due_date DATE, attachment file keys (JSONB array of FILE-1 keys), status (DRAFT/PUBLISHED/CLOSED), published_at, soft-delete `deletedAt`, timestamps.
- **assignment_submissions**: id, assignment_id FK, student_id FK, text_answer, file key (nullable), submitted_at, status (SUBMITTED/LATE/REVIEWED), marks NUMERIC(5,2) nullable, feedback text, reviewed_by/at. Unique (assignment_id, student_id) — resubmission updates the row, history not kept this session.
- **Late** = submitted_at after due_date end-of-day **Asia/Kathmandu** (the platform's date discipline — no toISOString date math; reuse the established helpers).
- **Scoping policy, matching the platform's existing philosophy:** teacher writes are soft-scoped with accountability (any teacher may post to any class — cover-teacher reality — `created_by` stamped), student/parent reads-writes are hard-scoped (student submits only to own enrolled class's assignments; parent sees only own children's). 403 probes required.
- **Events:** `assignment.published` (on the DRAFT→PUBLISHED edge only, PUSH-1 rule) → in-app row + dormant push to that class/section's students + their guardians, route `assignments`. `submission.reviewed` → the student + guardians. No event on DRAFT or edit.
- **FILE-1 kinds:** add `assignment-attachment` (teacher upload, PDFs/images/docs, ~10MB) and `submission-file` (student upload — note: student upload roles are new to the kind-policy table; scoped presign must verify the student is targeted by that assignment before granting).

## Step 0 — Read and report
1. Confirm subjects/timetable linkage: how a teacher's subjects and a section's subjects are modeled (assignments reference subject_id — verify the natural FK targets and what the web UI can use to filter selects).
2. The enrollment model: how "students of section X" resolves (audience fan-out + submit-eligibility both hang on it).
3. PUSH-1's listener/audience utilities — reuse, don't duplicate.
4. FILE-1's kind-policy table shape for adding the two kinds cleanly.

## Tasks
T1 — Migration 0007 (both tables), canary → all, ledger read-backs.
T2 — API: teacher/admin CRUD (`POST/GET/PATCH /assignments`, publish endpoint firing the event, close endpoint), attachment presign integration; student endpoints under the /me discipline (`GET /assignments/me`, `POST /assignments/:id/submissions` with eligibility check + late computation, `GET .../submissions/me`); parent (`GET /assignments/my-children`); review endpoints (marks+feedback, REVIEWED transition firing its event). DTO validation throughout; standard `{success,data,meta}`.
T3 — Web (teacher/admin): assignments list (filter class/section/subject/status), create/edit with FILE-1 attachment upload, publish/close actions, submissions view per assignment (who submitted/late/missing — the "missing" list is the teacher's real need: enrolled minus submitted), review form (marks/feedback). Role access per ROUTE_ACCESS conventions + backend parity row cited.
T4 — Tests: eligibility (wrong-section student 403), late boundary (Kathmandu end-of-day, both sides), unique-resubmission, publish-edge event once, review event, missing-list correctness. Suite ≥450.

## Verification — raw
1. Runner 0007 canary→all with read-backs.
2. Full teacher round-trip live: create DRAFT with real attachment (FILE-1 PUT) → publish → event → in-app notification rows for exactly that section's students+guardians (counts + a scoping read-back: other section = 0).
3. Student submit live (via API): eligible 201 with LATE/SUBMITTED correctness proven at the due-date boundary (craft due yesterday + due tomorrow); ineligible student 403; resubmit updates not duplicates (row count).
4. Parent read: own children 200, cross-family probe 403/404.
5. Review live: marks+feedback → student notification row.
6. Missing-list proof: seeded section of N, submit as k → list shows N−k names.
7. Web parity table row(s) per SEC-2 convention. Suite ≥450 (+new), push, all-green, PR per standing rule. All crafted rows cleaned with read-backs.

## Out of scope
EDU-2 (mobile), grading-scale integration with exam results, plagiarism/similarity, submission history/versions, study-materials library (own session), comments/threads.
