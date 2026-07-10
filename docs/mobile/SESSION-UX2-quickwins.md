# SESSION-UX2 — Mobile UX Quick-Wins Batch

**Type:** Mobile UX fixes — the three confirmed, code-level, high-impact/low-effort wins from the UX audit. Foundation polish: the app stops looking broken and feels coherent. **No redesign, no new features.**

**Source of truth:** `docs/audits/MOBILE-UX-AUDIT-2026-06-24.md` (wins #1, #2, #5).

**Stack:** Expo SDK 54, expo-router, NativeWind v4, TanStack Query, `useThemeColors`. Reuse the existing skeleton / `ErrorState` / `EmptyState` patterns already in the app.

---

## Hard rules

1. **Step 0 read-and-report** — list the exact files for each task from the audit before editing.
2. **No redesign / no new screens** — these are polish fixes that reuse existing components.
3. Keep token discipline (`useThemeColors`) — no new hardcoded colors.
4. **Prove each** — code change + the audit's own evidence resolved; the device-visible ones (dark mode, error states) confirmed by Srijan on-device after.

---

## Task 1 — Pin to light mode (the one-liner that kills the dark-mode class)

- `app.json` `userInterfaceStyle` `"automatic"` → `"light"`. This is the root cause of the whole latent washed-out-contrast class (NativeWind `className` colors flipping under OS dark mode while the app intends static light).
- Confirm no screen *intentionally* relies on dark mode (the audit says dark mode is inert) — pinning light is safe until real dark-mode support is a deliberate future project.
- **Proof:** with the device in dark mode, the app now renders light/legible (this is the visual confirm Srijan does — note it for the device check).

## Task 2 — Surface errors on the 6 silent-failure screens

The audit found 6 screens (4 teacher, 2 parent) that render empty/`…` with **no retry** when the backend errors — they look broken and the user is stuck.

- For each (exact list from the audit's Step 0), add the existing `ErrorState` + retry on the query's `isError`, matching the pattern the well-behaved screens already use. Distinguish **error** (retry) from genuine **empty** (no-data state) — don't show "retry" on a legitimately empty list.
- **Proof:** force a backend failure (e.g. kill the API / bad token) → each of the 6 screens shows the error + retry, and retry recovers when the backend is back. (Device confirm by Srijan; code path verifiable.)

## Task 3 — Unify the loading idiom

Student screens use skeletons; parent uses spinners — siblings feel different.

- Pick the better idiom (the audit/Srijan's call — skeletons generally feel faster) and apply it consistently across the apps' data screens, reusing the shared loading component.
- No layout change beyond swapping the loading treatment.

---

## Not in scope

- No `ScreenHeader` adoption (#3), no roster virtualization (#4), no motion (#6–10) — those are the next batches.
- No real dark-mode support (pinning light is the fix here).
- No backend changes.

---

## Verification

- `tsc --noEmit` (mobile) clean.
- **Task 1:** `app.json` pinned; note the dark-mode device check for Srijan.
- **Task 2:** the 6 screens listed, each now wired to error+retry; describe the forced-failure check.
- **Task 3:** loading idiom consistent across the listed screens; state which idiom and where applied.
- Verdict per task. Flag anything that needs Srijan's on-device confirmation.
