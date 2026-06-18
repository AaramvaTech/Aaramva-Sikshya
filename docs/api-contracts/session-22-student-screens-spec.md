# Session 22 — Student Mobile Screens (Spec)

**Type:** Mobile (frontend) — `apps/mobile/`, `(student)` route group.
**Status:** Not built.
**Depends on:** Session 20 (scaffold/auth) + Session 21 backend (student self-service endpoints).
**Scope:** Two read-only screens — Dashboard and Attendance. No writes, no leave UI.

---

## Endpoints consumed

All role `STUDENT`, token-scoped — the client never sends a `studentId`.

| Endpoint | Extraction | Returns |
|---|---|---|
| `GET /students/me` | `data.data` | profile + `currentEnrollment` (nullable) |
| `GET /students/me/timetable/today` | `data.data` | `{ dayOfWeek, dateAd, isSchoolDay, periods[] }` |
| `GET /students/me/attendance/summary` (no params → current year) | `data.data` | counts + `attendancePercent` + `recentHistory[]` |
| `GET /students/me/attendance/history?fromDate=&toDate=&page=&limit=` | `data.data.data` + `data.data.meta` | paginated records `{ dateAd, status, remarks }` |

> The simple-vs-paginated extraction mismatch (`data.data` vs `data.data.data`) is the known web bug class. Hooks must extract per the table above.

## Shared building blocks

- **`lib/attendance.ts`** — one exported map: `PRESENT | ABSENT | LATE | LEAVE` → `{ label, color, shortCode }`. Imported by both screens so summary and calendar colors never diverge.
- **Query hooks** (`lib/queries/` or `hooks/`, mirroring web): `useStudentProfile`, `useTodayTimetable`, `useAttendanceSummary`, `useAttendanceHistory({ fromDate, toDate })`. `enabled` only when `status === 'authed'`.
- Reuse existing `lib/api.ts`, `lib/queryClient.ts`, `store/auth.ts`, `components/BsDate.tsx`. No second axios instance.

## Screen 1 — Dashboard (`app/(student)/index.tsx`)

- **Profile header:** name, `Class • Section • Roll` (from `currentEnrollment`; "Not enrolled" if null), today's BS date via `todayBs` (Nepal time).
- **Attendance summary card:** `attendancePercent` prominent; present/absent/late/leave counts using the shared color map.
- **Today's timetable:** ordered periods (time, subject, teacher, room). `isSchoolDay === false` or empty `periods` → "No classes today" empty state.
- Pull-to-refresh (both queries); loading skeletons; error + retry.

## Screen 2 — Attendance (`app/(student)/attendance.tsx`)

- **BS-month calendar grid:** Sunday-first columns (Nepal week); Saturday styled as weekend. Grid derived from `bsToAd` (see calendar rules). Day 1 placed in correct weekday column via leading blanks.
- **Data binding:** for the visible BS month, compute AD start/end via `bsToAd`, query history for that range (`limit` ~32), map each `dateAd` onto its cell, color by status map; days with no record render neutral.
- **Month navigation:** prev/next BS month, default current (`todayBs`), handles BS-year boundary (Chaitra↔Baishakh).
- **Legend** (color→status) + per-month mini-summary strip. Optional: tap a day → status + remarks.
- Pull-to-refresh; loading/empty/error states.

## BS calendar rules (the one non-trivial part)

- BS months are 29–32 days, defined by the package's lookup table. **Do not hard-code month lengths.**
- If `packages/bs-calendar` exposes no days-in-month helper: `daysInMonth = adDiff(bsToAd(y, m, 1), bsToAd(y, m+1, 1))`, with year rollover when `m === 12`.
- Day-1 weekday = weekday of `bsToAd(y, m, 1)` in Nepal time → number of leading blank cells.
- Viewing attendance "by BS month" requires converting the BS month bounds to an AD range before querying, because the API stores/filters in AD. Map results back onto BS cells for display. (Same store-AD/display-BS principle, applied to a range.)

## Tabs — `app/(student)/_layout.tsx`

Replace placeholders with two tabs: **Dashboard** (`index`) and **Attendance** (`attendance`), each iconed. No other tabs.

## Constraints

- Read-only; no leave/ write actions (deferred though backend supports it).
- All dates AD from API → BS for display via the shared package; "today" is Nepal time everywhere.
- TypeScript strict; no `any` except narrowed parse boundaries.
- Do not touch `apps/api/` or `apps/web/`; no new native deps without `npx expo install` + justification.

## Acceptance

- Dashboard renders profile + summary + today's periods against the running API for a linked student.
- Saturday / `isSchoolDay:false` → weekend empty state.
- Calendar: current BS month renders with day 1 in correct column; prev/next navigates; a Chaitra (year-boundary) month renders correctly; cell colors match the shared map.
- Pull-to-refresh on both screens; `npx tsc --noEmit` clean.

## Reused downstream

Parent screens (next) reuse the calendar component, `lib/attendance.ts` status map, and the query-hook pattern established here.
