# Web School Branding — logo fix + per-school panel theming

- **Date:** 2026-07-16
- **Status:** Approved design → ready for implementation plan
- **Scope:** `apps/web` (primary) + `apps/api` (two SELECTs, purely additive). `apps/mobile` untouched.
- **Trigger:** a Next.js runtime crash on the school panel sidebar for `geetanjali-school-college`.

---

## 1. Background

Two problems share one origin, but only one of them is a bug.

### 1.1 The crash (a real bug)

Logging into the school panel for a school whose logo was uploaded post-FILE-1 throws:

```
Invalid src prop (http://127.0.0.1:9000/aaramva-dev/tenant_geetanjali-school-college/
school-logo/a481d3e7-….jpg) on `next/image`, hostname "127.0.0.1" is not configured
under images in your `next.config.js`
```

**Root cause.** `apps/web/next.config.ts:8-14` has no `images` block, so the remote-host
allowlist is empty and every remote host is rejected. Next's default is `domains: []`, and
`[]` is truthy — so the guard at `next/dist/shared/lib/image-loader.js:79`
(`!src.startsWith('/') && (config.domains || config.remotePatterns)`) fires even though
images were never configured. `components/layout/sidebar.tsx:211-217` is the **only**
`next/image` in the whole app with a dynamic src.

**Why it surfaced now.** FILE-1 moved `school-logo` from base64 `data:` URIs to real public
storage URLs (`S3_PUBLIC_URL=http://127.0.0.1:9000/aaramva-dev`). `next/image` short-circuits
`data:`/`blob:` srcs at `get-img-props.js:270-274` (`unoptimized = true`), so the loader — and
therefore the hostname check — **never ran** for pre-FILE-1 logos. Post-FILE-1 logos hit it.

Census at design time (`public.tenants`):

| tenant | `logoUrl` | sidebar |
|---|---|---|
| `geetanjali-school-college` | `http://127.0.0.1:9000/…` | **crashes** |
| `motherland-school`, `jorden-donovan` | base64 `data:` URI (~60KB) | fine |
| `demo`, `kaye-nashh`, `raja-mcintyres`, `stacey-mejia` | `NULL` → `/icon.png` fallback | fine |

So it is **deterministic per school, not intermittent** — and every future logo upload
produces a URL, so it spreads to each school as it touches branding.

It is also a **production** bug, not just a dev annoyance: the throw is wrapped in
`NODE_ENV !== 'production'`, so prod would instead 400 at `/_next/image` and ship a broken
logo silently.

### 1.2 The gap (not a bug — a missing feature)

The sidebar logo **already is** the school-settings logo. `PATCH /settings/profile` writes
`public.tenants."logoUrl"` (`settings.service.ts:140,169`); login and `/auth/me` read that
exact column back (`auth.service.ts:117-128`). Nothing is wired to the wrong source — it only
looks unwired because it throws before painting.

The **colour** is the actual gap. The data all exists: `tenants` carries `primaryColor`,
`primaryForeground` and `colorSource`, and the API even auto-derives a brand colour from the
uploaded logo (`branding/branding-color.service.ts`, `POST /settings/branding/rederive`).
Mobile consumes it end-to-end (`ThemeSync` → `applySchool` → `--primary`). The web does not:

1. `/auth/login` and `/auth/me` return only `{ name, slug, logoUrl }` — `primaryColor` never
   reaches the web at all.
2. The panel's accent is the TailAdmin `brand-*` scale: **12 literal hex steps**
   (`--color-brand-25` … `--color-brand-950`, `brand-500 = #1a8055`) in `app/globals.css:92-103`,
   used across **79 files**. shadcn's runtime `--primary` exists but only ~5 files use it.

> **This reverses a previous call.** `CLAUDE.md` currently records *"(Web's `#1a8055`
> reconciliation is out of scope.)"* — that line must be updated when this ships.

### 1.3 Decisions locked during brainstorming

| # | Decision | Choice |
|---|---|---|
| Reach | How far does the school colour go? | **Full accent** — every `brand-*` follows, matching mobile |
| Colour safety | Light / low-contrast picks (yellow, pastel) | **Normalise the scale** — hue is theirs, legibility guaranteed |
| Surfaces | Beyond the school panel | **+ the `(auth)` pages.** NOT the chart palette, NOT the super-admin console |
| First paint | Flash of Aaramva green? | **Cached blocking `<head>` script** + background refresh |
| Scale source | Where the 12 steps are computed | **In the web, client-side** — no migration, web is the only consumer |
| `brand-500` conflict | One var, 132 fills + 94 text usages | **Clamp `brand-500` to ≥4.5:1 vs white** — zero file edits |
| Dashboard bar | `fill="var(--color-brand-500)"` | **Let it follow** — single-series accent, not a categorical encoding |

### Goals

- The school's uploaded logo renders in the sidebar (and never crashes the panel).
- The school's chosen colour drives the whole admin-panel accent, plus the `(auth)` pages.
- Illegible colour choices are impossible, without rejecting a school's colour outright.
- No regression to the Aaramva default look.

### Non-goals

- Charts' categorical series (`--chart-1..5`) and the `STATUS_CONFIG` semantic palette
  (PRESENT-green / ABSENT-red / LATE-amber / LEAVE-blue) — these stay fixed by existing
  documented rule.
- The super-admin console — platform-level (`tenantId: null`), stays Aaramva.
- `apps/mobile` — already themed; untouched.
- Any DB migration, any new endpoint.
- Migrating the 5 legacy base64 logos to storage (separate FILE-1 follow-up).

---

## 2. The logo fix

`components/layout/sidebar.tsx:211-217` → plain `<img>` with the
`// eslint-disable-next-line @next/next/no-img-element` comment, exactly matching the five
sites that already render this same value that way:

| site | already `<img>` |
|---|---|
| `app/super-admin/schools/page.tsx:175` | ✓ |
| `app/super-admin/schools/[id]/page.tsx:247` | ✓ |
| `app/(school)/settings/page.tsx:140` | ✓ |
| `components/onboarding/branding-step.tsx:103` | ✓ |
| `app/payment/payment-result.tsx:57` | ✓ |

**Why `<img>` and not `images.remotePatterns`.** `tenant.logoUrl` is per-tenant data whose
host is not knowable at build time (MinIO in dev, R2/CDN/custom domain in prod, potentially
per-school). An allowlist would need a new `NEXT_PUBLIC_*` env var and would re-break the
moment a school's logo lives elsewhere. `next/image`'s allowlist exists precisely to stop you
proxying arbitrary user-supplied URLs through `/_next/image` — the correct answer for a 36×36
logo is not to proxy it. This also keeps all six render sites consistent.

---

## 3. Theming architecture

### 3.1 The key insight — no file edits needed

Tailwind v4's **plain** `@theme` block (the one `globals.css:57-61` explicitly documents as
*not* `inline`) emits `--color-brand-500` as a real custom property on `:root`, and compiles
`.bg-brand-500` to `background-color: var(--color-brand-500)`.

An **inline property on `<html>` outranks the `:root` rule from the stylesheet.** So writing
the 12 `--color-brand-*` variables onto `document.documentElement.style` re-themes all 79
files with **zero edits**, and `globals.css`'s literals automatically become the Aaramva
fallback. (14 properties are written in total: the 12 brand steps plus shadcn's `--primary`
and `--primary-foreground`, which ~5 files use.)

**Corollary — the default look cannot regress.** Variables are written *only* when a school
is active. With no tenant, nothing is written and the hand-tuned literals stand byte-for-byte.

### 3.2 Data flow

| when | source | path |
|---|---|---|
| Before first paint | `localStorage['branding:<slug>']` | `<head>` script → apply cached scale |
| Authed panel | `/auth/me` tenant payload | store → `BrandingSync` → derive → apply → cache |
| `(auth)` pages, no session | `GET /tenants/verify/:slug` | `BrandingSync` → derive → apply → cache |
| No tenant / `/super-admin` | — | reset → Aaramva |

### 3.3 API change (additive only)

`auth.service.ts:117` and `:218` — the two SELECTs currently reading `name, "logoUrl"` from
`public.tenants` grow to include `"primaryColor", "primaryForeground"`. The `tenant` payload
on login and `/auth/me` gains the two fields. **No migration, no new endpoint** — both columns
already exist and are already served publicly by `/tenants/verify/:slug`.

**Why not use `/tenants/verify` for the panel too?** It is throttled **10/min per IP**
(`tenant.controller.ts:18-19`). A school office with twenty staff behind one NAT would start
eating 429s on ordinary panel loads. `/auth/me` is already called once per session, is
authed, and is not throttled. `verify` is kept only for the pre-login `(auth)` pages, where
volume is low and the result is cached.

### 3.4 Units

| module | responsibility | depends on |
|---|---|---|
| `lib/branding/scale.ts` | **Pure.** `deriveBrandScale(hex) → BrandScale \| null` (12 steps), `contrastRatio` (exported for tests) | nothing |
| `lib/branding/apply.ts` | Only module touching the DOM. `applyBrandScale(scale, fg, target?)` / `resetBrandScale(target?)` | scale types |
| `lib/branding/cache.ts` | `localStorage`, keyed by slug. `readBrandingCache` / `writeBrandingCache` | scale types |
| `components/branding/branding-sync.tsx` | React glue, mirrors mobile's `ThemeSync`. Renders `null` | store, api, the three above |
| `components/branding/branding-script.tsx` | Emits the blocking `<head>` IIFE (self-contained, no imports) | — |

Edits: `app/layout.tsx` (mount both), `store/tenant.store.ts` (+2 fields),
`components/layout/sidebar.tsx` (logo fix), `apps/api/src/modules/auth/auth.service.ts`
(+2 columns × 2 SELECTs).

`apply.ts` takes the target element as an **injectable parameter** so it is testable in the
node environment without jsdom (see §6).

**Duplicated colour maths is deliberate, not sloppy.** `apps/api` already has `contrastRatio`,
`relativeLuminance` and `hslToHex` in `branding-color.service.ts`. `next.config.ts:5-7`
documents that `apps/web` is deliberately self-contained with its own lockfile and **no
cross-package imports**, so `packages/shared` is unreachable. The two also answer different
questions: the API's derives *one* colour from a logo's pixels; this derives a *presentation
ramp* from one colour.

### 3.5 The scale algorithm (`deriveBrandScale`)

1. **Normalise input.** `settings.dto.ts:30-32` validates with `@IsHexColor()`, but that
   accepts `#abc`, `#abcd` and `#aabbccdd` — so expand shorthand and strip alpha. Anything
   still unparseable → return `null` (never throw).
2. **Hex → HSL.**
3. **Clamp the 500 step.** Keep H and S; lower L until `contrastRatio(step500, '#FFFFFF') >= 4.5`.
   - This single constraint solves **both** directions: `text-brand-500` legible on white,
     *and* white text legible on a `bg-brand-500` fill.
   - It is a **no-op for essentially every colour a school actually picks** — `#1a8055`
     passes at 4.8:1 untouched, maroon `#7C1D3F` at 9.1:1 untouched. It only bites on
     pastels and neons.
4. **Clamp the 400 step for the dark end.** The codebase switches *steps* per mode
   (`text-brand-500` on light, `dark:text-brand-400` on dark), so one scale serves both modes
   — but 400 must stay light enough to read on the dark surface. Raise its L until it does.
   The ramp is therefore legibility-clamped at **both** ends, with two anchors: 500 (white)
   and 400 (dark).
5. **Interpolate the remaining 10 steps**, holding H and S, using the **existing Aaramva
   scale's lightness curve as the shape**. It is already hand-tuned and known-good, so rather
   than inventing targets we reuse its spacing: extract L for each of the 12 literals in
   `globals.css:92-103`, then piecewise-linearly rescale — steps lighter than the anchors map
   onto `[L_anchor, ~0.97]`, darker steps onto `[~0.04, L_anchor]`.
   - **Monotonic by construction** (each piece is a monotonic map between monotonic ranges),
     and asserted in tests regardless.
   - **Reduces to the Aaramva curve** when the anchors land where Aaramva's already sit —
     which is why `#1a8055` round-trips to itself at step 500.
   - Exact endpoint constants are calibrated during implementation against the §6 tests; the
     tests (monotonic + both contrast floors) are the contract, not the constants.

**Fidelity trade-off, stated plainly.** `--color-brand-500` is one variable serving
`bg-brand-500` (132 uses, a fill) and `text-brand-500` (94 uses, text on white). One variable
cannot be both `#FFD700` and `#6B5800`. A neon-yellow school therefore gets a dark-olive
panel, not a yellow one. Their exact hex still appears in the settings swatch, report cards,
and mobile's `--primary`. The alternative — splitting the token and sweeping ~146
`text-brand-*` usages including `dark:` variants — was considered and rejected as poor value
for colours schools essentially never choose.

### 3.6 First paint

A blocking `<script>` in `<head>` (`dangerouslySetInnerHTML`), the same trick `next-themes`
already uses in this app for dark mode:

1. Read `localStorage['tenant-slug']` — a key `store/tenant.store.ts:19-21` already maintains.
2. Read `localStorage['branding:<slug>']`.
3. Apply the **pre-computed** scale — 14 `setProperty` calls, **no colour maths before paint**.

Cache payload:

```jsonc
{ "v": 1, "source": "#1a8055", "fg": "#ffffff", "scale": { "25": "#…", /* … */ "950": "#…" } }
```

The **`v` version field is load-bearing**: if the ramp is ever retuned, stale caches would
otherwise repaint the old colours forever. A bump makes the script ignore them and fall back
to Aaramva for a single frame until `BrandingSync` recomputes.

Guards: wrap in `try/catch` (an uncaught throw here runs before React and would kill first
paint entirely), and skip when `location.pathname.startsWith('/super-admin')` — otherwise a
cached school's branding paints the platform console in one school's colour for a frame.

---

## 4. Failure posture & edge cases

**The rule: branding is cosmetic and must never break the app.** Every failure degrades to
Aaramva green — never a crash, never a blocked login.

| case | behaviour |
|---|---|
| `<head>` script throws | `try/catch` → Aaramva. It runs before React; an uncaught throw kills first paint |
| `localStorage` unavailable (private mode) | reads/writes no-op → branding arrives post-hydration, one flash |
| `primaryColor` `NULL` or unparseable | `deriveBrandScale` → `null` → no apply → Aaramva |
| `#abc` / `#aabbccdd` | expanded / alpha stripped (`@IsHexColor` permits both) |
| `verify` 429 (10/min/IP) | keep cache-or-default; **never** block the login form |
| `verify` 404 / school inactive | Aaramva |
| Logout | **slug retained** → `/login` stays school-branded, mirroring mobile. Only clearing the school resets |
| Impersonation | cache keyed by slug → no colour bleed between schools; `/super-admin` guard resets |
| Super-admin console | always Aaramva — it spans all schools, and it has its own `primaryColor` setting |

---

## 5. Repaint on save — the sharp edge

The tenant store is fed by `/auth/me`, which is **not** refetched after `PATCH /settings/profile`.
Left alone, a school changes its colour, saves successfully, and sees **nothing change until
the next login** — which reads as "the feature is broken".

So on successful profile update, the new `primaryColor` / `primaryForeground` / `logoUrl`
must be pushed into the tenant store. Three call sites:

- `app/(school)/settings/page.tsx` — `handleSave`
- `components/onboarding/branding-step.tsx` — colour + logo steps
- `POST /settings/branding/rederive` — the derive-from-logo path

This is the item most likely to be missed; it goes into the plan explicitly.

---

## 6. Testing

Baseline: **27 vitest tests, 4 files** (`npm test` → `vitest run`). Vitest runs in the
**node** environment — no config file, no jsdom, and all four existing suites are pure logic.
This design respects that rather than dragging jsdom in for one file: all real logic lives in
`scale.ts` (pure, tests perfectly in node), and `apply.ts` takes an injectable target so it
can be tested against a fake `style` object.

`lib/branding/__tests__/scale.test.ts`:

| case | assertion |
|---|---|
| `#1a8055` (current Aaramva) | `brand-500` returns **exactly** `#1a8055` — proves the "your green survives untouched" claim rather than asserting it |
| `#FFD700` (neon yellow) | `brand-500` clamped, contrast vs white ≥4.5, hue preserved within tolerance |
| `#7C1D3F` (maroon) | untouched |
| all 12 steps | lightness **strictly monotonic** 25→950 — a non-monotonic ramp looks broken even when every step individually passes |
| `brand-400` | legible against the dark surface (the other end of the clamp) |
| `#abc`, `#aabbccdd` | expanded / alpha stripped |
| `#808080`, `#FFFFFF`, `#000000` | do not throw |
| `''`, `'red'`, `'#GG0000'`, `null` | → `null`, never throws |

`lib/branding/__tests__/apply.test.ts`: applies 14 properties to an injected fake target;
`resetBrandScale` removes every one of them.

**Manual verification** (the design is not done until these are observed, not assumed):

1. `geetanjali-school-college` panel renders its logo and themes end-to-end.
2. Super-admin console stays Aaramva green.
3. `/login` is school-themed pre-auth.
4. Changing the colour in Settings repaints the panel **immediately**, without re-login.
5. A returning user's cold load shows no flash; first-ever visit flashes once.
6. `apps/api` suite unchanged; `apps/web` tsc clean.

---

## 7. Files touched

**New (5):** `lib/branding/{scale,apply,cache}.ts`,
`components/branding/{branding-sync,branding-script}.tsx`
**New tests (2):** `lib/branding/__tests__/{scale,apply}.test.ts`
**Edited (6):** `app/layout.tsx`, `store/tenant.store.ts`, `components/layout/sidebar.tsx`,
`app/(school)/settings/page.tsx`, `components/onboarding/branding-step.tsx`,
`apps/api/src/modules/auth/auth.service.ts`
**Docs:** `CLAUDE.md` — replace the "(Web's `#1a8055` reconciliation is out of scope.)" note.

Unchanged: all 79 `brand-*` consumer files, `app/globals.css` token literals,
`--chart-1..5`, `lib/attendance.ts` `STATUS_CONFIG`, `apps/mobile`.
