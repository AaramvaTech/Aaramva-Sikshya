# Session M2 — Branded Login (design pass)

**App:** Aaramva Shikshya mobile (`apps/mobile/`)
**Goal:** Redesign the two auth screens — the Aaramva-branded **code-entry** screen and the school-branded **login** screen — onto the design-token system, to the target below. Apply the canonical green, and fix the ON_PRIMARY_ACCENTS deferral so a non-green school's header accents follow its color. This is a **design/refactor pass, not a flow rebuild** — the auth logic (code → `/tenants/verify` → login → SecureStore) already works from Session 20, and per-tenant theming already fires from the student-migration Task 6. Do not re-architect either.

---

## Step 0 — Read and REPORT before changing anything

Do not edit in this step. Read, report, then wait.

1. `CLAUDE.md` — conventions and memory (note the canonical primary `#065f46`, the `useThemeColors` bridge, and the Task 6 ThemeSync/`applySchool` wiring).
2. The two auth screen files (likely under `app/(auth)/` — code-entry and login). Report how each currently applies color: `className` semantic tokens, the `useThemeColors` bridge, raw StyleSheet/JS-prop colors, or hardcoded hex. The student screens turned out to be StyleSheet/JS-prop heavy — expect the same here and plan to route through `useThemeColors`.
3. The header/gradient accent code: report the current `ON_PRIMARY_ACCENTS` constant (or wherever the hardcoded green accents live) and exactly which elements use it.
4. The Aaramva logo asset — report its path and whether a **white/monochrome-light** variant exists (needed for legibility on the emerald header).
5. How code-entry → verify → login currently transitions, and how `applySchool` / `reset` are invoked today (so the redesign reuses them, not replaces them).

Report the above, then proceed.

## Decisions already made (do not re-litigate)

- Refactor in place. The auth **flow** works — do not rebuild it. Restyle + add states only.
- Route JS-prop colors through the existing `useThemeColors` bridge; use `className` semantic tokens where the screens already do.
- Canonical Aaramva primary is `#065f46`. The auth screens must read the **primary token**, never a second hardcoded green. If any other green literal appears, remove it.
- Code-entry renders on the **Aaramva default** theme (before `applySchool`). Login renders on the **school** theme (after `/tenants/verify` → `applySchool`). That handoff is already wired — reuse it.
- Logo legibility: the **Aaramva** mark needs a white/light asset on the emerald header (or render an icon + wordmark). **School** logos use the existing light-backing chip from Task 6 — it works for any uploaded logo.
- On-primary accents are **derived from `--primary`**, never a fixed hue.

## Target design (both screens share one skeleton)

**Code-entry (Aaramva-branded):**
- Emerald header (the primary token), generous height, content centered: a white Aaramva logo in a subtle translucent chip (`rgba(255,255,255,0.14)`, rounded), the wordmark in white, and the tagline beneath in a light tint (e.g. teal-100). Header must be legible — this is the bug in the current build.
- Body: `Find your school` (≈19px / weight 500, `text-foreground`), subtext `Enter the school code provided by your institution.` (`text-muted-foreground`), then comfortable spacing.
- Input: token-styled, ≈48px, `rounded-xl`, a leading school icon, placeholder `e.g. motherland-school`.
- Primary button: full width, **primary token** background, white label, search icon, `Find school`. Includes a **loading** state (spinner / disabled) on submit.
- A quiet `Don't know your code?` helper below the button (tappable — see task 3).
- A small trust footer anchoring the bottom (lock icon + short line) so the screen reads balanced, not empty.
- States: empty/invalid-format validation; **code-not-found** shows an inline error under the input (directive copy, e.g. `We couldn't find that school code. Check it with your school.`).

**School-branded login (the counterpart):**
- Same skeleton, but the header now wears the **school's** color (the post-`applySchool` `--primary`) with the **school logo on the light chip** and the school name (use `nameNp` via `NpText` where the name is in Nepali).
- The existing login fields, restyled onto tokens; primary button in the school color with a loading state and an invalid-credentials error state.
- A `Not your school?` affordance that calls `reset()`, clears the slug, and returns to code-entry (reuse the existing reset path).
- `KeyboardAvoidingView` + safe-area insets so the form isn't covered by the keyboard.

## Build tasks

### 1. On-primary accent derivation (fixes the ON_PRIMARY_ACCENTS deferral)
Add a helper (extend `useThemeColors` or a small `deriveOnPrimary(primary)`) that computes header/on-gradient accents **from the current `--primary`** — e.g. an HSL lightness-shifted tint for soft accents, and `rgba(255,255,255,α)` for brand-agnostic accents. Replace every hardcoded-green accent that sits on the header/gradient with these. Result: a non-green school shows no stray green on its header.

### 2. Redesign code-entry to the target
Restyle the existing screen (keep its submit→verify logic). Build the header (white Aaramva logo/chip + wordmark + tagline), the heading/subtext, the token input, the primary button **with loading state**, the `Don't know your code?` helper, and the trust footer. Add empty/invalid and not-found error states.

### 3. `Don't know your code?` helper
Make it a real affordance, not decoration: tapping it opens a short info sheet/screen explaining where to find the code (from the school admin / fee receipt / SMS), since parents and students often won't know it. Keep copy short and directive.

### 4. Redesign school-branded login to the matching skeleton
Restyle the existing login screen: school-colored header + school logo chip + school name (`NpText` for Nepali), token-styled fields, primary button in school color with loading + invalid-credentials states, the `Not your school?` reset affordance, and keyboard/safe-area handling. Reuse the existing auth call and `reset` path.

### 5. Typography + green hygiene
Any Nepali string (tagline if localized, school `nameNp`) renders via `NpText` / `font-deva`. Confirm both screens reference only the primary token for green; remove any stray literal. If `#065f46` isn't yet pinned as the canonical Aaramva primary in `CLAUDE.md`, add that note. (The web `#1a8055` reconciliation is **out of scope** here — mobile only.)

## Acceptance criteria

- Code-entry matches the target: Aaramva logo legible on the emerald header, a single-palette green (button = header), balanced layout with helper + footer. Invalid/not-found code shows an inline error; submit shows a loading state.
- Submitting a valid code transitions to the login screen now wearing the **school's** color and logo — the branding handoff is visibly real.
- On a **non-green test school**, the header *and its accents* are in the school color — no stray green (ON_PRIMARY_ACCENTS fixed).
- `Not your school?` clears the slug, resets the theme to Aaramva, and returns to code-entry.
- The auth flow still works end to end (no regression). `tsc --noEmit` clean.

## Report back

Files changed; before/after screenshots of **both** screens, including one **non-green test school** to prove the accent fix; how on-primary accents are derived; and whether a white Aaramva logo asset was needed and added.
