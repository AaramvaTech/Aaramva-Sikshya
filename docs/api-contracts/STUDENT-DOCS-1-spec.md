# STUDENT-DOCS-1 — Student Document Management

**Status:** Spec, not yet built.
**Trigger:** Student profile Documents tab has been calling backend routes that were
never implemented since the project's earliest commits (`Cannot GET
/api/v1/students/:id/documents`). Not a regression — a genuinely unbuilt feature.

**Pattern to follow:** staff's existing document system (built under FILE-1) already
does exactly this for staff — multiple document kinds, presigned upload via MinIO,
admin-managed. This spec is that same pattern, applied to students.

## Access model (locked)

- **Admin/staff can upload** documents for a student (same role tier that manages
  student records generally — match whatever gates student profile editing today)
- **Student (and presumably parent, via their portal) can view/download only** — no
  self-upload for now
- Multiple document *kinds* per student, same as staff (check staff's existing kind
  list for the pattern — e.g. birth certificate, transfer certificate, photo ID, prior
  school records — actual kind list should match what Nepali schools realistically need
  for a student file, confirm/adjust with real examples before finalizing)

## Phase 1 — Storage policy + backend routes

- Register a student-document storage "kind" in `storage.policy.ts`, mirroring how the
  staff-document kind is defined
- Build the three missing endpoints the frontend already expects:
  - `GET /students/:id/documents` — list
  - `POST /students/:id/documents/presign` — get presigned upload URL
  - `POST /students/:id/documents/confirm` — confirm upload complete, persist metadata
- Role-gate upload (presign/confirm) to admin/staff tier; list/download open to
  admin/staff/parent/student for their own linked student (respecting the same
  guardian-scoping helpers CL just built, if a parent is viewing their child's documents)
- Note the vestigial `students.documents` JSONB column found during the audit — decide
  whether the new feature uses a proper relational table (recommended, matches staff's
  pattern) or that column. Recommend a proper table; the JSONB column is dead weight,
  flag it for cleanup in Phase 3 rather than building on top of it.

**Checkpoint:** live proof — presign a real upload, confirm it, `GET` the list back,
Postgres read-back on wherever the metadata lands. Confirm role-gating: a non-admin
attempting to upload gets rejected.

## Phase 2 — Frontend

- The Documents tab UI likely already has the right shape (per the screenshot, it has
  "Upload Document" button and an empty state) — confirm what's already built vs. what
  needs wiring, since the frontend has apparently been calling real-looking routes this
  whole time
- Document kind selector on upload (matching staff's UI pattern if one exists)
- List view showing uploaded documents with download links

**Checkpoint:** live click-through (or route-check, given no browser automation
available) confirming upload → list → download works end-to-end through the actual UI,
not just the API.

## Phase 3 — Cleanup

- Decide fate of the vestigial `students.documents` JSONB column — if unused after this
  feature ships, flag for removal (soft, in line with this codebase's caution around
  deleting things — confirm nothing reads it before dropping)

## Out of scope

- Student/parent self-upload — explicitly admin-only for now, per the locked decision
- Document expiry/renewal reminders — not asked for, don't build speculatively
