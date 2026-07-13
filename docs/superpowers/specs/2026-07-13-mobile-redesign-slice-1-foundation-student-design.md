# Mobile Redesign — Slice 1: Foundation + Student

- **Date:** 2026-07-13
- **Status:** Approved design → ready for implementation plan
- **Scope:** `apps/mobile` only. `apps/api` and `apps/web` untouched.
- **Source design:** claude.ai design project `Aaramva Sikshya Mobile App Design`
  (`0968c674-c4e5-4278-b855-49d0b327c56f`), file `Aaramva Shikshya App.dc.html`
  — a 4-frame canvas (Auth / Student / Parent / Teacher). This slice implements the
  **Student** frame plus the shared design-system foundation the other frames will reuse.

---

## 1. Background & decisions

The design is a **visual evolution, not a rebrand**. The mobile app already uses Plus
Jakarta Sans and a token palette nearly identical to the mockup. The mockup demonstrates a
demo tenant ("Gyan Jyoti") in maroon `#98293B`; that is just the existing **per-school
`--primary` override** (ThemeSync), not a new brand. App default stays Aaramva green
`#0B6B43`.

Decisions locked during brainstorming:

| # | Decision | Choice |
|---|---|---|
| Sequencing | How to carve the 4-frame design | **Foundation + Student pilot** first; then Parent, Teacher, Auth as later slices |
| Scope depth | Beyond looks? | **Restyle + existing data only.** No `apps/api` changes. Graceful fallback where the design shows data we don't have |
| Icons | Material Symbols vs Ionicons | **Adopt Material Symbols Rounded**; migrate Ionicons per-screen as each is refactored |
| Student coverage | Which screens | **Full Student role** — all 10 screens |
| Execution | Foundation vs screens ordering | **Hybrid:** core foundation → Home (validate) → fan out remaining 9; screen-specific components born with their screens |
| Edit/Settings | The design's Edit-profile + Settings sub-screens | **Restyle to existing capabilities** — language toggle, change-password, sign-out, read-only "locked" fields. No new write endpoints |

### Goals
- Student app matches the design frame at high fidelity, using only data the current API returns.
- A shared foundation (icons, tint tokens, restyled + new `components/ui/` primitives) that
  Parent/Teacher/Auth slices reuse without rework.
- Full functional parity: routing, i18n (en/np), per-school theming, EDU-2 submit/upload,
  push/inbox, BS dates — all preserved.

### Non-goals
- Parent / Teacher / Auth frames (later slices).
- Any backend/API change; any web-app change.
- New self-service write features (profile self-edit, mobile photo upload — display-only per FILE-1).
- The design's richer analytics that need new endpoints (rendered only when data already exists).

---

## 2. Icon system

**Problem.** The design uses **Material Symbols Rounded** with **filled** variants
(`FILL 1` on `check_circle`, tab icons, `trending_up`, `flag`). The pre-installed
`@expo-google-fonts/material-symbols` ships only the **outlined, unfilled** static family;
RN static fonts can't toggle the FILL/rounded axes at runtime, and `<Text>` ligatures are
unreliable on native.

**Approach.** An `Icon` component built on `@expo/vector-icons`' `createIconSet`
(codepoint-based → reliable on **native + web**):
- A **curated glyphmap** of the **43 icons** the design uses (name → codepoint), stored at
  `lib/icons/glyphmap.ts`. Icons used:
  `arrow_back arrow_forward assignment_late battery_full calculate calendar_month campaign
  cancel check check_circle chevron_left chevron_right done_all download edit_note event
  event_upcoming flag free_breakfast groups help how_to_reg lock logout mail meeting_room
  menu_book notifications payments person photo_camera restaurant save schedule school search
  settings share signal_cellular_alt tag trending_up visibility_off wifi`.
- Two bundled static TTFs in `apps/mobile/assets/fonts/`:
  `MaterialSymbolsRounded-Regular.ttf` (FILL 0) and `MaterialSymbolsRounded-Filled.ttf`
  (FILL 1), loaded via the existing `useFonts(APP_FONTS)` in `app/_layout.tsx`.
- `Icon` API: `<Icon name="check_circle" size={26} color={c.success} fill />` — the `fill`
  boolean selects the filled family; default outlined.

**Font sourcing is the first implementation step.** Obtain the two Rounded static instances
from Google Fonts (static export) and place them in `assets/fonts/`; generate the codepoint
map for the used subset from Google's published `MaterialSymbolsRounded` codepoints list.
- **Fallback (de-risk):** if sourcing the Rounded TTFs is fiddly, use the already-installed
  `@expo-google-fonts/material-symbols` (outlined) for the unfilled set and bundle only one
  filled Rounded instance. Visually ~95% of target; documented if taken.

**Migration.** Ionicons (41 usages) are replaced **per-screen** as each screen is refactored,
plus the five `(student)/_layout.tsx` tab icons. No big-bang icon swap.

---

## 3. Tokens & theming

Existing token keys and the per-school override mechanism are unchanged. Additions:

- **`--primary-soft`** — light tint of the school primary (maroon→`#F8ECEE`,
  green→`#E9F4EE`). Derived at `ThemeSync` time from `--primary` via a `lighten`/`mix-with-white`
  helper in `lib/theme/`, so it stays per-school. Powers every tinted hero header and brand chip.
  Exposed through `useThemeColors()` as `c.primarySoft`.
- **Decorative semantic soft-pairs** (bg + fg), added to `lib/theme` as **documented literal
  exceptions** (same status as `subjectColor()` / `STATUS_CONFIG` — NOT brand-coupled, never
  replaced with `--primary`):
  | token | fg | soft bg |
  |---|---|---|
  | success | `#0E9F77` (deep `#0B7B5C`) | `#E4F6F1` |
  | warning | `#D9892B` (deep `#B9721F`) | `#FEF3E2` |
  | info | `#5B7FE0` | `#EAF0FE` |
  | danger | `#E5484D` | `#FDF1F1` (border `#F3D4D4`) |

### Concrete design values (single source for the primitives)
- Background `#F4F6F5`; ink `#10231A`; muted greys `#5C7068 / #7A8B82 / #8A998F / #A0AEA6`.
- Card: white, radius **16–20px**; shadow **`0 8px 22px -16px rgba(16,35,26,0.26)`** (elevated),
  **`0 6px 16px -13px rgba(16,35,26,0.3)`** (standard).
- Primary gradient CTA: `linear-gradient(135deg, <primary>, <primary-dark>)`, height 50,
  radius 14, white text 15px/700, shadow `0 10px 22px -10px rgba(<primary>,0.55)`.
- Hero header: `--primary-soft` bg, border-radius `0 0 24px 24px`.
- Bar header (sub-screens): white, border-bottom `1px #EEF0EE`, back-chip 32×32 radius 10 bg `#F4F0F1`.
- `SectionLabel`: 12px / 800 / `#3F554B`. Uppercase `CardLabel`: 10–11px / 700 / ls 0.6 / `#8A998F`.
- Tab bar: white, border-top `1px #ECEFEC`, active pill bg `--primary-soft`, **filled** active icon,
  label 9.5px / 700.

---

## 4. Shared components (`components/ui/`)

**Core foundation — built and verified before Home:**

| Component | New/Change | Role & key props |
|---|---|---|
| `Icon` | new | Material Symbols Rounded (§2). `name`, `size`, `color`, `fill?` |
| `ScreenHeader` | extend | add `variant="hero"` (soft-tint, rounded-bottom, `schoolBadge`/`avatar`/`greeting`/`right` slots) alongside existing `bar` (back button + `title`/`subtitle`/`right`). Safe-area aware (unchanged) |
| `Card` | restyle | softer shadow + 18–20px radius; **public API unchanged** so existing usages keep working |
| `SectionLabel` | new | bold section heading; `npTitle` support |
| `FeatureTile` / `FeatureButton` | new | quick-access grid tile (icon chip + label + `onPress`) and the mini count buttons (homework/notice) |
| `StatTile` | new | tinted `value` + `label` tile; `tone` (success/warning/info/danger/brand) |
| `PrimaryButton` | extend | add `variant="gradient"`; keep `solid`/`soft`, loading, ≥52pt |
| `SchoolBadge` / `AvatarBadge` | new | rounded-square school initials + circular initials avatar; both read `--primary` |
| `SegmentedPills` | new | term/year selectors + horizontal scrollable month pills; `items`, `value`, `onChange` |
| tab bar | restyle | pill-highlight active tab + filled icon, in each `(role)/_layout.tsx` (student now) |

**Screen-specific — born with their screens:**
`ResultHero` (gradient GPA/grade/rank + optional change strip), `GpaTrendBars` (mini bar chart),
`InsightCard` (top-subject / needs-focus pair), `SubjectRow` (marks + progress bar + optional
class-avg marker), `PeriodRow` + `DayFilter` (routine; may extend existing `SubjectSlot`),
`NoticeCard` (left-accent; extend `NoticeFeed`), `InfoRow` / `SettingsRow`.

All new components are **token-only** (brand via `useThemeColors()`/NativeWind tokens),
render text via **`NpText`**, and carry i18n `labelKey`s where they show copy.

### Propagation policy (shared components affect not-yet-migrated roles)

Parent and Teacher screens consume many of these shared primitives, so changes propagate
before their slices land. To avoid a half-broken Parent/Teacher app:

- **New looks are additive / opt-in.** The hero header is a **new `variant`** on
  `ScreenHeader`; the gradient CTA is a **new `variant`** on `PrimaryButton`; new primitives
  are net-new files. Existing default behavior is preserved, so screens not yet migrated
  render exactly as today.
- **Global restyles are limited to role-agnostic improvements** that are meant to apply
  app-wide for consistency (e.g. tuning the `CARD_SHADOW` / `CARD_SHADOW_LG` elevation scale,
  card radius). These intentionally reach Parent/Teacher and are consistent, not regressions.
- **Migrating a shared component's icons to `Icon`** (e.g. inside `NoticeFeed`,
  `NotificationInbox`, `StateViews`) renders the same glyphs everywhere — consistent across
  roles, acceptable before their slices.
- Net effect: after this slice, Parent/Teacher look **unchanged or consistently improved**,
  never partially-redesigned.

---

## 5. The 10 Student screens

Each screen: match the mock where data exists; **gracefully omit/adapt** where it doesn't.
Data comes from **existing** student hooks (`hooks/useStudentMe.ts` and the results/assignments/
notices/inbox hooks); the implementation plan will confirm exact hook names before wiring.

1. **Home** (`(student)/index.tsx`) — `hero` header (school badge, bell w/ unread, avatar,
   name, class·section·roll, today BS) + **Today** module (attendance marked/not-marked from
   summary; next-class from today's timetable; homework + notice count buttons) + **Quick access**
   6-tile grid + **Today's classes** list.
   *Fallback:* "next class · 10:45" exact time and "marked at 10:02 AM" timestamp omitted if not
   in the API — show marked/not-marked state + next period name only.
2. **Attendance** (`attendance.tsx`) — `hero` (title, class, month) + year pills + horizontal
   month `SegmentedPills` + 4-up `StatTile`s + present-rate line + restyled `AttendanceCalendar`
   (rounded tinted cells, today ring, Saturday column) + **Recent activity** list.
   Future-month → `event_upcoming` empty state.
3. **Routine** (`timetable.tsx`) — `hero` + Sun–Fri `DayFilter` + period timeline (time gutter,
   period cards with icon tint, teacher/room, **NOW** badge, lunch-break rows). NOW derived from
   Nepal time; omitted otherwise.
4. **Notices** (`notices.tsx`) — `bar` header + left-accent `NoticeCard`s (tag chip, date, title, body).
5. **Profile** (`profile.tsx`) — tinted header (settings gear → Settings, school badge, avatar,
   name, adm·class) + info `Card` (`InfoRow`s) + menu `SettingsRow`s + danger sign-out.
6. **Results** (`results.tsx`) — `bar` + exam-term pills + `ResultHero` (GPA/grade/rank; change
   strip only when prior-term data exists) + `GpaTrendBars` **only if ≥2 published terms** +
   `InsightCard` top/needs-focus (derived from returned marks) + `SubjectRow` breakdown
   (class-avg marker only when API returns it) + Marksheet/PDF (existing `useReportCardDownload`).
7. **Assignments** (`assignments.tsx`) — `bar` (n pending · n submitted) + tinted assignment cards
   (subject tint, status chip OPEN/OVERDUE/SUBMITTED/LATE/REVIEWED via existing `lib/assignmentStatus`).
8. **Assignment-detail** (`assignment-detail.tsx`) — restyle with new primitives;
   **submit/resubmit + document upload flow unchanged** (EDU-2 `lib/submissionUpload`, after-review
   409 branch, locked/closed states).
9. **Inbox** (`inbox.tsx`) — restyle shared `NotificationInbox` (mark-read on open, mark-all,
   BS timestamps).
10. **Profile-details** (`profile-details.tsx`) — the design's **Settings** and read-only
    **Edit profile** sub-screens are realized **within the existing `profile.tsx` /
    `profile-details.tsx` routes — no new route files added** (avoids the POL-2 typed-routes
    churn and keeps routing stable). Settings content: language `LanguageToggle`,
    change-password → existing `app/change-password.tsx`, sign-out, `v1.0.0`. Edit profile:
    fields shown read-only, locked ones "managed by your school". **No new write endpoints.**

---

## 6. States, i18n, theming discipline

- Reuse `EmptyState` / `ErrorState` / `LoadingBlock` (restyled to the new card look) at every
  boundary — no blank screens, no raw errors.
- Every user-facing string via i18n (`t()` + `NpText`); new keys added to `student` and `common`
  namespaces in **both** `en` and `np`. New/changed strings go into the human-review doc for
  Srijan (per I18N-1 gate) — the session does not self-certify Nepali quality.
- BS dates keep `formatBs` (Nepali month names when locale=np).
- Brand color **only** via `useThemeColors()` / tokens. The mockup maroon is the demo tenant;
  verify a non-default `--primary` still themes every new primitive (no hardcoded maroon leaks).

---

## 7. Verification (per slice + per screen)

- `npx tsc --noEmit` exits 0 (regenerate expo-router typed routes if a new route file is added —
  POL-2 gotcha).
- `npm test` (mobile jest) green, incl. **new unit tests** for: the `--primary-soft` derive
  helper, the `Icon` glyphmap (every used name resolves to a codepoint), and any new pure logic
  (e.g. GPA-trend "has enough data" guard, insight top/needs-focus derivation).
- i18n: new keys resolve in both `en` and `np`; no missing-key warnings.
- **Render check:** drive the Student app (Expo) and compare each screen against the design
  canvas as the visual reference (Home first, as the hybrid validation gate).
- **Theming check:** run with a non-Aaramva `--primary` (e.g. the maroon demo) and confirm
  headers/tiles/tabs/buttons all re-tint; run default green and confirm no regression.

---

## 8. Out of scope (this slice)

Parent / Teacher / Auth frames · any `apps/api` or `apps/web` change · new self-service write
features (profile self-edit, mobile photo upload) · net-new analytics needing endpoints
(GPA deltas/rank deltas render only when the data already exists) · dark mode (not in the design).

---

## 9. Reference

- Design canvas (full 4 frames): claude.ai design project `0968c674-c4e5-4278-b855-49d0b327c56f`,
  `Aaramva Shikshya App.dc.html`. Reference screenshots + logo assets live in the same project.
- Existing conventions honored: mobile shared-UI rules & token discipline (CLAUDE.md
  "Mobile shared UI library"), I18N-1 human-review gate, POL-2 typed-routes gotcha,
  FILE-1 display-only mobile photos.
