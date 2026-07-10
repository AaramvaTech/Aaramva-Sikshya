# SESSION-UX3 — Mobile UX Consistency Batch

**Type:** Mobile UX consistency — adopt the shared `ScreenHeader` everywhere, and virtualize the large rosters. Makes the app uniform and smooth on big sections. **No redesign, no new features, no visual change to what a header looks like — just consolidate to one implementation.**

**Source of truth:** `docs/audits/MOBILE-UX-AUDIT-2026-06-24.md` (wins #3, #4).

**Stack:** Expo SDK 54, expo-router, NativeWind v4, `useThemeColors`, TanStack Query.

---

## Hard rules

1. **Step 0 read-and-report** — list the exact screens hand-rolling the header and the exact non-virtualized lists, from the audit + code.
2. **No visual regression.** `ScreenHeader` adoption must preserve each screen's current look (branded band, title, back/close, any per-screen actions). If a screen's header has a unique element `ScreenHeader` doesn't support, extend `ScreenHeader` to support it — don't fork it back.
3. **Virtualization must not change behavior** — same data, same row rendering, same pull-to-refresh/empty/error; just `FlatList` + memoization instead of `.map()`.
4. Token discipline; no new hardcoded colors.

---

## Task 1 — Adopt `ScreenHeader` across the hand-rolled headers

The audit found `ScreenHeader` exists but **zero** screens use it; ~17 hand-roll the branded band.

- **Step 0:** enumerate every screen that hand-rolls its header and what each one's header contains (title, back vs close, action buttons, subtitle/date). Confirm `ScreenHeader` covers those props; note any gaps.
- Extend `ScreenHeader` once to cover any missing variant (e.g. an optional action slot, close-vs-back), then **replace** each hand-rolled header with it.
- Preserve each screen's exact current appearance and actions — this is consolidation, not restyle.

## Task 2 — Virtualize the rosters

The audit found the teacher attendance/marks screens `.map()` a ~200-row roster, non-memoized, re-rendering the whole list.

- Convert the roster render to `FlatList` (or `FlashList` if already a dep — don't add it otherwise), with a memoized row component and a stable `keyExtractor`.
- Preserve the mark/enter interactions, the per-row state (status / theory-practical inputs), pull-to-refresh, and the empty/error states from UX2.
- Watch for the classic pitfall: row inputs must keep working inside a virtualized list (controlled state keyed by student id, not list index).

---

## Not in scope

- No motion/micro-interactions (#6–10 — the delight batch).
- No new screens, no IA changes, no restyle of header appearance.
- No backend changes.

---

## Verification

- `tsc --noEmit` (mobile) clean.
- **Task 1:** list every screen migrated to `ScreenHeader`; confirm appearance/actions preserved (note which need Srijan's on-device visual confirm). State any `ScreenHeader` extension made.
- **Task 2:** rosters now `FlatList` + memoized rows; confirm marking/marks-entry still work per row and the list scrolls smoothly on a large section (device confirm by Srijan — load a section with many students). Describe the code-level check.
- Verdict per task; flag what needs on-device confirmation.
