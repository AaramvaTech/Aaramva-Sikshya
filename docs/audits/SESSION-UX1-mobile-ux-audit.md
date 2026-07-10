# SESSION-UX1 — Mobile UX Audit (read-only, code-level)

**Type:** Read-only audit of the three mobile apps' UX at the **code level** — token consistency, theming correctness, the dark-mode contrast trap, component/pattern divergence, state coverage, motion, accessibility, performance signals. Produces a ranked worklist. **No code changes.**

**Honest framing:** Claude Code can't see rendered pixels (headless), so this audits what's findable in **code**. Aesthetic/feel findings (spacing, visual polish, actual appearance) come from a complementary **device walk-through by Srijan** (screenshots), folded in separately — don't claim visual judgments from code.

**Source of truth:** the apps (`apps/mobile/app/(student|parent|teacher)/` + shared components/hooks); known deferred items — canonical green mismatch (mobile `#065f46` vs web `#1a8055`), `BsDate` hardcoded indigo/gray, `ON_PRIMARY_ACCENTS` (header accents staying green for non-green schools), dark mode "defined but inert."

---

## Hard rules

1. **Read-only. No fixes.** Findings go in the report.
2. **Audit all three role apps**, and **flag divergence** — same concept implemented differently across apps is itself a UX problem.
3. **Be honest about code-detectable vs needs-eyes.** Where a finding needs visual confirmation, put it in the "needs-visual" list, don't assert it.
4. **Rank by impact × effort** — what most moves "functional → feels great."

---

## Areas to audit (code-level)

1. **Theming / token discipline.** Every color usage: routed through `useThemeColors`/tokens, or hardcoded? List all hardcoded colors (known: `BsDate` indigo/gray, `ON_PRIMARY_ACCENTS` header accents, the `#065f46`/`#1a8055` canonical-green mismatch — plus any others). The per-tenant brand color should flow everywhere; flag where it doesn't.
2. **Dark-mode / contrast systemic sweep (the big one).** Find **all** remaining NativeWind `className` color usage that honors OS dark mode while the app intends static-light — the exact class that caused the washed-out bugs in M3.1/M5. Each is a latent contrast bug on a device with dark mode on. List every occurrence by file.
3. **Component / pattern consistency.** Across the three apps, are headers, cards, list rows, buttons, and the loading/error/empty/pull-to-refresh patterns shared components or duplicated/divergent? List the divergences.
4. **State coverage & quality.** Is every data screen's loading (skeleton vs spinner), error (with retry), and empty state present and consistent? List gaps and inconsistencies.
5. **Motion / micro-interactions.** Catalog what exists (transitions, press feedback, list/skeleton animations). Absence is an elevation opportunity — note it.
6. **Accessibility (code-detectable).** Touch-target sizes, `accessibilityLabel`/`role` on interactive elements, font-scaling/dynamic-type handling, consistent `NpText` use for Devanagari.
7. **Performance signals (code-level).** base64 image rendering (photos-in-DB → heavy base64 in lists?), list virtualization (`FlatList` vs `.map` over long lists), avoidable re-renders, query/refetch patterns.
8. **Per-app screen inventory.** Every screen per app with a one-line code-level UX note.

---

## Deliverable

Write `docs/audits/MOBILE-UX-AUDIT-2026-06-24.md`:
- The per-app screen inventory + the area findings, each tagged **[defect / inconsistency / elevation-opportunity]** with impact × effort.
- A ranked **"top UX wins"** list — the changes that'd most move the felt quality.
- A clear **"needs visual confirmation"** list — things Claude Code flagged but that need eyes on a device to confirm/prioritize.

No code changes; this is the map.
