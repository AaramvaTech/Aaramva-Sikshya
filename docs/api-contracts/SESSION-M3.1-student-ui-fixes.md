# SESSION-M3.1 — Student App UI/UX Fixes

**Type:** Mobile frontend polish/fix. **No backend code changes** (data inconsistencies are *reported*, not fixed here). **No redesign / no IA changes** — fix the specific defects and contrast only; for anything broken, match the patterns the app already gets right (e.g. Home's clean "Today's classes" cards).

**Why this spec exists:** the app was run on a real device and screenshots surfaced rendering/contrast defects across the five student screens (Home, Attendance, Routine, Notices, Profile). You (Claude Code) can't see those screenshots — each defect below is given as **on-screen symptom → likely root cause → desired result** so you can locate and fix it in code.

**Keep token discipline:** `useThemeColors`, `NpText`, `BsDate`. No hardcoded colors.

---

## Hard rules

1. **Step 0 read-and-report before editing** — locate each offending component/render path and report what's actually producing each symptom before changing anything.
2. **No backend changes.** The two data items (D1, D2) are report-only; do not edit services or the seed in this session.
3. **No layout redesign or navigation changes.** Fix the defects; don't restyle screens that are already clean.
4. **Verify-first items (V1, V2):** confirm the real root cause before touching. If the cause is a device overlay or correct data, leave it and say so in the report.
5. **Mobile `tsc --noEmit` clean at the end**, and paste before→after evidence per fix (see Verification).

---

## P1 — Class times render as a raw Date string  (highest priority)

- **Symptom:** on Home → "Today's classes" and on Routine → the left time-rail, every period shows `Thu Jan 01 1970 15:30:00 GMT+0530 (Nepal Time)` instead of a time.
- **Cause:** a time-of-day value (period start/end) is being run through `new Date(...).toString()`. The stored "10:00" is interpreted as 10:00 **UTC** and then shifted by the device offset to 15:30, and the `(Nepal Time)` label is actually India's +05:30 (Nepal is +05:45).
- **Fix:** render a clean **12-hour wall-clock** time, e.g. `10:00 AM`. These are wall-clock period times — format the hour/minute components directly; **do not** pass them through `Date.toString()` and **do not** apply any timezone offset. On the Routine screen show a **start – end** range (e.g. `10:00 – 10:45`). Drop the `(Nepal Time)` / `GMT+0530` text entirely.

## P2 — "Room Room 101" duplicated label

- **Symptom:** every class row shows `Room Room 101`.
- **Cause:** the UI prepends `"Room "` to a value that already contains `"Room 101"`.
- **Fix:** render the room value as-is (or strip the redundant prefix) so it reads `Room 101`. Apply on both Home and Routine.

## P3 — Routine cards look greyed-out / disabled (low contrast)

- **Symptom:** on "Class routine", the period cards have a dark/muted background with washed-out, barely-legible subject title, teacher, and room — they look disabled. Compare to Home's "Today's classes", which renders clean light cards with dark, readable text.
- **Fix:** give the Routine cards a readable **light surface with proper foreground contrast**, matching the Today's-classes cards. Keep the per-subject color (NEP/MATH/SCI) as an **accent chip / left-border only**, not a full dark fill behind light text.

## P4 — Attendance month title + legend are near-invisible

- **Symptom:** the calendar month heading ("Ashadh 2083") and the legend row ("Present / Absent / Late / Leave / Saturday") render in very faint light-grey, barely readable on the white card.
- **Fix:** raise both to proper readable contrast (a normal heading weight/color for the month, legible label color for the legend).

## P5 — "Class Grade 10" redundant wording

- **Symptom:** Home subtitle `Class Grade 10 · Section A`; Profile `Class Grade 10 · A` and header `Class Grade 10A`.
- **Cause:** a `"Class "` prefix is prepended to a class name that is already `"Grade 10"`.
- **Fix:** drop the redundant prefix → `Grade 10 · Section A` and `Grade 10 · A`. Apply wherever the class/section string is composed.

---

## Verify-first (confirm cause before changing)

### V1 — Grey settings-gear circle overlapping content
- **Symptom:** a translucent grey gear circle appears at a fixed screen position on Notices / Routine / Attendance / Profile, overlapping content; on Home it sits neatly in the header.
- **Determine first:** is this **app-rendered** or a **device overlay** (screen-recorder / accessibility floating button)? A button that sits at the same absolute screen position across every screen regardless of layout is almost certainly a device overlay.
  - If **device overlay** → ignore, and say so in the report.
  - If **app element** positioned globally/absolutely → it should appear only in the header where intended; remove/relocate it from the screens where it overlaps content.

### V2 — Attendance calendar day cells not status-colored
- **Symptom:** only today (green outline) and Saturdays (orange) are marked; present/absent/late/leave days are not color-filled per the legend.
- **Determine first:** does the logged-in student have attendance records **within the displayed month** (Ashadh 2083)?
  - If records exist in-month but cells aren't colored → fix the date→status mapping so cells render their status color.
  - If the present days fall **outside** the shown month → it's data, not a bug. Report and leave it.

---

## Report-only (data — do NOT fix in this UI session)

- **D1 — Academic year shows "2081/82"** while the BS context is 2083 and admission is `2083-0001` (Home, Attendance footer "2081/82", Profile). Likely demo-seed data. Report where it comes from; a seed fix is a separate task.
- **D2 — Roll number renders "—"** on Profile. Confirm whether the logged-in student actually has a roll value. If genuinely unset, the em-dash fallback is fine — just confirm the field mapping is correct.

## Low priority / optional

- **L1 — Greeting "Good evening"** showed at 11:53. Verify the time-of-day greeting uses Asia/Kathmandu.
- **L2 — Naming:** tab "Routine" vs header "Class routine" vs "Today's classes". Align if trivial; otherwise leave.

---

## Verification

- `mobile tsc --noEmit` → exit 0.
- **Before → after** per fix:
  - P1: `Thu Jan 01 1970 15:30:00 GMT+0530 (Nepal Time)` → `10:00 AM` (and routine range `10:00 – 10:45`).
  - P2: `Room Room 101` → `Room 101`.
  - P5: `Class Grade 10 · Section A` → `Grade 10 · Section A`.
- P3 / P4: state the token/color now used and confirm it's legible (not the faint grey).
- V1 / V2: state the determined root cause and what was done (or why nothing was).
- D1 / D2: report findings only.
- Confirm no previously-clean screen regressed (Notices and Profile cards, Home attendance card).
