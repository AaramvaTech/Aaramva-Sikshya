# Session 23 — Parent (Guardian) Mobile App

**App:** Aaramva Shikshya · **Surface:** `apps/mobile` (Expo SDK 56, expo-router, RN 0.85, NativeWind v4, TanStack Query v5, Zustand v5)
**Builds on:** Session 22 (student app functional, type-clean, 4 tabs).
**Session number is a suggestion** — renumber to match your build order if needed.

---

## Goal

Add a parent/guardian experience to the mobile app. A guardian logs in and views **their child's** attendance, timetable, exam results, fees, and notices — for one or more children, across one or more schools.

This is a mostly-read surface. The heavy lifting is reuse: the student screens already render this data for "me"; the parent screens render the same data for **a selected child**.

---

## Key decision — Option A: multi-school via account switching

A guardian can have children **in the same school** and **in different schools**. The backend is multi-tenant with per-school schemas, and the app already authenticates **per school** (school-code → login → tenant-scoped session). We are **not** building a global cross-tenant identity.

Instead, model multiple schools like Slack workspaces / Gmail account switching:

- One **session per (school, guardian login)**, stored side by side.
- The user picks the **active school**; its `X-Tenant-Slug` + token are used for all requests.
- **Same-school, multiple kids** is handled inside an active school via a child picker.

Rationale (worth a line in the README): account-switching was chosen over a unified identity layer to avoid refactoring the auth/tenant boundary. A global guardian identity is a deliberate **future** improvement, out of scope here.

---

## Pre-flight — verify ONE backend permission before building any UI

The student screens fetch **self-scoped** data via `/students/me/*` (Session 21, "THE ONE RULE"). A guardian needs to read **a specific child's** data, which is a different authorization.

**Confirmed to exist (from audit):** `GET /students/my-children` (lists a guardian's children), guardian account linkage, `:id/account`.

**Must verify / may need building:** can an authenticated **guardian** read, for a given child ID they are linked to:

- attendance summary + history
- timetable
- exam results / report-card (`examination` module)
- fee invoices + balance (`finance` module)

If those reads are only `/students/me`-scoped today, decide one of:

1. **Guardian-scoped variants** — e.g. `GET /students/:id/attendance-summary` etc., guarded so a guardian may only read children they're linked to (reuse the Session-21 leave-IDOR guard pattern).
2. **Authorization rule on existing `:id` routes** allowing guardian→linked-child access.

Pick the option consistent with "THE ONE RULE." **Do this first** — the screens assume these reads work.

---

## Scope — three new pieces (everything else is reuse)

### 1. Multi-session store + school switcher *(the only genuinely new plumbing)*

Today the app holds **one** session in `store/auth.ts` + `lib/secureStore.ts` and `lib/api.ts` reads a single `X-Tenant-Slug` (Zustand → SecureStore fallback).

Change to hold **many** sessions and an **active** pointer:

- Store a list of sessions, each: `{ schoolSlug, schoolName, userId, role, tokens }`, plus `activeSessionId`.
- `lib/api.ts` reads `X-Tenant-Slug` + auth token from the **active** session (keep the existing `X-Client-Type: mobile` header, `rawApi` refresh path, and single-flight 401 queue unchanged).
- Adding a school = run the existing school-code → login flow, then **append** the resulting session instead of replacing.
- Switching schools = change `activeSessionId` and invalidate TanStack Query caches so screens refetch under the new tenant.

> ⚠️ Switching active session must clear/invalidate the query cache, or you'll show School A's data under School B's header.

### 2. Parent route group + routing

- `app/_layout.tsx` currently routes STUDENT → `/(student)`. Add a guardian branch → `/(parent)`.
- New group `app/(parent)/` with its own tab layout.
- Login flow is unchanged (school-code → login); only the post-login landing differs by role.

### 3. Child switcher (same-school, multiple kids)

- On entering an active school, call `/students/my-children`.
- Render a picker (header dropdown or top sheet). Persist the selected child ID in parent state.
- All `(parent)` screens read **the selected child's** data via the routes verified in pre-flight.

---

## Screens — reuse map

Each `(parent)` screen mirrors an existing `(student)` screen, swapping "me" for "selected child". Adapt the `useStudentMe.ts` hooks to accept a child ID (or add `useChild*` siblings).

| Parent screen | Reuses from student | Hook (adapt to childId) |
|---|---|---|
| Dashboard | `(student)/index.tsx` | `useStudentProfile` → child profile |
| Attendance (BS calendar) | `(student)/attendance.tsx` | `useAttendanceSummary`, `useAttendanceHistory` |
| Timetable | `(student)/timetable.tsx` | `useMyTimetable` |
| Notices | `(student)/notices.tsx` | `useNotices` |
| **Results** *(new)* | — | `examination` results/report-card |
| **Fees** *(new)* | — | `finance` invoices + balance |

Results and Fees have no student-app precedent; build them fresh against the verified endpoints. Everything above the line is structural reuse.

---

## Conventions — non-negotiable (from CLAUDE.md / repo audit)

- **BS display, AD storage.** Every user-facing date uses `<BsDate>` / `formatBs` from `packages/bs-calendar` — **never** raw `new Date().toLocaleDateString()`. While reusing `notices.tsx`, **fix the existing violation at `notices.tsx:32`** (it currently renders a raw AD date) — same bug will copy into the parent Notices screen otherwise.
- **Response envelope.** All reads come back as `{ success, data, meta }`; `lib/api.ts` already treats `{success:false}` + 2xx as an error — keep that.
- **Headers.** Active session supplies `X-Tenant-Slug`; mobile keeps sending `X-Client-Type: mobile`.
- **Authorization.** Guardian reads of a child's data must be guarded so a guardian can only access children they're linked to (no IDOR — mirror the Session-21 fix).
- **No new BS strings in the DB.** Storage stays AD; conversion is display-only.

---

## Out of scope (explicitly)

- Teacher app (next session; depends on the attendance `bulkMark` tests going green first).
- Option B / unified cross-tenant guardian identity.
- Payment gateway (eSewa/Khalti/ConnectIPS) — deferred.
- Parent **write** actions (applying for leave, replying to notices) — read-only for v1 unless you decide otherwise.

---

## Acceptance criteria

1. `apps/mobile` `tsc --noEmit` exits clean.
2. A guardian can log into two different schools and switch between them; the active school's data shows under the correct school context, with no stale cross-tenant data after switching.
3. Within a school, a guardian with multiple children can switch children; every screen reflects the selected child.
4. Dashboard / Attendance / Timetable / Notices / Results / Fees each render the selected child's real backend data.
5. Every user-facing date renders in BS via `<BsDate>`/`formatBs`, including the fixed `notices.tsx`.
6. Guardian cannot read a child they are not linked to (authorization verified).

---

## Open questions to confirm before/while building

1. **Pre-flight result:** do guardian-scoped child reads exist, or are we adding them? (Blocks screens.)
2. **Notices audience:** the mobile Notices screen reads tenant-wide `GET /communication/notices`, not a student/child-scoped route. For a parent, is tenant-wide acceptable, or should notices be filtered to the child's class/audience? (Pre-existing open item from the audit — decide, don't inherit silently.)
3. **Switcher UX:** combined "school + child" switcher in one control, or school at the account level and child in-screen? (Recommend: school at account/header level, child as an in-screen picker.)
