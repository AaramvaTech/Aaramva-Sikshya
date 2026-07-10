# Mobile UX Audit — 2026-06-24

**Type:** Read-only, code-level audit of the three role apps (`apps/mobile/app/(student|parent|teacher)/`) + shared UI (`components/ui/`) + hooks/lib. **No code was changed.** This is the map.

**Method:** Four parallel code-sweep passes (theming/dark-mode; component/state consistency; motion/a11y/perf; per-screen inventory), each returning `file:line` evidence. Headline claims (the dark-mode config root cause, the zero-virtualization finding) were spot-verified directly.

**Honest framing (per the spec):** Claude Code is headless — it cannot see rendered pixels. Everything below is *code-detectable*. Aesthetic/feel judgments (spacing, actual contrast, visual polish) are deferred to Srijan's device walk-through and collected in the **"Needs visual confirmation"** section — they are not asserted here.

**Spec-claimed items that are now STALE (verified fixed — do not re-open):**
- `BsDate` "hardcoded indigo/gray" → now token-driven (`text-primary`, `text-muted-foreground`), `BsDate.tsx:16-17`.
- `ON_PRIMARY_ACCENTS` "header accents stay green for non-green schools" → header accents now derive from the resolved primary via `deriveOnPrimary(c.primary)` (hue-preserving), `ScreenHeader.tsx:54,60-65` + `colors.ts:37-45`. No `ON_PRIMARY` constant exists anywhere.
- `#065f46` vs `#1a8055` "canonical-green mismatch" → mobile brand token is now `#0B6B43` (`tokens.ts:3`, `global.css:7`); `#1a8055` appears **nowhere** in mobile; `#065f46` survives only inside documented decorative palettes (subjects/grades). The brand-token mismatch is gone. (Web reconciliation remains out of scope.)

The brand pipeline is, in fact, **healthy**: per-tenant primary flows correctly through tab bars, headers, buttons, badges, and calendars via `useThemeColors()`/tokens. The real debt is elsewhere — dark-mode plumbing, component duplication, error-state gaps, list virtualization, and motion/a11y absence.

---

## TOP UX WINS (ranked by impact × effort)

Ranking = how much each moves "functional → feels great," weighted against effort. **L/M/H = effort.**

| # | Win | Impact | Effort | Why it ranks here |
|---|---|---|---|---|
| **1** | **Pin the app to light mode** — `app.json:9` `"automatic"` → `"light"` | **High** | **L** | One-line root-cause fix for the entire latent dark-mode contrast class. Removes the OS signal that makes the inherited Expo dark plumbing live. The single highest leverage change in this audit. |
| **2** | **Surface fetch errors on the 6 silent-failure screens** (teacher index/attendance/marks/my-attendance, parent timetable/profile) | **High** | **M** | Today a backend failure on these renders an empty/`…` UI indistinguishable from "no data," with no retry. `ErrorState` already exists — just wire `isError`. Most user-impacting *correctness-of-feel* gap. |
| **3** | **Adopt `ScreenHeader` (`hero`/`plain` variants) across the 17 hand-rolled headers** | **High** | **M–H** | The branded band is re-implemented ~17× with drifting padding/radii/safe-area math; `hero` variant exists and is used by **zero** screens. Biggest single consistency lever; also collapses the 3 near-identical `profile-details` screens. |
| **4** | **Virtualize the two teacher write-screens** (`marks.tsx`, `attendance.tsx`) + `React.memo` the rows | **High** (perf) | **M** | Both `.map()` a 200-row roster of `TextInput`/`Switch` rows inside a `ScrollView`, non-memoized, with inline-arrow props → every keystroke/tap re-renders all rows. Real jank at realistic class sizes. App has **zero** `FlatList` anywhere. |
| **5** | **Unify the loading idiom** (Skeleton everywhere, retire bare `LoadingBlock` spinners) | **Med** | **M** | Today *all* student screens skeleton-load while *almost all* parent screens spinner-load — siblings feel different. Even `(teacher)/profile.tsx` (spinner) vs `(teacher)/profile-details.tsx` (skeleton) diverge on the same data. |
| **6** | **Delete dead/scaffold screens** — `(parent)/home.tsx`, `(teacher)/home.tsx` ("Coming in Session 21"), and re-skin/retire `web-portal.tsx`, `+not-found.tsx` (off-brand `#2e78b7`) | **Low** (felt) | **L** | Pure hygiene; removes confusing dead code and the only two off-brand-blue screens. |
| **7** | **Add press-scale + list entrance motion** (Reanimated `entering`, press spring on cards/tiles) + make Skeleton a real shimmer | **Med** | **M** | The app has essentially **no motion** — one opacity pulse, opacity-only press feedback, default route transitions. This is the clearest "functional → premium" elevation, touching every screen cheaply via shared primitives. |
| **8** | **A11y label pass on screen-level interactive elements + images** | **Med** | **M** | Shared `components/ui/` is well-instrumented, but ~17 labels across all of `app/` for 196 interactive elements. Icon-only chips, quick-access tiles, the "Download report card" button, and every logo/photo `<Image>` are unlabeled. |
| **9** | **Make `SubjectSlot` the one timetable card** (parent + teacher hand-roll their own) and share the GPA card / subject row between student & parent results | **Med** | **M** | Timetable is built 3 different ways; results 2 different ways. Consolidating removes drift and unlocks parity (e.g. parent results has no PDF download). |
| **10** | **Remove inert dark tokens & scaffold** — `global.css:20-27` `.dark:root`, `tailwind.config.js:9` `darkMode:'class'`, `constants/Colors.ts` dark palette, retire `Themed.tsx` | **Low** | **L** | Defense-in-depth after #1; deletes latent web-dark tokens and the last live dark code path (`Themed` → reachable via `+not-found`). |

---

## AREA FINDINGS

Each tagged **[defect / inconsistency / elevation-opportunity]** with rough **impact × effort**.

### 1. Theming / token discipline — *mostly healthy*

The brand pipeline is sound (see framing above). Remaining items are duplicated semantic palettes and stray neutrals, not brand-token leaks.

- **[inconsistency · M×L]** Semantic status palettes are re-declared inline instead of importing the canonical `STATUS_CONFIG` (`lib/attendance.ts`), and the copies **drift**: `(teacher)/my-attendance.tsx:17-21` dots (`#059669/#ef4444/#d97706/#3b82f6`) differ from `attendance.ts` dots (`#0E9F77/#E5484D/#D9892B/#5B7FE0`) — the same status renders two different greens/reds across screens. Also `(parent)/fees.tsx:17-21` (fee-status, no shared source), `(teacher)/leave.tsx:19-22,97` (leave-status), `NoticeFeed.tsx:23-28` (notice-type tints mirror token values but are hardcoded).
- **[inconsistency · L×L]** Shadow color is unsystematic: most cards use ink `'#10231A'` (= `--foreground`) as `shadowColor` (literal, not token), but `SubjectSlot.tsx:153`, `(teacher)/timetable.tsx:217,248`, `(parent)/timetable.tsx:141` use plain `'#000'`.
- **[inconsistency · L×L]** Stray undocumented neutrals: legend separator `'#F0F3F0'` (`(student)/attendance.tsx:235`, `(parent)/attendance.tsx:293`), error-banner bg `'#FDECEC'` (`app/index.tsx:372`), `NoticeFeed.tsx:106` `DATE_COLOR='#A6B4AC'` (near but ≠ `--muted-foreground`), `(teacher)/marks.tsx:89` switch `true` track `'#fecaca'` (literal red while `false` side uses `c.border`).
- **[elevation-opportunity · L×L]** A few white card backgrounds use `'#fff'`/`'#FFFFFF'` literals where `c.surface` would be on-system: `AttendanceSummaryCard.tsx:71`, `TodayClasses.tsx:73`, `app/index.tsx:438`.
- **[defect (dead) · L×L]** Off-brand scaffold literals: `constants/Colors.ts` (`#2f95dc`), `+not-found.tsx:38` (`#2e78b7` link blue).
- **Allowed exceptions (no action):** `tokens.ts`, `PLACEHOLDER_ICON`, `SATURDAY_HIGHLIGHT`, `lib/attendance.ts`, `lib/subjects.ts`, `lib/gradeColors.ts`, onboarding `OB` palette (`app/index.tsx`).

### 2. Dark-mode / contrast systemic sweep — *the big one*

The app intends static-light, but the inherited Expo starter's dark plumbing was never removed, and one config line makes it **live, not inert**.

- **[defect · High×L] ROOT CAUSE — `app.json:9` `"userInterfaceStyle": "automatic"`.** With `automatic`, the OS reports the real scheme to RN's `useColorScheme()`/`Appearance`. On a phone in dark mode, anything wired to color scheme flips. **Verified.** Should be `"light"`. This single line is what makes the wiring below live.
- **[defect · Low×L] Live dark code path — `components/Themed.tsx:7,9,23,35,42`** actively resolves `Colors[theme][name]` from the OS theme; **reachable today** via `+not-found.tsx` (renders `Themed.Text`/`View`). Low blast radius (404 screen only) but a genuine live path. Paired with **`components/useColorScheme.ts`** which passes `'dark'` through (does *not* force light, unlike the correctly-pinned `useColorScheme.web.ts`).
- **[defect · Low×L (inert on native, live on web) — `global.css:20-27` `.dark:root`** full dark token override + **`tailwind.config.js:9` `darkMode:'class'`**. Inert on native (no `.dark` class is added anywhere — verified), but latent on the web bundle. Should be deleted outright since the app wants no dark mode.
- **[clean] No `dark:` className variants, no `Appearance.`/`DynamicColorIOS`/`PlatformColor` in any screen.** So there is no screen-level dark utility to wash out — the exposure is purely the config + inherited scaffold above.

### 3. Component / pattern consistency — *largest consistency debt*

- **[inconsistency · High×M–H] `ScreenHeader` bypassed by 17 of 24 screens.** Only 7 screens use it (`(teacher)/{attendance,marks,my-attendance,leave}`, `(parent)/{fees,timetable,request-leave}`). Its `hero` variant — built precisely for the home/profile bands — is used by **zero** screens; all student + most parent + teacher hero/back headers are inline `<View>` bands with drifting padding/radii/safe-area math.
- **[inconsistency · Med×M] The "white header + back chip" is copy-pasted verbatim** in `(student)/profile-details.tsx:48-66`, `(parent)/profile-details.tsx:65-83`, `(teacher)/profile-details.tsx:48-66`, and `(student)/results.tsx:91-114`. The three `profile-details` screens are near-identical files (same `DetailRow`, `lockedNote`, avatar block) — prime consolidation.
- **[defect · Med×M] Timetable built three different ways:** student uses shared `SubjectSlot` (`(student)/timetable.tsx:128`); parent hand-rolls period rows in a `Card` (`(parent)/timetable.tsx:65-128`); teacher builds a bespoke time-gutter layout (`(teacher)/timetable.tsx:82-199`). `SubjectSlot` is a documented shared primitive used **once**.
- **[inconsistency · Med×M] Results built two different ways:** student has term pills + GPA gradient card + PDF download; parent stacks every exam with no selector and no download — and both re-implement the GPA card and subject row independently (`(student)/results.tsx:53-73,30-49` vs `(parent)/results.tsx:27-43,46-66`).
- **[inconsistency · Low×M] Other duplications:** info/detail rows re-implemented 4+ times; "recent activity" row duplicated verbatim between student & parent attendance (`(student)/attendance.tsx:158-181` ≈ `(parent)/attendance.tsx:201-224`); sign-out button hand-rolled 3× (no shared destructive/outline button); `MonthNav`-style "month + day-strip" picker re-implemented inline in `(teacher)/attendance.tsx` while siblings use shared `MonthNav`; parent attendance has an inline percentage ring the student version lacks (`(parent)/attendance.tsx:144-153,261-278`).
- **[inconsistency · Low×L] `StatusBar barStyle` set inline on hand-rolled screens but absent on every `ScreenHeader`-based screen** — `ScreenHeader` itself never sets it, so bar style is screen-dependent.

### 4. State coverage & quality — *error-state gaps are the real risk*

Full table (24 data screens) lives in the working notes; the gaps:

- **[defect · High×M] Six screens have NO error+retry path — a fetch failure renders a silent empty UI:** `(teacher)/my-attendance.tsx` (summary/history errors unchecked → blank), `(teacher)/attendance.tsx:216,259` (sections/students), `(teacher)/marks.tsx:281,313,343` (schedules/sections/students/marks), `(teacher)/index.tsx` (renders `'…'` for name + empty cards on total failure), `(parent)/timetable.tsx:100`, `(parent)/profile.tsx:106`. `ErrorState` already exists — these just never branch on `isError`.
- **[inconsistency · Med×L] Two attendance screens handle errors only for the calendar sub-query**, not the page: `(student)/attendance.tsx:141-145` and `(parent)/attendance.tsx:173-177` show a compact `ErrorState` for history, but the `profile`/`summary` queries fail silently (blank header).
- **[inconsistency · Med×M] Loading idiom split with no rule:** all student screens use `Skeleton`; almost all parent screens use the bare `LoadingBlock` spinner; `(teacher)/profile.tsx` spins while `(teacher)/profile-details.tsx` skeletons on the *same* data hook.
- **[defect · Low×L] Pull-to-refresh missing on data-backed profile screens:** `(parent)/profile.tsx`, `(teacher)/profile.tsx` (main tabs with refreshable data) lack `RefreshControl`, though `(student)/profile.tsx:76` has it.
- **[inconsistency · Low×M] Submit-failure feedback differs:** teacher write-screens use `Alert.alert` (`attendance.tsx:166`, `marks.tsx:240`, `leave.tsx:149`); `(parent)/request-leave.tsx:284-291` uses an inline themed banner. Two patterns for the same event.

### 5. Motion / micro-interactions — *near-zero; a pure elevation lane*

- **[elevation-opportunity · Med×M] The app has essentially no motion.** Whole-app baseline: **1** custom animation total (`Skeleton.tsx` opacity pulse — a pulse, **not** a shimmer sweep), **0** Reanimated, **0** `LayoutAnimation`, **0** `entering`/`exiting`. Press feedback is **opacity-only** (`activeOpacity`), never press-scale, on every card/tile/row.
- **[elevation-opportunity · Med×M] No list-item entrance anywhere** — notices, invoices, rosters, results all hard-cut in.
- **[elevation-opportunity · Low×L] `NoticeFeed.tsx:39-62` expand/collapse jumps** (`numberOfLines` toggle, no `LayoutAnimation`); tab focus-dot appears with no transition (`*/_layout.tsx:14-23`); the high-frequency attendance status toggle (`(teacher)/attendance.tsx`) swaps color with no transition/bounce.
- **[elevation-opportunity · Low×L] Only default expo-router transitions** — no custom `animation`, no auth→role cross-fade.

### 6. Accessibility (code-detectable) — *shared lib good, screens thin*

- **[positive]** Shared `components/ui/` primitives (`PrimaryButton`, `StateViews`, `Selectable`, `Badges`, `MonthNav`, `ChildPicker`) consistently set `accessibilityRole` + `Label` + `State`. The gap is screen-level inline `TouchableOpacity`s that bypass them.
- **[defect · Med×M] Labeling gap:** 196 interactive elements, ~46 `accessibilityLabel` (mostly in shared lib; ~17 across all of `app/`), **0** `accessibilityHint` app-wide. Unlabeled key controls: term pills + **"Download report card"** (`(student)/results.tsx:183-197,240-250`), quick-access nav tiles (`(student)/index.tsx:187`, `(parent)/index.tsx:224`), and **every `<Image>`** (school logos + student/staff photos — school identity not announced).
- **[inconsistency · Low×L] Inline child-picker chips** (`(parent)/index.tsx:184`) lack `accessibilityState={{selected}}` while the shared `ChildPicker.tsx:37` sets it — same control, only one accessible.
- **[defect (minor) · Low×L] Sub-44pt visual targets** mitigated by `hitSlop`: `HeaderIconButton` 36×36 (`Badges.tsx:77-83`, hitSlop 10 → OK), `MonthNav` chevrons 36×36 (`MonthNav.tsx:68-73`, hitSlop 10 → OK). Flag visual size only.
- **[elevation-opportunity · Med×M] Dynamic-type risk:** no `allowFontScaling={false}` (good — text scales), but fixed-height containers will clip at large sizes — `AttendanceCalendar.tsx:128-138` cells, `Badges.tsx:65` badges, `AttendanceSummaryCard.tsx:80` chips, tab labels (`_layout.tsx:47` `fontSize:9.5`). Worth a `maxFontSizeMultiplier` pass on dense numeric UI.
- **[positive] Devanagari:** `NpText` auto-detects Devanagari and is used consistently for user-content names (`ScreenHeader npTitle`, `ChildPicker`, `TodayClasses`, `SubjectSlot`, `NoticeFeed`). BS dates correctly use raw `<Text>` because `formatBs(...,'en')` returns Latin transliteration — latent risk only if a screen ever switches to `'np'` (Devanagari digits) on a raw `<Text>`. Minor: `(parent)/index.tsx:153` `schoolTail` uses raw `<Text>` while `schoolHead` uses `NpText`.

### 7. Performance signals (code-level)

- **[defect · High×M] Zero virtualization app-wide — 0 `FlatList`/`SectionList` (verified).** Every list is `.map()` in a `ScrollView`. Worst offenders are the two teacher write-screens: `(teacher)/marks.tsx:348` maps the full 200-cap roster (`useTeacher.ts:63`) of rows each holding 2–3 `TextInput`s + a `Switch` + live validation; `(teacher)/attendance.tsx:264` maps the full roster of toggle rows. Bounded/low-risk lists: notices (cap 20), results (~10 subjects), recent-activity strips.
- **[defect · High×M (compounds the above)] Non-memoized rows + inline-arrow props:** `StudentRow`/`StudentMarkRow` aren't `React.memo`'d and receive `onCycle={() => …}`/`onChange={(p)=>…}` inline, with edit state held in the parent (`statusMap`/`marksMap`) → **every keystroke/tap re-renders all rows.** Also `(teacher)/attendance.tsx:121-138` rebuilds `statusMap` from query data in `useEffect`s that can clobber in-progress edits on a background refetch (the query has no `staleTime`).
- **[elevation-opportunity · Med×M] base64 images via plain RN `<Image>`:** `photoUrl`/`logoUrl` follow the web app's confirmed base64-in-DB pattern, rendered without `expo-image` → no caching, re-decodes on every mount, ~33% payload inflation. **Today rendered only on profile screens, one at a time — never per-row**, so worst-case roster-thumbnail jank doesn't occur yet. Recommend `expo-image` and never adding photos to list rows.
- **[elevation-opportunity · Low×L] Query caching:** `lib/queryClient.ts` default `staleTime:30_000`, no `gcTime`/`refetchOnWindowFocus` config. Several hooks omit a `staleTime` override (`useMyProfile`, `useMyAttendanceSummary/History`, `useMyStaffSummary`, `useSectionAttendance`, `useMyLeaveRequests`, `useExamMarks`) → refetch on nearly every tab-switch. No polling anywhere (fine).
- **[positive]** `AttendanceCalendar.tsx:40-54` and `(student|parent)/attendance.tsx:53` memoize derived data correctly; pull-to-refresh is wired consistently where present.

### 8. Per-app screen inventory (one-line code-level UX note each)

**STUDENT** — Tabs: Home/Attendance/Routine/Notices/Profile; hidden-but-reachable: `results`, `profile-details`. Richest, most consistently token-driven role.
- `index.tsx` — Dashboard; `useMyProfile/Timetable/AttendanceSummary`; uses shared cards; **smell:** notification bell badge is a hardcoded static red dot (`:153`), no unread data behind it.
- `attendance.tsx` — BS-month calendar; shared `MonthNav/AttendanceCalendar/Legend`; TZ-safe `localDateKey`; **smell:** raw `#F0F3F0` legend separator (`:235`).
- `timetable.tsx` — Today's periods via shared `SubjectSlot` with live now/past states; **smell:** current-period detection uses device-local `new Date()` (`:17-21`), not Nepal time like the dashboard — TZ inconsistency.
- `notices.tsx` — Thin wrapper over `NoticeFeed`; leanest screen; clean.
- `profile.tsx` — Hero + info + sign-out; **smell:** 4 SETTINGS rows are decorative (no `onPress`, `:141-150`) — look tappable, do nothing.
- `profile-details.tsx` — Read-only detail; conditional rows; **no pull-to-refresh** despite fetching.
- `results.tsx` — Term pills + GPA gradient + PDF download; nice grade/section normalization; the most featured results screen.

**PARENT** — Tabs: Home/Attendance/Results/Notices/Profile; 5 hidden routes. **`timetable` is orphaned** (built, no in-app link found → effectively unreachable). Heavy child-switcher duplication (identical default-selection `useEffect` across 5 screens).
- `index.tsx` — Dashboard + child chips; **smell:** guardian name derived from email local-part (`:32-39`); same static bell badge; device-local `getDay()` Saturday check.
- `attendance.tsx` — Child calendar + inline percentage ring (student lacks it) + Request-leave entry; **smell:** `toISOString().split` (UTC) date range (`:58`) vs student's TZ-safe key — day-boundary drift risk.
- `results.tsx` — Per-exam GPA blocks; **no term selector, no PDF download** (asymmetry vs student).
- `notices.tsx` — Byte-for-byte duplicate of student notices wrapper.
- `profile.tsx` — Guardian profile + children list; **no loading/error guard**; child rows show chevron but aren't tappable (`:126`); no pull-to-refresh.
- `fees.tsx` — The most "shared-primitive native" screen (`ScreenHeader/ChildPicker/Card/StatusBadge/Empty/Error/Loading`); read-only (no pay action — gateways unwired).
- `timetable.tsx` — Orphaned; hand-rolls period rows instead of `SubjectSlot`; no error state.
- `request-leave.tsx` — IDOR-safe leave form; inline error banner + retry; reached only from attendance.
- `profile-details.tsx` — Read-only; honest data-gap comment (`:116`) re: missing phone/address endpoints; no pull-to-refresh.
- `home.tsx` — **DEAD** "Coming in Session 21" placeholder; superseded by `index.tsx`; delete.

**TEACHER** — Tabs: Home/Routine/Attendance/Marks/Profile; 4 hidden routes, all funneled through Profile. Best Nepal-time discipline (`nepalNow`); but the two write screens use `Alert` for errors while the rest of the app uses inline banners.
- `index.tsx` — Home + 3 stat cards + action buttons; **no error state** (renders `'…'` on failure); **smell:** bell glyph navigates to `/profile` (`:109`) — misleading affordance.
- `timetable.tsx` — Bespoke time-gutter layout (doesn't use `SubjectSlot`); `nepalNow` correct; **smell:** decorative calendar icon (no week endpoint).
- `attendance.tsx` — Mark-attendance; tap-to-cycle toggles, "All Present", cross-section escape hatch; **defects:** no error state, non-virtualized non-memoized roster, UTC date (`:23`), `Alert` errors.
- `marks.tsx` — 3-step marks entry; most complex screen; only submits touched rows; **defects:** no error state, heaviest non-virtualized input list, `Alert` validation errors.
- `profile.tsx` — Defensive null-guards (`:44-46`, "crashes the whole tab" comment); sole entry to my-attendance/leave; spinner-loads (sibling skeletons); no pull-to-refresh.
- `profile-details.tsx` — Mirrors student/parent profile-details exactly.
- `my-attendance.tsx` — Own staff attendance; good generic reuse of `AttendanceCalendar` with a `STAFF_STATUS` (+HOLIDAY) config; **no error state**.
- `leave.tsx` — Only screen using a `Modal`; `ScreenHeader`-based; **smell:** `Alert` errors + raw-literal `STATUS_STYLE`.
- `home.tsx` — **DEAD** placeholder; delete.

**AUTH / SHARED** — 7 files.
- `_layout.tsx` — Root: boots session, imperatively routes by status+role in `useEffect` (documented why nav-state hooks are avoided); **smell:** loader color hardcoded `#0B6B43` (defensible — pre-branding).
- `index.tsx` — School-code onboarding; documented `OB` brand-literal exception; good 404/429/network error distinction.
- `login.tsx` — Token-driven brand band; fire-and-forget push registration; **smell:** brittle `err.message.split(': ')` error parsing (`:106-109`).
- `help-code.tsx` — Static help; token-driven; mixes StyleSheet + className.
- `web-portal.tsx` — Low-fidelity admin-redirect stub; raw `bg-white`/`text-gray-500` (not tokens) — lowest-polish real screen.
- `+not-found.tsx` — Untouched Expo template; off-brand `#2e78b7` link; reaches the live `Themed` dark path.
- `+html.tsx` — Web-only SSR shell; contains a `@media (prefers-color-scheme:dark)` body-bg block (web-only, contradicts static-light intent).

**Total: 36 screen files** (dead/non-screen: `(parent)/home.tsx`, `(teacher)/home.tsx`, `+not-found.tsx`, `+html.tsx`; low-fidelity stub: `web-portal.tsx`).

---

## NEEDS VISUAL CONFIRMATION (eyes on a device — not asserted from code)

These were flagged in code but require Srijan's screenshot walk-through to confirm/prioritize:

1. **Actual dark-mode washout** — with `app.json` `automatic`, put a device in dark mode and open `+not-found` and any `Themed`-using surface; confirm whether real contrast bugs render (code says the path is live but blast radius is small). The light-pin fix (#1) is worth doing regardless.
2. **base64 image render cost** — confirm whether profile photos/logos visibly lag or flash on mount (code can't measure decode time). Determines whether `expo-image` is urgent or nice-to-have.
3. **Roster jank threshold** — confirm `marks.tsx`/`attendance.tsx` input lag at real class sizes (30–50 students) on a mid-range Android. Code predicts jank; only a device confirms severity.
4. **Dynamic-type clipping** — set the OS font size to max and check the attendance calendar cells, badges, summary chips, and tab labels for actual clipping/overflow.
5. **Header drift across the 17 hand-rolled bands** — pixel-compare student vs parent vs teacher hero/back headers for padding/radius/safe-area differences (code shows they're independent implementations; only eyes confirm visible drift).
6. **Status-color drift** — visually compare the same attendance status on `my-attendance` vs the shared calendar (code shows different green/red literals); confirm it's noticeable.
7. **Motion feel** — the elevation-opportunity items (press-scale, list entrance, shimmer) are inherently subjective; prioritize from the device feel, not code.
8. **Spacing / visual polish / actual color harmony** — entirely out of code scope; defer fully to the device walk-through.

---

*End of audit. No code was changed. Working-note artifacts (full state-coverage table, exhaustive color-literal enumeration) available on request from the sweep agents.*
