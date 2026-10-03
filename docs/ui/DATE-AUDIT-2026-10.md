# Date display + input audit (apps/web) — 2026-10-03

Read-only audit; no behaviour changed by this document. Rule being audited against (CLAUDE.md): store AD, show BS
(`<BsDate>`), convert only at the display/input edge; BS primary with AD as a small secondary.

## 1. Inventory

**Display**
- `<BsDate>` — used in 57 files; shows "BS" tag and optional `(AD)`. Correct and consistent. Caveat: it does
  `adToBs(new Date(str))`; fine for `YYYY-MM-DD` in Nepal (UTC midnight = 05:45 local, same day) but a full timestamp is
  interpreted in the browser's zone.
- Raw `toLocaleDateString()` / `toLocaleString()` (browser locale, AD, format varies by machine):
  - `finance/bill/payments/page.tsx:164` (receivedDate), `finance/bill/runs/page.tsx:104` (createdAt),
    `finance/bill/corrections/page.tsx:131` (requestedAt)
  - super-admin: `audit/page.tsx:217`, `schools/page.tsx:234,385`, `schools/[id]/page.tsx:351,359`, `dashboard/page.tsx:156`
    (platform console — AD is acceptable there; low priority)
- Timestamps cut to a date with `.slice(0,10)` and fed to `<BsDate>` (UTC date, wrong for events 00:00–05:45 Nepal):
  `finance/bill/reports/page.tsx:504, 715, 780` (appliedAt, shift openedAt).
- `Rs.` amounts use three different locales (`en-IN`, `en-NP`, `en-US`) — out of scope for dates, noted.

**Input**
- `<BsDateInput>` (3 dropdowns: year/month/day, emits AD string) — 19 call sites: reports, bill reports, payments/new,
  bill catalog, bulk-assign, create-bill-run, concessions, overrides, transport, structure dialog, assignment panel,
  students new/edit (DOB), holidays, assignments (admin + teacher), attendance reports, student portal attendance.
  Min ~304px wide (the overlap in the New Bill Run dialog); 3 clicks per date.
- Native `<input type="date">` (AD only, browser-locale format, no BS at all) — ~30 inputs in 17 files:
  academic/page, academic/years, academic/holidays, hr/staff (join, DOB), hr/leave (4), library/issues (3),
  finance/bill/payments (from/to filters), exams/schedule (2), communication/notices, onboarding (3 incl. staff-step),
  portal parent/attendance (2), portal teacher/leave (2).
- So the same school sees BS pickers in some forms and AD pickers in others.

**"Today" computed as UTC date** (`new Date().toISOString().split('T')[0]`) — between 00:00 and 05:45 Nepal this is
yesterday: `attendance/mark`, `attendance/page`, `attendance/reports`, `finance/bill/catalog:645`,
`finance/bill/payments/new`, `students/new` (admission date), `onboarding/staff-step`, `portal/teacher/attendance`
(+ `lib/export.ts` filename, harmless). Same bug class as FIX-2.

## 2. API contract (unchanged by this plan)
All endpoints take/return AD `YYYY-MM-DD` (reports: `from`/`to`/`date`/`asOf`; bad dates 400 `INVALID_DATE`). The UI layer is
the only place BS exists. Timestamps are ISO UTC.

## 3. Proposed branches (each small, shippable alone)
1. **fix/nepal-today** — one `nepalTodayAd()` (+ `adDateOfTimestamp()` for timestamps → Nepal calendar date) in
   `lib/`, replace the 8 UTC-today sites and the 3 `.slice(0,10)` sites. No UI change except correct after-midnight behaviour.
2. **feat/date-field** — ONE shared `DateField`: a single typed BS input (`2083-06-17`, with AD shown beneath/inside as the
   secondary), same contract as `BsDateInput` (AD string in/out), compact (one control, ~160px), validation message.
   Reimplement `BsDateInput` as a thin wrapper so the 19 call sites change nothing.
3. **fix/display-dates** — payments/runs/corrections list columns → `<BsDate>` (BS primary, AD secondary on hover/small).
4. **feat/native-dates-to-datefield** — replace the ~30 native `type="date"` inputs module by module (finance filters first,
   then academic, HR, library, exams, notices, onboarding, portals). Mechanical; forms keep their AD string state.
5. Skip: super-admin console dates (platform operator view stays AD).

## 4. Decisions needed from the school-facing side
- Typed BS input vs a calendar popover: plan above is typed input first (fast for accountants); a popover calendar can be
  added to `DateField` later without touching callers.
- Past ~BS 2099 the calendar table ends; `DateField` should reject rather than show nonsense (ties to the `adToBs` ticket).
