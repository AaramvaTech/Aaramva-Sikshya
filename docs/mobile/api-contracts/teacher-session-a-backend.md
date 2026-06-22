# Teacher Session A — Backend: self-scoped endpoints + write accountability
# Aaramva Shikshya
# (Renumber the filename to fit your docs/api-contracts/ sequence, e.g. 26-teacher-backend.md)

## Prerequisites
- All prior backend + mobile sessions complete; full suite green (239/239 at last check).
- `staff_profiles.user_id` exists (non-nullable FK to `users.id`) — confirmed by audit. No migration needed for linkage.
- Mobile app already has multi-session SecureStore, parent + student screens, and the `X-Client-Type: mobile` refresh-token pattern.

## Goal
Make the backend ready for the teacher mobile app. A logged-in TEACHER currently
cannot resolve "my" anything (timetable requires passing your own id as a param;
"my sections", self-attendance, and self-profile don't exist). This session adds
the self-scoped read endpoints the teacher screens need, and adds **write
accountability** to attendance marking and marks entry.

This session adds NO new screens. It is backend + tests only.

---

## CRITICAL — the authorization policy (decided: SOFT-SCOPE)

Write operations (`bulkMark`, `bulkEnterMarks`) are currently role-only
(`@Roles(TEACHER_AND_ABOVE)`) with NO check that the teacher is assigned to the
section/subject. We are deliberately KEEPING that openness, because substitute
and cover teaching is normal in Nepali schools and hard-blocking would break real
workflows.

What changes is accountability, not permission:
- Every attendance mark records `marked_by_user_id` = the caller (from token).
- Every marks entry records `entered_by_user_id` = the caller (from token).
- A teacher writing to a section/subject they are NOT associated with is ALLOWED
  and succeeds — it is simply recorded. Do NOT throw 403 for cross-section writes.

The UI (Session B) will *default* to the teacher's own sections to prevent
accidental mis-marking; the backend stays permissive. So this session also needs
a "my sections" resolver so the UI knows what to default to.

---

## Part 1 — Self-scoped read endpoints

All endpoints below derive the teacher's identity from the JWT (`user.userId`)
and take NO user/teacher id as a parameter. Role: `TEACHER_AND_ABOVE`.

### 1.1 `GET /api/v1/timetable/my`
Returns the calling teacher's weekly timetable slots.

FIRST verify what `timetable_slots.teacher_id` references:
- If it stores `users.id` → query `WHERE teacher_id = $1::uuid` with `user.userId`.
- If it stores `staff_profiles.id` → resolve `staff_profiles.id` from
  `WHERE user_id = $1::uuid` first, then query slots.
Implement `/timetable/my` to match whatever the column actually is. Do not assume.

The existing `/timetable/teacher/:teacherId` stays for admin use; `/my` is the
self-scoped wrapper.

### 1.2 `GET /api/v1/timetable/my/sections`
Returns the DISTINCT set of sections the teacher is associated with, as the union of:
- sections where `sections.class_teacher_id` = this teacher, AND
- sections that appear in this teacher's `timetable_slots`.
De-duplicate by section id. This powers the Session B "my sections" UI default.
Each row: `{ sectionId, sectionName, className, classId }`.

### 1.3 `GET /api/v1/attendance/staff/my/summary`
The teacher's OWN staff-attendance summary. Resolves `userId` from token.
Mirror the shape of the existing `PRINCIPAL_AND_ABOVE` summary endpoint, but
self-scoped and available to `TEACHER_AND_ABOVE`. No `userId` param accepted.

### 1.4 `GET /api/v1/attendance/staff/my`
The teacher's OWN staff-attendance history (date-range filterable via query, but
never another user's). Resolves `userId` from token.

### 1.5 `GET /api/v1/hr/staff/me`
The teacher's OWN staff profile (so the app's profile screen doesn't need to know
`staff_profiles.id`). Resolves `staff_profiles WHERE user_id = token`.

---

## Part 2 — Write accountability (migrations + service changes)

### 2.1 Migration: add marker columns
- `student_attendance.marked_by_user_id` — UUID, NULLABLE (existing rows have no
  marker), FK to `users(id)`.
- exam marks table (the one `bulkEnterMarks` writes): `entered_by_user_id` — UUID,
  NULLABLE, FK to `users(id)`.
Keep both nullable; do not backfill.

### 2.2 `bulkMark` change
Set `marked_by_user_id` = `user.userId` on every inserted/updated attendance row.
This adds a column to the INSERT — the existing `bulkMark` spec mocks and
assertions WILL need updating again (same class of stale-mock issue fixed last
session: the mocked `$queryRawUnsafe` sequence and the asserted row shape both
change). Update them and re-run.

### 2.3 `bulkEnterMarks` change
Set `entered_by_user_id` = `user.userId` on every inserted/updated marks row.
Update its spec accordingly.

### 2.4 Do NOT add any 403 for cross-section/cross-subject writes.
Soft-scope means permissive + recorded. The only new behavior is the marker column.

---

## Tests (all must pass; full suite green before session is done)

Self-scoped reads:
- `/timetable/my` resolves from token, returns only the caller's slots, accepts no id param.
- `/timetable/my/sections` returns the de-duplicated union (class-teacher ∪ timetable); a teacher with one homeroom section + two taught sections sees exactly three.
- `/attendance/staff/my/summary` and `/attendance/staff/my` return only the caller's records and accept no `userId`.
- `/hr/staff/me` returns the caller's profile, resolved by `user_id`.

Write accountability:
- `bulkMark` persists `marked_by_user_id` = caller for every row.
- `bulkEnterMarks` persists `entered_by_user_id` = caller for every row.

Soft-scope policy (documents the decision in code):
- A TEACHER who is NOT the class teacher and has NO timetable slot for a section
  CAN still `bulkMark` that section — assert it SUCCEEDS (not 403) and that
  `marked_by_user_id` is recorded. This test exists to lock the policy so a future
  refactor can't silently turn it into a block.

---

## Conventions (unchanged — confirm they hold)
- Dates stored AD, returned AD; mobile renders BS. "Today" = Asia/Kathmandu.
- Standard response shape `{ success, data, meta }`.
- Soft deletes via `deletedAt`; no hard deletes.
- Run the FULL backend suite at session end. The session is not done until green.
  (Add this as a session-end ritual in CLAUDE.md if not already there.)

---

## Out of scope for Session A (goes in Session B — screens)
- Teacher home/profile, timetable (today + weekly), mark-attendance UI (defaulting
  to my sections), marks-entry UI, my-attendance view, leave application
  (`/hr/leave/my` already exists and works).
