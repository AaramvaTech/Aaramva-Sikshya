# Claude Code Prompt — Session: Student UI → Design Tokens + Per-Tenant Theming

Copy everything below the line into Claude Code, started from the monorepo root.
This is a **refactor of existing student screens**, not a rebuild. Do not wipe or recreate working screens.

---

We are migrating the **existing student mobile interface** in `apps/mobile/` onto a semantic design-token system and a per-tenant theming engine. After this session, every student screen reads abstract color roles (`bg-primary`, `text-foreground`, etc.) instead of hardcoded colors, and the whole UI recolors automatically when a school's brand color is applied. No screen should look different in the default (Aaramva) theme — visual parity is the bar.

Use subagent-driven development.

## Step 0 — Read and REPORT before changing anything

Do not edit any file in this step. Read, then report back to me, then wait for the rest of the build.

1. `CLAUDE.md` — project conventions and memory.
2. `apps/mobile/` — inventory the student interface. List every file under the student route group (e.g. `app/(student)/**`) and any student-specific components. For each, report how colors are currently applied: semantic-ish classes, raw Tailwind color classes (`bg-blue-500`, `text-gray-900`), inline `style` colors, or hex literals.
3. Report the current contents of `apps/mobile/tailwind.config.js`, `global.css`, and `babel.config.js`.
4. Report whether a theme provider, a `vars()` usage, or any runtime color-swap already exists. Report how `/tenants/verify` branding (if any: name, logo, color) is currently consumed after code entry.
5. Confirm how Nepali strings are currently rendered (is there a Devanagari font loaded and a text wrapper, or do they use the default font?).

**Then stop and give me this inventory before proceeding.** If anything below conflicts with what's already there, flag it.

## Decisions already made (do not re-litigate)

- Keep NativeWind v4, expo-router, and the existing scaffold. Refactor in place.
- **Theming is a one-variable swap.** A school's identity overrides only `--primary` (and supplies a logo). Every other token is fixed. Do not create per-school component variants.
- Colors are stored as **space-separated RGB channels** (not hex) so `<alpha-value>` works.
- Visual parity in the default theme is mandatory. If a token sweep would change how a screen looks under the Aaramva default, the token value is wrong — fix the token, not the screen.

## Build tasks

### 1. Token layer (additive — nothing should break)

1.1 Create `lib/theme/tokens.ts` with the Aaramva default token map (RGB channels) and a `hexToRgbChannels(hex)` helper. Token keys: `primary`, `primary-foreground`, `background`, `surface`, `surface-muted`, `border`, `foreground`, `muted-foreground`, `success`, `warning`, `danger`, `info`.

1.2 In `tailwind.config.js`, map each token to a utility color via `rgb(var(--token) / <alpha-value>)`. Set `darkMode: 'class'`.

1.3 In `global.css`, define the tokens under `:root` (Aaramva default) and dark overrides under `.dark:root` (at minimum `background`, `surface`, `surface-muted`, `border`, `foreground`, `muted-foreground`).

1.4 Verify a throwaway `<View className="bg-primary">` renders the Aaramva color. Remove the throwaway after.

### 2. Theming engine

2.1 Create `lib/theme/provider.tsx`: a `ThemeProvider` that holds resolved school branding in state and, when a `primaryColor` is present, applies `vars({ '--primary': hexToRgbChannels(color) })` on a wrapping `<View className="flex-1 bg-background">`. Expose `applySchool(branding)` and `reset()` via context (`useBranding`).

2.2 Mount `ThemeProvider` in the app tree **below** the auth boundary so authed screens (student tabs) sit inside it.

2.3 Wire `applySchool({ primaryColor, logoUrl, name })` to fire when `/tenants/verify` resolves the school (right after code entry, before/at login). Call `reset()` on logout. If branding is cached in MMKV, apply it on session restore so the app opens already in-brand.

### 3. Student screen sweep (the core refactor)

3.1 Produce an inventory of every hardcoded color usage across the student screens from Step 0: raw Tailwind color classes, hex literals, and inline style colors.

3.2 Replace them with semantic tokens, consistently, using this mapping as the default rule (adjust per the actual values found, and tell me where you deviated):
   - page/scaffold backgrounds (`bg-white`, `bg-gray-50`) → `bg-background`
   - cards / raised surfaces (`bg-gray-100`, light grays) → `bg-surface` / `bg-surface-muted`
   - brand / accent / primary action colors (whatever blue/indigo is used) → `bg-primary` / `text-primary`
   - text on primary → `text-primary-foreground`
   - primary body text (`text-gray-900/800`) → `text-foreground`
   - secondary/meta text (`text-gray-500/400`) → `text-muted-foreground`
   - hairlines/dividers (`border-gray-200`) → `border-border`
   - status colors → `text-success` / `text-warning` / `text-danger` / `text-info`

3.3 Do this as one consistent pass across all student screens — same fix everywhere, not screen-by-screen improvisation. This mirrors the web module audit pattern.

### 4. Typography pass

4.1 If a Devanagari font and `<NpText>` wrapper don't already exist, add them (load Noto Sans Devanagari via `expo-font`; expose `font-deva`). Ensure every Nepali string and BS date in the student screens uses `font-deva`; Latin/numeric text uses `font-sans`.

### 5. State pass (the "feels polished" layer)

5.1 For each student screen that loads data, confirm it has a designed **loading** (skeleton, not a bare spinner where a list is expected), **empty**, and **error** state. Empty/error copy is directive and in the app's voice — e.g. "No exams scheduled yet" / "Couldn't load attendance. Pull to retry." — sentence case, no apologies, names things the way a student would.

5.2 Keep the visual budget tight: one accent (the swappable primary), generous whitespace, the spacing scale only (`p-2/3/4/6/8`), `rounded-2xl` cards / `rounded-xl` controls. Spend any visual boldness in one place per screen; keep the rest quiet.

## Acceptance criteria

- Every student screen renders **identically** under the Aaramva default theme (visual parity — confirm with screenshots if the environment supports it).
- Calling `applySchool({ primaryColor: '#1D4ED8' })` recolors the entire student UI (every primary surface/text/border) with no per-screen edits.
- `reset()` returns the UI to Aaramva branding.
- Dark mode flips background/foreground correctly.
- No hardcoded hex or raw `*-{color}-{n}` color classes remain in the student screens (grep clean), except where intentionally documented.
- Nepali strings render correctly in `font-deva`.

## Report back

List of files changed, the hardcoded-color inventory and how each was mapped, any usages that resisted the semantic sweep (and why), and before/after screenshots of two or three representative student screens.
