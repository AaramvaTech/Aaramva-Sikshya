# SESSION-M5 — Teacher App Verification

**Type:** Mobile verification pass on the **feature-complete** Teacher app. Confirm every screen is wired to live endpoints, reads render, the teacher **writes** persist and record accountability, **soft-scope** and **HR self-scope** behave, and the M3.1 shared fixes are present (teacher screens predate them). **No new screens. No redesign. No backend changes** (halt and report if an endpoint is missing/broken).

**Source of truth:**
- Audit: teacher **soft-scope** confirmed (a teacher may act on any section; writes stamp the actor); R1 **BUG-2** locked HR reads (leave-balance / salary-history) to self-or-admin.
- Teacher sessions A–D: feature-complete — Home, Timetable, Mark Attendance, My Attendance, Leave, Marks Entry.
- M3.1 / M4 shared helpers: `lib/time.ts` (`formatPeriodRange` / `formatPeriodTime12`), deduped room/class labels, `BsDate`, `NpText`, `useThemeColors`.

**Stack (mobile):** Expo SDK 54, expo-router, NativeWind v4, TanStack Query, Zustand, Axios, expo-secure-store, MMKV. Auth = response-body tokens + `X-Client-Type: mobile` + `X-Tenant-Slug`.

---

## Hard rules

1. **Step 0 gate + state inventory first.** Enumerate teacher screens, map to endpoints, confirm WORKING. Halt and report if any is MISSING/BROKEN.
2. **No backend changes.** Halt and report if an endpoint is broken/missing.
3. **No new screens, no redesign.**
4. **Soft-scope is intentional.** A teacher may mark attendance / enter marks for **any** section. Every write must record `marked_by_user_id` / `entered_by_user_id` from the token. **Verify the accountability stamp; do not add restrictions.**
5. **HR self-scope (post-R1).** A teacher reads their **own** leave-balance / salary only; a peer's → 403; admin → any. Verify the teacher's own screens still work and never expose a peer.
6. **Apply shared fixes if present.** The teacher screens were built before M3.1, so they may carry the same defects — raw `Thu Jan 01 1970 …` period times, "Room Room", "Class Grade", low-contrast cards. If present, fix by **reusing the shared helpers/components** (`lib/time.ts`, deduped room/class, `useThemeColors`). This is consistency reuse, **not** a redesign or new work. If absent, say so.
7. **Writes.** Verify attendance-marking and marks-entry persist and stamp the actor; verify the marks **XOR validation** (`theoryFilled !== practicalFilled` blocks a partial split entry).
8. **Response-shape discipline**; loading / error / empty + pull-to-refresh on reads.
9. **BS dates via `BsDate`, verified against hamropatro.**

---

## Step 0 — Gate + inventory (no changes yet)

- Enumerate the teacher screens/routes (`apps/mobile/app/(teacher)/` tree). Expected: Home, Timetable, Mark Attendance, My Attendance, Leave, Marks Entry — confirm.
- Map each to its self-scoped / section endpoint(s). Table:

  | Screen | Endpoint(s) | Method | Response shape | Audit status |

- Confirm a demo teacher login exists (seed teacher creds). Record them.
- **GATE:** all WORKING → proceed to verify/fix. Any MISSING/BROKEN → STOP, report, recommend a backend session, change nothing.

---

## Verification tasks (per screen)

- **Reads** (Home, Timetable, My Attendance, Leave balance): real data renders, correct shape, loading / error / empty + refresh. Times via `lib/time.ts` (no 1970 string); rooms/class deduped.
- **Mark Attendance (WRITE):** pick a section (any — soft-scope), mark statuses, submit → persists; confirm `marked_by_user_id` = demo teacher. Then mark a **second, non-assigned** section → also allowed and stamped (soft-scope is intentional).
- **Marks Entry (WRITE):** load students and marks separately, merged at display; enter theory/practical; confirm the **XOR validation rejects a partial split**; submit a valid entry → persists; confirm `entered_by_user_id` stamped.
- **Leave (self):** file own leave / view own balance → works; confirm a **peer's** balance → 403 (R1 HR self-scope holds).
- Where the pre-M3.1 defects appear, apply the shared fix and record before→after.

---

## Not in scope

- No new screens, no redesign.
- No backend changes (halt and report if an endpoint is missing/broken).
- No student or parent work.
- Do **not** fix the D1 seed-year staleness or the backend time serialization here.

---

## Verification output

- `mobile tsc --noEmit` → exit 0.
- Step 0 table.
- Per read screen: checklist (data / loading / error / empty / refresh).
- **Write proofs (raw):** attendance-mark persists + `marked_by` stamped; marks-entry persists + `entered_by` stamped + XOR rejects a partial split.
- **Soft-scope proof:** teacher marks a non-assigned section → allowed + stamped.
- **HR self-scope proof:** own balance 200, peer 403.
- **Shared-fix before→after** if any M3.1-class defects were present (1970 time, "Room Room", etc.), or "none present."
- BS date vs hamropatro on ≥1 visible date.
- Verdict per screen: verified / fixed / blocked.
