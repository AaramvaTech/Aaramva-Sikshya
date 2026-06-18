# Session 21 (Backend) — Student Self-Service API

**Scope:** Make student-owned data safely reachable by a logged-in `STUDENT`, to power the mobile dashboard + attendance screens. Backend only; mobile screens are a separate build (Session 21 — Mobile).
**Modules touched:** Student, Academic (timetable), Attendance.
**Trigger:** Audit verdict C — no `User → Student` link exists.
**Out of scope:** results, notices, library (trimmed from this session); any frontend.

---

## The one rule everything obeys

Every `/students/me/...` endpoint resolves the student **from the token**:
`token.userId → students.user_id → student row`.
A `studentId` is **never** read from a URL param, query string, or body on these routes. There is no route where a student names which student they are. This is the whole reason the session exists — the existing staff endpoints trust a caller-supplied `studentId`, which is correct for staff and catastrophic for students.

---

## Part A — Student ↔ User linkage (prerequisite)

Mirrors the Session 19 guardian-account pattern exactly. Do not invent a new shape; copy `createGuardianAccount` and adapt.

### A.1 Migration

```sql
ALTER TABLE students ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX students_user_id_key ON students(user_id) WHERE user_id IS NOT NULL;
```

- Nullable: the vast majority of students never get a login (young kids; account is opt-in per school).
- **Unique where not null** — unlike `guardians.user_id` which is a non-unique index (one parent → many children). A student maps to exactly one login and a login to exactly one student. This asymmetry is intentional; note it in `CLAUDE.md`.
- Apply across all tenant schemas using the existing Session 19 migration mechanism.

### A.2 `POST /api/v1/students/:id/account` (new, admin-side)

Roles: `SCHOOL_OWNER`, `PRINCIPAL`, `ACADEMIC_COORDINATOR`.

**Student login identity — decision baked in:** students authenticate with **email + password**, same as every other user; the auth surface does not change. School staff sets the email at account creation. Where a student has no real email (common for younger students), staff supplies a school-issued or synthetic address (e.g. `2082-0043@sunrise-ktm.local`). If you ever want true username-based student login, that's a separate auth-module change — explicitly not in this session.

**Body:** `{ "email": "...", "password": "..." }`

**Behavior:**
- Student already has `user_id` → `409 Conflict`.
- Email already belongs to an existing user → `409` (do not silently link; a student is 1:1, so reusing an account is almost always an error worth surfacing).
- Otherwise → create `users` row with role `STUDENT`, set `students.user_id`, return identity (not the password back).

**Response:** `{ success: true, data: { userId, studentId, email, linked: true } }`

---

## Part B — Student self-service endpoints

All: role `STUDENT` only. All resolve the student from the token per the rule above. If `token.userId` has no linked student row → `403` with a generic message ("No student record linked to this account"), never a 500.

### B.1 `GET /api/v1/students/me`

Own profile + current placement. Used for the dashboard header and as the source of `sectionId` for other calls (resolved server-side, never returned for the client to pass back).

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "admissionNumber": "2082-0043",
    "firstName": "Aarav",
    "lastName": "Shrestha",
    "photoUrl": null,
    "currentEnrollment": {
      "className": "Class 8",
      "sectionName": "B",
      "rollNumber": 12,
      "academicYearId": "uuid",
      "academicYearName": "2082"
    }
  }
}
```

`currentEnrollment` is `null` if the student has no enrollment in the current academic year. Flatten to names (same convention the web enrollment fix established).

### B.2 `GET /api/v1/students/me/timetable/today`

Derives the student's `sectionId` server-side, calls the existing `getSectionTimetable` logic, returns only today's periods.

**"Today" is computed in Nepal time (Asia/Kathmandu, UTC+05:45), not server UTC.** A student opening the app at 11pm must see the correct local day. Compute `day_of_week` (0 = Sunday, matching the existing `timetable_slots` convention) from the Nepal-local date.

**Nepal school week is Sunday–Friday; Saturday (`day_of_week = 6`) is the weekend.** On Saturday — or any day with no slots — return an empty array with a flag, not an error.

```json
{
  "success": true,
  "data": {
    "dayOfWeek": 0,
    "dateAd": "2026-06-14",
    "isSchoolDay": true,
    "periods": [
      {
        "slotId": "uuid",
        "periodNumber": 1,
        "startTime": "10:00",
        "endTime": "10:45",
        "subject": { "id": "uuid", "name": "Mathematics", "code": "MATH" },
        "teacher": { "id": "uuid", "fullName": "Sita Rai" },
        "room": "201"
      }
    ]
  }
}
```

Saturday / no enrollment: `{ dayOfWeek, dateAd, isSchoolDay: false, periods: [] }`.

### B.3 `GET /api/v1/students/me/attendance/summary?academicYearId=`

Wraps the existing `getStudentSummary()` with `studentId` pinned to the token.

**`academicYearId` is optional and defaults server-side to the current academic year.** A student should never have to know or pass an academic-year UUID; the mobile client calls this with no params for the common case.

```json
{
  "success": true,
  "data": {
    "academicYearId": "uuid",
    "academicYearName": "2082",
    "totalWorkingDays": 142,
    "present": 130,
    "absent": 6,
    "late": 4,
    "leave": 2,
    "attendancePercent": 94.4,
    "recentHistory": [
      { "dateAd": "2026-06-12", "status": "PRESENT" }
    ]
  }
}
```

Keep the existing computation (`attendancePercent = (present + late) / totalWorkingDays × 100`). Return `recentHistory` dates as **AD ISO**; the mobile app converts to BS via `packages/bs-calendar` at display (consistent with the store-AD/display-BS convention). If the existing service currently emits a `bs` field, you may drop it from this endpoint's mapping — AD is the source of truth.

### B.4 `GET /api/v1/students/me/attendance/history?fromDate=&toDate=&page=&limit=`

Wraps the existing `getByQuery()` with `studentId` pinned to the token. Paginated (powers the calendar/list screen). Date range optional; default to the current academic year's span if omitted.

Paginated response shape (`data.data.data` extraction on the client, per convention):

```json
{
  "success": true,
  "data": {
    "data": [
      { "dateAd": "2026-06-12", "status": "PRESENT", "remarks": null }
    ],
    "meta": { "page": 1, "limit": 31, "total": 142 }
  }
}
```

Default `limit` of 31 fits one BS month comfortably for a month-at-a-time calendar.

---

## Part C — Security fix: leave endpoint IDOR

`POST /api/v1/attendance/leave` currently inserts the body's `studentId` directly; a `STUDENT` caller can file leave for anyone. Fix:

- When `role === STUDENT`: **ignore any `studentId` in the body** and derive it from `token.userId → students.user_id`. If no linked student → `403`.
- When `role === PARENT`: derive the allowed student set from `guardians.user_id = token.userId` (Session 19 linkage) and **reject** a body `studentId` that isn't one of the caller's children → `403`.
- Staff roles (`TEACHER` and above): unchanged — they legitimately file on behalf of any student via body `studentId`.

This is a real, currently-live vulnerability, not a mobile concern. Treat it as a security fix with its own tests regardless of the rest of the session.

---

## Nepal-specific notes

- All API dates are **AD ISO**; BS conversion happens on the mobile client.
- "Today" and any day-of-week logic use **Asia/Kathmandu (UTC+05:45)**.
- School week **Sunday–Friday**; Saturday is the weekend (`isSchoolDay: false`).

---

## Test plan (unit, matching existing patterns)

**Linkage / account (Part A):**
1. Create account for unlinked student → user with role STUDENT created, `user_id` set
2. Create account when student already linked → 409
3. Create account with an email already in use → 409
4. Unique constraint: a second student cannot take a `user_id` already used

**Self-service scoping (Part B) — the security-critical cases:**
5. `GET /students/me` returns the caller's own row (token-resolved)
6. Student whose `user_id` links to student A cannot retrieve student B's data on ANY `/me` route (there is no param to even attempt it — assert the routes expose no studentId input)
7. Authenticated user with no linked student → 403 (not 500) on every `/me` route
8. Non-STUDENT role (TEACHER) hitting `/students/me/*` → 403
9. `timetable/today` on a Saturday → `isSchoolDay: false`, empty periods
10. `timetable/today` day-of-week computed in Kathmandu time (test around the UTC midnight boundary, e.g. 23:30 NPT)
11. `attendance/summary` with no `academicYearId` → defaults to current year
12. `attendance/history` pagination + date-range filter pinned to caller

**Leave fix (Part C):**
13. STUDENT files leave with a *different* studentId in body → record is created for the CALLER, body value ignored
14. STUDENT with no linked student → 403
15. PARENT files leave for own child → ok; for a non-child studentId → 403
16. TEACHER files leave for arbitrary student → unchanged, ok (regression)

## Acceptance checklist

- [ ] Migration applied across all tenant schemas; unique-where-not-null verified
- [ ] Parts A, B, C implemented with DTOs + validation
- [ ] No `/students/me/*` route accepts a studentId from param/query/body (audit the signatures)
- [ ] "Today" verified correct across the Kathmandu midnight boundary
- [ ] ~16 new/changed unit tests passing; existing suite still green
- [ ] `CLAUDE.md` updated: `Student.userId` (unique, vs guardian non-unique), the `/students/me` token-scoping rule, the leave IDOR fix
- [ ] `LEARNING-GUIDE.md`: why staff endpoints take a studentId but student endpoints must not (IDOR explained in plain language), and why "today" must be timezone-aware
```
