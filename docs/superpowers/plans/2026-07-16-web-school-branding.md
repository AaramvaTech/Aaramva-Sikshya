# Web School Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the school panel render the school's uploaded logo (it currently crashes) and drive the whole admin-panel accent from the school's chosen colour.

**Architecture:** Tailwind v4's plain `@theme` block emits `--color-brand-*` as real custom properties on `:root`, and `.bg-brand-500` compiles to `var(--color-brand-500)`. Writing those 12 variables as **inline properties on `<html>`** outranks the stylesheet rule, so all 79 consumer files re-theme with zero edits and `globals.css` becomes the Aaramva fallback. The 12-step scale is derived **client-side** from the school's single hex, clamped for legibility at both ends.

**Tech Stack:** Next.js 16 (App Router, Turbopack), Tailwind v4, Zustand, TanStack Query, vitest (node env), NestJS + raw SQL on the API side.

**Spec:** `docs/superpowers/specs/2026-07-16-web-school-branding-design.md`

## Global Constraints

- **No DB migration, no new endpoint.** `primaryColor` / `primaryForeground` already exist on `public.tenants`.
- **Theming requires zero edits to the 79 `brand-*` consumer files**, and zero edits to the `globals.css` token literals. (This constrains the *theming mechanism* — it is not a freeze on those files. Task 1 edits `sidebar.tsx`, which is itself a `brand-*` consumer, for an unrelated logo fix. That is expected, not a violation.)
- **`apps/web` is self-contained** — its own lockfile, no cross-package imports, documented at `next.config.ts:5-7`. `packages/shared` is not reachable from here, so colour maths that also exists in `apps/api` cannot be shared and is duplicated deliberately.
- **Aaramva's default look must not change.** Variables are written only when a school is active.
- **Never break the app.** Branding is cosmetic; every failure path degrades to Aaramva green, never a crash and never a blocked login.
- **Contrast floors:** `brand-500` ≥ **4.5:1 vs `#FFFFFF`**; `brand-400` ≥ **4.5:1 vs `#101828`** (`--color-gray-900`, the dark surface the existing scale was tuned against — its `brand-400` measures 4.53:1 there).
- **Do not touch:** `--chart-1..5`, `lib/attendance.ts` `STATUS_CONFIG`, the super-admin console, `apps/mobile`.
- **`public.tenants` columns are TEXT + camelCase** (Prisma-managed) — always double-quote them in raw SQL, never `::uuid`-cast, never snake_case. (This bit MIG-3 and MAIL-1.)
- Verify web with `npx tsc --noEmit` (exit 0) and `npx vitest run` from `apps/web`.

---

### Task 1: Fix the sidebar logo crash

Self-contained and independently shippable — it stops a live crash and needs nothing from later tasks.

**Files:**
- Modify: `apps/web/components/layout/sidebar.tsx:210-217`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. (Later tasks feed `tenant.logoUrl`, which already exists.)

**Background:** `next/image` rejects any remote host absent from `images.remotePatterns`; `next.config.ts` has no `images` block, so every remote host is rejected. This is the only `next/image` in the app with a dynamic src. Five other sites already render this exact value with a plain `<img>` — this makes the sixth consistent.

- [ ] **Step 1: Verify the crash reproduces**

Start the API and web dev servers, then log into the school panel as `geetanjali-school-college` (its `logoUrl` is a MinIO URL).
Expected: the Next.js dev overlay shows `Invalid src prop (http://127.0.0.1:9000/…) on next/image, hostname "127.0.0.1" is not configured under images`.

If it does **not** reproduce, stop and check `SELECT slug, "logoUrl" FROM tenants WHERE slug = 'geetanjali-school-college';` — the fix is only meaningful against a URL-shaped logo.

- [ ] **Step 2: Replace the `next/image` with `<img>`**

In `apps/web/components/layout/sidebar.tsx`, replace lines 210-217:

```tsx
          {tenant.logoUrl ? (
            <Image
              src={tenant.logoUrl}
              alt={tenant.name ?? 'School'}
              width={36}
              height={36}
              className="rounded-lg object-contain flex-shrink-0"
            />
          ) : (
```

with:

```tsx
          {tenant.logoUrl ? (
            // A school logo is tenant data whose host is not knowable at build time
            // (MinIO in dev, R2/CDN in prod), so it cannot be allowlisted for next/image.
            // Matches the five other sites that render this same value.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logoUrl}
              alt={tenant.name ?? 'School'}
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg object-contain flex-shrink-0"
            />
          ) : (
```

Note the added `h-9 w-9`: `next/image` enforces the 36×36 box itself, a bare `<img>` does not — without it a non-square logo would blow out the sidebar header.

Leave the `/icon.png` fallback `<Image>` on lines 219-226 alone: it is a local static asset, so `next/image` is correct there and `priority` is worth keeping. The `Image` import therefore stays.

- [ ] **Step 3: Verify the fix in the browser**

Reload the `geetanjali-school-college` panel.
Expected: no error overlay; the school's logo renders in the sidebar at 36×36.

Then log in as a school with a base64 logo (`motherland-school`) and one with none (`demo`).
Expected: base64 logo renders; `demo` shows the `/icon.png` fallback. Neither regresses.

- [ ] **Step 4: Typecheck and lint**

```bash
cd apps/web && npx tsc --noEmit && npx eslint components/layout/sidebar.tsx
```
Expected: both exit 0. (`tsc` must not report an unused `Image` import — the fallback still uses it.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout/sidebar.tsx
git commit -m "fix(web): sidebar school logo crashed next/image on storage URLs

next/image rejects any remote host not in images.remotePatterns, and
next.config.ts has no images block. Pre-FILE-1 logos were base64 data: URIs,
which next/image passes through unoptimized without ever reaching the hostname
check; FILE-1 made school-logo a real storage URL, which does reach it. The
sidebar was the only next/image in the app with a dynamic src.

A tenant logo's host is not knowable at build time, so it cannot be
allowlisted. Use a plain <img>, matching the five other sites that already
render this exact value that way."
```

---

### Task 2: Serve `primaryColor` / `primaryForeground` from the API

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts:117-129` (login) and `:216-229` (`/auth/me`)
- Modify: `apps/api/src/modules/settings/settings.service.ts` (`PROFILE_SELECT` + `toProfileResponse`)
- Modify: `apps/web/types/api.types.ts:7-11` (`TenantInfo`) and `:1173+` (`SchoolProfile`)
- Test: `apps/api/src/modules/auth/__tests__/auth.service.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `tenant` payload on login and `/auth/me` gains two fields:
  ```ts
  tenant: { name: string; slug: string; logoUrl: string | null;
            primaryColor: string | null; primaryForeground: string | null }
  ```
  Task 6 consumes exactly these names. `GET /settings/profile` additionally gains
  `primaryForeground: string | null`, which Task 8 needs to repaint on save.

**Background:** both columns already exist on `public.tenants` and are already served publicly by `GET /tenants/verify/:slug`. The panel must **not** use `verify` — it is throttled 10/min per IP (`tenant.controller.ts:18-19`), so a school office behind one NAT would eat 429s. `/auth/me` is already called once per session and is not throttled.

- [ ] **Step 1: Confirm the columns and current payload**

```bash
psql -U postgres -h localhost -d aaramva_shikshya -c \
  'SELECT slug, "primaryColor", "primaryForeground" FROM tenants ORDER BY slug;'
```
Expected: the columns exist and `geetanjali-school-college` has a non-null `primaryColor`.

If `primaryColor` is null for every tenant, set one so later tasks have something to render:
```bash
psql -U postgres -h localhost -d aaramva_shikshya -c \
  "UPDATE tenants SET \"primaryColor\" = '#7C1D3F', \"primaryForeground\" = '#FFFFFF' WHERE slug = 'geetanjali-school-college';"
```

- [ ] **Step 2: Write the failing test**

Add to `apps/api/src/modules/auth/__tests__/auth.service.spec.ts`, inside the existing `login` describe block. Match the surrounding file's mocking style — read the neighbouring tests first and mirror how `tenantPrisma.query` is stubbed there.

```ts
it('returns the tenant branding colours on login', async () => {
  // The second tenantPrisma.query call in login() is the public.tenants SELECT.
  const result = await service.login(loginDto, 'web');

  expect(result.tenant).toEqual(
    expect.objectContaining({
      primaryColor: '#7C1D3F',
      primaryForeground: '#FFFFFF',
    }),
  );
});
```

Stub the tenants row to include `primaryColor: '#7C1D3F', primaryForeground: '#FFFFFF'` alongside the existing `name` / `logoUrl`.

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd apps/api && npm test -- auth.service.spec
```
Expected: FAIL — received `tenant` has no `primaryColor` key.

- [ ] **Step 4: Extend the login SELECT**

In `apps/api/src/modules/auth/auth.service.ts`, replace lines 117-120:

```ts
    const tenantRows = await this.tenantPrisma.query<{ name: string; logoUrl: string | null }>(
      `SELECT name, "logoUrl" FROM public.tenants WHERE id = $1`,
      ctx.tenantId,
    );
```

with:

```ts
    const tenantRows = await this.tenantPrisma.query<{
      name: string;
      logoUrl: string | null;
      primaryColor: string | null;
      primaryForeground: string | null;
    }>(
      `SELECT name, "logoUrl", "primaryColor", "primaryForeground"
       FROM public.tenants WHERE id = $1`,
      ctx.tenantId,
    );
```

and lines 125-129:

```ts
      tenant: {
        name: tenantRows[0]?.name ?? ctx.slug,
        slug: ctx.slug,
        logoUrl: tenantRows[0]?.logoUrl ?? null,
      },
```

with:

```ts
      tenant: {
        name: tenantRows[0]?.name ?? ctx.slug,
        slug: ctx.slug,
        logoUrl: tenantRows[0]?.logoUrl ?? null,
        primaryColor: tenantRows[0]?.primaryColor ?? null,
        primaryForeground: tenantRows[0]?.primaryForeground ?? null,
      },
```

- [ ] **Step 5: Extend the `/auth/me` SELECT**

In the same file, replace lines 216-228:

```ts
    let tenant: { name: string; slug: string; logoUrl: string | null } | null = null;
    if (user.tenantId) {
      const tenantRows = await this.tenantPrisma.query<{ name: string; logoUrl: string | null }>(
        `SELECT name, "logoUrl" FROM public.tenants WHERE id = $1`,
        user.tenantId,
      );
      if (tenantRows[0]) {
        tenant = {
          name: tenantRows[0].name,
          slug: user.tenantSlug ?? '',
          logoUrl: tenantRows[0].logoUrl,
        };
      }
    }
```

with:

```ts
    let tenant: {
      name: string;
      slug: string;
      logoUrl: string | null;
      primaryColor: string | null;
      primaryForeground: string | null;
    } | null = null;
    if (user.tenantId) {
      const tenantRows = await this.tenantPrisma.query<{
        name: string;
        logoUrl: string | null;
        primaryColor: string | null;
        primaryForeground: string | null;
      }>(
        `SELECT name, "logoUrl", "primaryColor", "primaryForeground"
         FROM public.tenants WHERE id = $1`,
        user.tenantId,
      );
      if (tenantRows[0]) {
        tenant = {
          name: tenantRows[0].name,
          slug: user.tenantSlug ?? '',
          logoUrl: tenantRows[0].logoUrl,
          primaryColor: tenantRows[0].primaryColor,
          primaryForeground: tenantRows[0].primaryForeground,
        };
      }
    }
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd apps/api && npm test -- auth.service.spec
```
Expected: PASS.

- [ ] **Step 7: Run the full API suite for regressions**

```bash
cd apps/api && npm test
```
Expected: the whole suite passes. Any existing test asserting the exact shape of `tenant` with `toEqual` (not `objectContaining`) will now fail on the two new keys — update those assertions to include them rather than loosening the matcher.

- [ ] **Step 8: ~~Expose `primaryForeground` on `GET /settings/profile`~~ — NO-OP, already shipped**

**This step was written on a false premise and requires no code.** It claimed `PROFILE_SELECT`
never selects `"primaryForeground"` and `toProfileResponse` never maps it. Both are in fact
present — `settings.service.ts:60` (mapper) and `:78` (select) — added by commit `575f092`.
The plan author read truncated line-windows that stopped short of both lines and concluded
absence from a partial view.

Verify and move on:

```bash
cd apps/api && grep -n "primaryForeground\|primary_foreground" src/modules/settings/settings.service.ts
```
Expected: hits at the `TenantProfileRow` type, the mapper, and `PROFILE_SELECT`. If so, make
**no change** to this file. Only the web-side `SchoolProfile` type is genuinely missing the
field — that is Step 9.

- [ ] **Step 9: Update the web types**

In `apps/web/types/api.types.ts`, replace lines 7-11:

```ts
export interface TenantInfo {
  name: string;
  slug: string;
  logoUrl: string | null;
}
```

with:

```ts
export interface TenantInfo {
  name: string;
  slug: string;
  logoUrl: string | null;
  /** BRAND-1: the school's chosen accent; null => Aaramva default. */
  primaryColor: string | null;
  /** BRAND-1: server-computed readable ink for primaryColor (#FFFFFF or #0B1220). */
  primaryForeground: string | null;
}
```

Then in the same file, add to `SchoolProfile` (around line 1178, next to its existing
non-nullable `primaryColor: string`):

```ts
  /** BRAND-1: server-computed readable ink for primaryColor. */
  primaryForeground: string | null;
```

- [ ] **Step 10: Verify live**

With the API running, log in and inspect the response:

```bash
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -H 'X-Tenant-Slug: geetanjali-school-college' \
  -d '{"email":"<owner-email>","password":"<password>"}' | jq '.data.tenant'
```
Expected: the JSON includes `primaryColor` and `primaryForeground`.

Then check the profile endpoint too, reusing the `accessToken` from that login:

```bash
curl -s http://localhost:3001/api/v1/settings/profile \
  -H 'X-Tenant-Slug: geetanjali-school-college' \
  -H "Authorization: Bearer <accessToken>" | jq '.data | {primaryColor, primaryForeground}'
```
Expected: both fields present and non-null.

- [ ] **Step 11: Typecheck web and commit**

```bash
cd apps/web && npx tsc --noEmit
```
Expected: exit 0. (`TenantInfo` is only constructed from API responses and `Partial<TenantInfo>` in the store, so widening it should not break call sites. If a literal object assignment breaks, add the two fields as `null` there.)

```bash
git add apps/api/src/modules/auth/auth.service.ts \
        apps/api/src/modules/auth/__tests__/auth.service.spec.ts \
        apps/api/src/modules/settings/settings.service.ts \
        apps/web/types/api.types.ts
git commit -m "feat(brand-1): serve tenant primaryColor/primaryForeground to the web

Both columns already exist on public.tenants and are already public via
/tenants/verify/:slug. The panel cannot use verify — it is throttled 10/min per
IP, so a school office behind one NAT would 429 on ordinary page loads.
/auth/me is already called once per session and is not throttled.

GET /settings/profile selected primaryColor but never primaryForeground, so the
settings page had no foreground to repaint with; select and map it."
```

---

### Task 3: `lib/branding/scale.ts` — the colour maths

The heart of the feature. Pure functions, no React, no DOM — tests perfectly in vitest's node environment.

**Files:**
- Create: `apps/web/lib/branding/scale.ts`
- Test: `apps/web/lib/branding/__tests__/scale.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export const BRAND_STEPS: readonly [25,50,100,200,300,400,500,600,700,800,900,950];
  export type BrandStep = (typeof BRAND_STEPS)[number];
  export type BrandScale = Record<BrandStep, string>;   // step -> '#rrggbb'
  export function deriveBrandScale(input: string | null | undefined): BrandScale | null;
  export function contrastRatio(hexA: string, hexB: string): number;
  export const DARK_SURFACE = '#101828';
  ```
  Tasks 4, 5 and 6 import `BrandScale`, `BRAND_STEPS` and `deriveBrandScale`.

**Design notes the implementer must not re-litigate:**

- The ramp **shape** is taken from the existing hand-tuned Aaramva scale (`globals.css:92-103`) rather than invented. Both the lightness curve and the *saturation ratios* are reused, so a school's scale is as carefully shaped as Aaramva's.
- Both halves of the ramp are affine maps that **reduce to the identity** when the anchor lands where Aaramva's already sits. That is why `#1a8055` reproduces itself — it is a property of the construction, not a coincidence.
- When the 500 clamp does **not** fire, return the caller's hex **verbatim** rather than round-tripping through HSL. Float round-tripping would return `#1a8054`-style near-misses and break the exactness test for no benefit.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/branding/__tests__/scale.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  deriveBrandScale,
  contrastRatio,
  BRAND_STEPS,
  DARK_SURFACE,
} from '../scale';

const AARAMVA = '#1a8055';
const MAROON = '#7C1D3F';
const NEON_YELLOW = '#FFD700';

// Lightness of an #rrggbb, matching the HSL definition used by the module.
function lightnessOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

describe('deriveBrandScale', () => {
  it('returns Aaramva green unchanged at step 500 — it already passes 4.93:1 on white', () => {
    expect(contrastRatio(AARAMVA, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(deriveBrandScale(AARAMVA)![500]).toBe(AARAMVA);
  });

  // REGRESSION GUARD (a real bug shipped without this): the MIN_ANCHOR_L floor
  // must not rewrite dark colours that are already legible. At floor 0.12,
  // #001a33 (17.56:1 vs white) came back as #001f3d. Every other exactness
  // fixture sits above the floor, so nothing else catches this.
  it.each(['#001a33', '#003318'])('keeps the dark-but-legible %s exact at step 500', (hex) => {
    expect(contrastRatio(hex, '#FFFFFF')).toBeGreaterThan(4.5);
    expect(deriveBrandScale(hex)![500]).toBe(hex);
  });

  it('leaves a maroon untouched at step 500 — 9.98:1 on white', () => {
    // normaliseHex lowercases, so compare against the lowercased input —
    // otherwise this fails on case alone and tells you nothing.
    expect(deriveBrandScale(MAROON)![500]).toBe(MAROON.toLowerCase());
  });

  it('clamps neon yellow, which fails white at 1.40:1', () => {
    expect(contrastRatio(NEON_YELLOW, '#FFFFFF')).toBeLessThan(4.5);
    const step500 = deriveBrandScale(NEON_YELLOW)![500];
    // Compare lowercased: `.not.toBe(NEON_YELLOW)` would pass on casing alone
    // even if the clamp never fired, which would make this a fake test.
    expect(step500).not.toBe(NEON_YELLOW.toLowerCase());
    expect(contrastRatio(step500, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it.each([AARAMVA, MAROON, NEON_YELLOW, '#2563EB', '#808080'])(
    'keeps step 500 legible on white for %s',
    (hex) => {
      expect(contrastRatio(deriveBrandScale(hex)![500], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([AARAMVA, MAROON, NEON_YELLOW, '#2563EB', '#808080'])(
    'keeps step 400 legible on the dark surface for %s',
    (hex) => {
      expect(contrastRatio(deriveBrandScale(hex)![400], DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([AARAMVA, MAROON, NEON_YELLOW, '#2563EB', '#808080', '#000000', '#FFFFFF'])(
    'produces a strictly monotonic lightness ramp for %s',
    (hex) => {
      const scale = deriveBrandScale(hex)!;
      const ls = BRAND_STEPS.map((s) => lightnessOf(scale[s]));
      for (let i = 1; i < ls.length; i++) {
        expect(ls[i]).toBeLessThan(ls[i - 1]);
      }
    },
  );

  it('returns all 12 steps as #rrggbb', () => {
    const scale = deriveBrandScale(AARAMVA)!;
    expect(Object.keys(scale)).toHaveLength(12);
    for (const step of BRAND_STEPS) {
      expect(scale[step]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('expands 3-digit shorthand (@IsHexColor permits it)', () => {
    expect(deriveBrandScale('#0a5')).toEqual(deriveBrandScale('#00aa55'));
  });

  it('strips an alpha channel (@IsHexColor permits #rrggbbaa)', () => {
    expect(deriveBrandScale('#1a8055ff')).toEqual(deriveBrandScale('#1a8055'));
  });

  it.each(['#FFFFFF', '#000000', '#808080'])('does not throw on the extreme %s', (hex) => {
    expect(() => deriveBrandScale(hex)).not.toThrow();
    expect(deriveBrandScale(hex)).not.toBeNull();
  });

  it.each(['', 'red', '#GG0000', '#12345', 'rgb(1,2,3)', null, undefined])(
    'returns null (never throws) for unparseable input %s',
    (bad) => {
      expect(deriveBrandScale(bad as string)).toBeNull();
    },
  );
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('is 1:1 for a colour against itself', () => {
    expect(contrastRatio(AARAMVA, AARAMVA)).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio(AARAMVA, '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', AARAMVA), 5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && npx vitest run lib/branding/__tests__/scale.test.ts
```
Expected: FAIL — `Failed to resolve import "../scale"`.

- [ ] **Step 3: Implement `scale.ts`**

Create `apps/web/lib/branding/scale.ts`:

```ts
/**
 * BRAND-1 — derives the 12-step `--color-brand-*` ramp from a school's single
 * accent colour.
 *
 * The ramp SHAPE (lightness curve + saturation ratios) is lifted from the
 * hand-tuned Aaramva scale in app/globals.css:92-103 rather than invented, and
 * both halves are affine maps that reduce to the identity when the anchor lands
 * where Aaramva's already sits — which is why #1a8055 reproduces itself.
 *
 * Two legibility anchors, because one variable serves both fills and text:
 *   - step 500 >= 4.5:1 vs #FFFFFF     (text-brand-500 on white, AND white text
 *                                       on a bg-brand-500 fill — one constraint
 *                                       solves both directions)
 *   - step 400 >= 4.5:1 vs #101828     (dark:text-brand-400 on gray-900)
 *
 * Both are no-ops for Aaramva green (4.93:1 and 4.53:1 respectively), and for
 * essentially every colour a school actually picks. They only bite on pastels
 * and neons.
 *
 * This duplicates maths that apps/api has in branding-color.service.ts. That is
 * forced, not sloppy: next.config.ts documents this app as self-contained with
 * no cross-package imports. The two also answer different questions — the API's
 * derives ONE colour from a logo's pixels, this derives a presentation ramp from
 * one colour.
 */

export const BRAND_STEPS = [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type BrandStep = (typeof BRAND_STEPS)[number];
export type BrandScale = Record<BrandStep, string>;

/** --color-gray-900. The surface the existing scale was tuned against: its
 *  brand-400 measures 4.53:1 here, and only 3.76:1 on gray-800. */
export const DARK_SURFACE = '#101828';

const WHITE = '#FFFFFF';
const MIN_CONTRAST = 4.5;

/** The dark half is scaled proportionally off step 500, so an anchor at L≈0
 *  (a school picking pure black) would collapse steps 600-950 onto the same
 *  black and break strict monotonicity — there is no room below zero. This
 *  floor exists ONLY to prevent that degenerate collapse, and is deliberately
 *  low: raising it silently rewrites ordinary dark brand colours that were
 *  already perfectly legible. At 0.12, #001a33 navy (17.56:1 vs white!) came
 *  back as #001f3d. Keep it just above the degenerate band. */
const MIN_ANCHOR_L = 0.04;

/** Measured from the Aaramva literals: L per step, and S as a ratio of S(500). */
const CURVE: Record<BrandStep, { l: number; sRatio: number }> = {
  25: { l: 0.9608, sRatio: 0.755 },
  50: { l: 0.9039, sRatio: 0.648 },
  100: { l: 0.8059, sRatio: 0.656 },
  200: { l: 0.6863, sRatio: 0.604 },
  300: { l: 0.5157, sRatio: 0.508 },
  400: { l: 0.3745, sRatio: 0.783 },
  500: { l: 0.302, sRatio: 1 },
  600: { l: 0.2373, sRatio: 0.837 },
  700: { l: 0.198, sRatio: 0.882 },
  800: { l: 0.1451, sRatio: 0.899 },
  900: { l: 0.0902, sRatio: 0.92 },
  950: { l: 0.0431, sRatio: 0.961 },
};

const L_ANCHOR = CURVE[500].l;
const L_LIGHTEST = CURVE[25].l;

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** '#abc' | '#aabbccdd' | '#aabbcc' -> '#aabbcc' (lowercase), or null. */
export function normaliseHex(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim().toLowerCase();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(raw)) return null;
  let body = raw.slice(1);
  if (body.length === 3 || body.length === 4) {
    body = body
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return `#${body.slice(0, 6)}`; // drop alpha
}

function toRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function rgbToHsl(hex: string): [number, number, number] {
  const [r, g, b] = toRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  const to = (v: number) =>
    Math.round(clamp01(v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}

/** Lower L until the colour reads on white. Returns the original L untouched
 *  when it already passes — the common case. */
function anchorForWhite(h: number, s: number, l: number): number {
  let x = l;
  while (x > 0 && contrastRatio(hslToHex(h, s, x), WHITE) < MIN_CONTRAST) {
    x -= 0.005;
  }
  return Math.max(x, 0);
}

/** Raise L until the colour reads on the dark surface. */
function anchorForDark(h: number, s: number, l: number): number {
  let x = l;
  while (x < 1 && contrastRatio(hslToHex(h, s, x), DARK_SURFACE) < MIN_CONTRAST) {
    x += 0.005;
  }
  return Math.min(x, 1);
}

export function deriveBrandScale(input: string | null | undefined): BrandScale | null {
  const hex = normaliseHex(input);
  if (!hex) return null;

  const [h, s, lRaw] = rgbToHsl(hex);
  const l500 = Math.max(anchorForWhite(h, s, lRaw), MIN_ANCHOR_L);
  const clampFired = l500 !== lRaw;

  const lightSpan = L_LIGHTEST - L_ANCHOR;
  const scale = {} as BrandScale;

  for (const step of BRAND_STEPS) {
    const { l: la, sRatio } = CURVE[step];
    // Dark half scales proportionally; light half maps [L_ANCHOR, L_LIGHTEST]
    // onto [l500, L_LIGHTEST]. Both are the identity when l500 === L_ANCHOR.
    const l =
      step >= 500
        ? l500 * (la / L_ANCHOR)
        : l500 + ((la - L_ANCHOR) * (L_LIGHTEST - l500)) / lightSpan;
    scale[step] = hslToHex(h, clamp01(s * sRatio), clamp01(l));
  }

  // Exactness: when the clamp never fired, hand back the caller's own hex rather
  // than an HSL round-trip that would drift by a digit.
  if (!clampFired) scale[500] = hex;

  // Dark-mode floor on 400, then restore strict monotonicity across the light
  // half (25..300 must each stay lighter than the step below them).
  const s400 = clamp01(s * CURVE[400].sRatio);
  const l400 = anchorForDark(h, s400, rgbToHsl(scale[400])[2]);
  scale[400] = hslToHex(h, s400, l400);

  const lightSteps: BrandStep[] = [300, 200, 100, 50, 25];
  let floor = l400;
  for (const step of lightSteps) {
    const sStep = clamp01(s * CURVE[step].sRatio);
    const lStep = rgbToHsl(scale[step])[2];
    const lifted = Math.max(lStep, Math.min(floor + 0.02, 1));
    scale[step] = hslToHex(h, sStep, lifted);
    floor = lifted;
  }

  return scale;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/web && npx vitest run lib/branding/__tests__/scale.test.ts
```
Expected: PASS, all cases.

If the monotonic test fails for an extreme input, the fix is in the lift pass at the end of `deriveBrandScale` (raise the `+ 0.02` separation), **not** in loosening the assertion. If the exactness test fails, check `normaliseHex` is lowercasing and that `clampFired` compares against the same `lRaw` fed to `anchorForWhite`.

- [ ] **Step 5: Typecheck and commit**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
```
Expected: `tsc` exits 0; the full suite is 27 + the new cases, all passing.

```bash
git add apps/web/lib/branding/scale.ts apps/web/lib/branding/__tests__/scale.test.ts
git commit -m "feat(brand-1): derive a legibility-clamped 12-step brand ramp from one hex

Reuses the hand-tuned Aaramva curve (globals.css:92-103) as the ramp shape
rather than inventing targets, so both halves reduce to the identity when the
anchor lands where Aaramva's sits — which is why #1a8055 reproduces itself
exactly at step 500.

Two anchors, because --color-brand-500 is one variable serving 132 fills and 94
text usages: >=4.5:1 vs white (which covers text-on-white AND white-on-fill in
one constraint) and >=4.5:1 vs gray-900 for dark:text-brand-400. Both are
no-ops for the colours schools actually pick."
```

---

### Task 4: `lib/branding/apply.ts` — the DOM writes

**Files:**
- Create: `apps/web/lib/branding/apply.ts`
- Test: `apps/web/lib/branding/__tests__/apply.test.ts`

**Interfaces:**
- Consumes: `BrandScale`, `BRAND_STEPS` from `./scale` (Task 3).
- Produces:
  ```ts
  export interface StyleTarget {
    style: { setProperty(k: string, v: string): void; removeProperty(k: string): void };
  }
  export function applyBrandScale(scale: BrandScale, foreground: string | null, target?: StyleTarget | null): void;
  export function resetBrandScale(target?: StyleTarget | null): void;
  export function brandProperties(scale: BrandScale, foreground: string | null): Array<[string, string]>;
  ```
  Task 6 calls `applyBrandScale` / `resetBrandScale`; Task 7 reuses the same property names in the inline script.

**Why the injectable target:** vitest here runs in the **node** environment (no config file, no jsdom, and all existing suites are pure logic). Rather than pull jsdom in for one file, the target is a parameter defaulting to `document.documentElement`, so tests pass a fake.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/branding/__tests__/apply.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyBrandScale, resetBrandScale, brandProperties } from '../apply';
import { deriveBrandScale } from '../scale';

function fakeTarget() {
  const props = new Map<string, string>();
  return {
    props,
    style: {
      setProperty: (k: string, v: string) => void props.set(k, v),
      removeProperty: (k: string) => void props.delete(k),
    },
  };
}

const SCALE = deriveBrandScale('#7C1D3F')!;

describe('applyBrandScale', () => {
  it('writes all 12 brand steps plus --primary and --primary-foreground', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, '#FFFFFF', t);
    expect(t.props.size).toBe(14);
    expect(t.props.get('--color-brand-500')).toBe(SCALE[500]);
    expect(t.props.get('--color-brand-25')).toBe(SCALE[25]);
    expect(t.props.get('--color-brand-950')).toBe(SCALE[950]);
    expect(t.props.get('--primary')).toBe(SCALE[500]);
    expect(t.props.get('--primary-foreground')).toBe('#FFFFFF');
  });

  it('falls back to white ink when the server sent no foreground', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, null, t);
    expect(t.props.get('--primary-foreground')).toBe('#FFFFFF');
  });

  it('is a no-op when there is no target (SSR)', () => {
    expect(() => applyBrandScale(SCALE, '#FFFFFF', null)).not.toThrow();
  });
});

describe('resetBrandScale', () => {
  it('removes every property applyBrandScale set', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, '#FFFFFF', t);
    resetBrandScale(t);
    expect(t.props.size).toBe(0);
  });

  it('is a no-op when there is no target (SSR)', () => {
    expect(() => resetBrandScale(null)).not.toThrow();
  });
});

describe('brandProperties', () => {
  it('names every property with the --color-brand- prefix Tailwind emits', () => {
    const keys = brandProperties(SCALE, '#FFFFFF').map(([k]) => k);
    expect(keys).toContain('--color-brand-500');
    expect(keys.filter((k) => k.startsWith('--color-brand-'))).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && npx vitest run lib/branding/__tests__/apply.test.ts
```
Expected: FAIL — `Failed to resolve import "../apply"`.

- [ ] **Step 3: Implement `apply.ts`**

Create `apps/web/lib/branding/apply.ts`:

```ts
/**
 * BRAND-1 — the only module that touches the DOM.
 *
 * Tailwind v4's plain @theme block (globals.css:92-103) emits --color-brand-* as
 * real custom properties on :root, and .bg-brand-500 compiles to
 * var(--color-brand-500). An INLINE property on <html> outranks that :root rule,
 * so writing these 14 values re-themes all 79 consumer files with zero edits —
 * and removing them lets the globals.css literals resume as the Aaramva default.
 */
import { BRAND_STEPS, type BrandScale } from './scale';

export interface StyleTarget {
  style: {
    setProperty(key: string, value: string): void;
    removeProperty(key: string): void;
  };
}

const DEFAULT_FOREGROUND = '#FFFFFF';

function defaultTarget(): StyleTarget | null {
  return typeof document === 'undefined' ? null : document.documentElement;
}

/** The exact (property, value) pairs branding owns. Task 7's inline script
 *  writes the same names — keep them in lockstep. */
export function brandProperties(
  scale: BrandScale,
  foreground: string | null,
): Array<[string, string]> {
  const pairs: Array<[string, string]> = BRAND_STEPS.map((step) => [
    `--color-brand-${step}`,
    scale[step],
  ]);
  // shadcn's runtime tokens — only ~5 files use these, but they must not
  // disagree with the brand scale sitting next to them.
  pairs.push(['--primary', scale[500]]);
  pairs.push(['--primary-foreground', foreground ?? DEFAULT_FOREGROUND]);
  return pairs;
}

export function applyBrandScale(
  scale: BrandScale,
  foreground: string | null,
  target: StyleTarget | null = defaultTarget(),
): void {
  if (!target) return;
  for (const [key, value] of brandProperties(scale, foreground)) {
    target.style.setProperty(key, value);
  }
}

export function resetBrandScale(target: StyleTarget | null = defaultTarget()): void {
  if (!target) return;
  for (const step of BRAND_STEPS) {
    target.style.removeProperty(`--color-brand-${step}`);
  }
  target.style.removeProperty('--primary');
  target.style.removeProperty('--primary-foreground');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/web && npx vitest run lib/branding/__tests__/apply.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/lib/branding/apply.ts apps/web/lib/branding/__tests__/apply.test.ts
git commit -m "feat(brand-1): apply/reset the brand scale as inline vars on <html>

Inline properties outrank the :root rule Tailwind emits from @theme, so these 14
values re-theme all 79 brand-* consumer files with zero edits, and removing them
restores the globals.css literals as the Aaramva default.

The target element is injectable so this tests in vitest's node environment
without dragging jsdom in for one file."
```

---

### Task 5: `lib/branding/cache.ts` — the pre-paint cache

**Files:**
- Create: `apps/web/lib/branding/cache.ts`
- Test: `apps/web/lib/branding/__tests__/cache.test.ts`

**Interfaces:**
- Consumes: `BrandScale` from `./scale` (Task 3).
- Produces:
  ```ts
  export const BRANDING_CACHE_VERSION = 1;
  export interface CachedBranding { v: number; source: string; fg: string | null; scale: BrandScale }
  export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
  export function brandingCacheKey(slug: string): string;
  export function readBrandingCache(slug: string, storage?: StorageLike | null): CachedBranding | null;
  export function writeBrandingCache(slug: string, entry: CachedBranding, storage?: StorageLike | null): void;
  ```
  Task 6 reads/writes the cache; Task 7's inline script reads the same key and shape.

**Why the version field is load-bearing:** if the ramp is ever retuned, stale caches would repaint the old colours before every paint, forever. A bump makes both the script and `readBrandingCache` reject them and fall back to Aaramva for one frame until `BrandingSync` recomputes.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/branding/__tests__/cache.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  readBrandingCache,
  writeBrandingCache,
  brandingCacheKey,
  BRANDING_CACHE_VERSION,
  type CachedBranding,
} from '../cache';
import { deriveBrandScale } from '../scale';

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const ENTRY: CachedBranding = {
  v: BRANDING_CACHE_VERSION,
  source: '#7C1D3F',
  fg: '#FFFFFF',
  scale: deriveBrandScale('#7C1D3F')!,
};

describe('branding cache', () => {
  it('round-trips an entry', () => {
    const s = fakeStorage();
    writeBrandingCache('geetanjali', ENTRY, s);
    expect(readBrandingCache('geetanjali', s)).toEqual(ENTRY);
  });

  it('keys by slug so schools cannot bleed into each other', () => {
    const s = fakeStorage();
    writeBrandingCache('geetanjali', ENTRY, s);
    expect(readBrandingCache('motherland', s)).toBeNull();
    expect(brandingCacheKey('geetanjali')).not.toBe(brandingCacheKey('motherland'));
  });

  it('rejects an entry from an older scale version', () => {
    const s = fakeStorage({
      [brandingCacheKey('geetanjali')]: JSON.stringify({ ...ENTRY, v: BRANDING_CACHE_VERSION - 1 }),
    });
    expect(readBrandingCache('geetanjali', s)).toBeNull();
  });

  it('returns null on malformed JSON instead of throwing', () => {
    const s = fakeStorage({ [brandingCacheKey('geetanjali')]: '{ not json' });
    expect(() => readBrandingCache('geetanjali', s)).not.toThrow();
    expect(readBrandingCache('geetanjali', s)).toBeNull();
  });

  it('returns null when the entry is missing its scale', () => {
    const s = fakeStorage({
      [brandingCacheKey('geetanjali')]: JSON.stringify({ v: BRANDING_CACHE_VERSION, source: '#fff' }),
    });
    expect(readBrandingCache('geetanjali', s)).toBeNull();
  });

  // REGRESSION GUARD (a real bug shipped without this): every other test passes an
  // explicit fake `storage`, so none of them ever evaluate defaultStorage() — which
  // is exactly why the escape below went unnoticed. This one must use the DEFAULT
  // path, because that is the production call shape.
  it('never throws when the localStorage getter itself is blocked (Chrome "Block all cookies")', () => {
    const g = globalThis as { window?: unknown };
    const had = 'window' in g;
    const prev = g.window;
    g.window = Object.defineProperty({}, 'localStorage', {
      get() { throw new Error('SecurityError'); },
      configurable: true,
    });
    try {
      expect(readBrandingCache('geetanjali')).toBeNull();
      expect(() => writeBrandingCache('geetanjali', ENTRY)).not.toThrow();
    } finally {
      if (had) g.window = prev; else delete g.window;
    }
  });

  it('never throws when storage is unavailable (private mode)', () => {
    const hostile = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(readBrandingCache('geetanjali', hostile)).toBeNull();
    expect(() => writeBrandingCache('geetanjali', ENTRY, hostile)).not.toThrow();
  });

  it('is a no-op when there is no storage (SSR)', () => {
    expect(readBrandingCache('geetanjali', null)).toBeNull();
    expect(() => writeBrandingCache('geetanjali', ENTRY, null)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/web && npx vitest run lib/branding/__tests__/cache.test.ts
```
Expected: FAIL — `Failed to resolve import "../cache"`.

- [ ] **Step 3: Implement `cache.ts`**

Create `apps/web/lib/branding/cache.ts`:

```ts
/**
 * BRAND-1 — caches the COMPUTED scale so the pre-paint script in
 * components/branding/branding-script.tsx can apply it with zero colour maths.
 *
 * Keyed by slug: impersonating another school must not inherit the previous
 * school's colours.
 */
import type { BrandScale } from './scale';

/** Bump whenever deriveBrandScale changes shape or tuning, or every cached
 *  entry would repaint the OLD colours before paint, forever. */
export const BRANDING_CACHE_VERSION = 1;

export interface CachedBranding {
  v: number;
  source: string;
  fg: string | null;
  scale: BrandScale;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function brandingCacheKey(slug: string): string {
  return `branding:${slug}`;
}

function defaultStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Not paranoia: `window.localStorage` is a GETTER that throws SecurityError
    // outright under Chrome's "Block all cookies", in sandboxed iframes, and
    // under some storage-partitioning policies — before any method is called.
    // This runs as a default-parameter expression, i.e. OUTSIDE the try/catch in
    // the function bodies below, so it MUST guard itself or the throw escapes
    // uncaught out of readBrandingCache/writeBrandingCache — which is the
    // production call shape (no explicit storage arg).
    return null;
  }
}

export function readBrandingCache(
  slug: string,
  storage: StorageLike | null = defaultStorage(),
): CachedBranding | null {
  if (!storage || !slug) return null;
  try {
    const raw = storage.getItem(brandingCacheKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedBranding>;
    if (parsed?.v !== BRANDING_CACHE_VERSION) return null;
    if (!parsed.scale || typeof parsed.scale !== 'object') return null;
    if (typeof parsed.source !== 'string') return null;
    return parsed as CachedBranding;
  } catch {
    // Malformed JSON, or storage disabled in private mode. Branding is
    // cosmetic — degrade to Aaramva, never throw.
    return null;
  }
}

export function writeBrandingCache(
  slug: string,
  entry: CachedBranding,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage || !slug) return;
  try {
    storage.setItem(brandingCacheKey(slug), JSON.stringify(entry));
  } catch {
    // Quota exceeded or storage disabled — the app still themes post-hydration.
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/web && npx vitest run lib/branding/__tests__/cache.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd apps/web && npx tsc --noEmit
git add apps/web/lib/branding/cache.ts apps/web/lib/branding/__tests__/cache.test.ts
git commit -m "feat(brand-1): cache the computed brand scale, keyed by slug and versioned

Stores the finished scale so the pre-paint script needs no colour maths. Keyed
by slug so impersonation cannot bleed colours between schools. The version field
is load-bearing: without it, retuning the ramp would leave every cached entry
repainting the old colours before paint, forever.

Every failure path returns null rather than throwing — branding is cosmetic."
```

---

### Task 6: Wire the panel — tenant store + `BrandingSync`

First task where theming is visible in the browser.

**Files:**
- Modify: `apps/web/store/tenant.store.ts`
- Create: `apps/web/components/branding/branding-sync.tsx`
- Modify: `apps/web/app/providers.tsx` (mount `<BrandingSync />`)

**Interfaces:**
- Consumes: `TenantInfo` (Task 2), `deriveBrandScale` (Task 3), `applyBrandScale` / `resetBrandScale` (Task 4), `readBrandingCache` / `writeBrandingCache` / `BRANDING_CACHE_VERSION` (Task 5).
- Produces: `useTenantStore` state gains `primaryColor: string | null` and `primaryForeground: string | null`. Task 8 sets them via the existing `setTenant`.

- [ ] **Step 1: Extend the tenant store**

In `apps/web/store/tenant.store.ts`, replace the whole file:

```ts
import { create } from 'zustand';
import type { TenantInfo } from '@/types/api.types';

interface TenantState {
  slug: string | null;
  name: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  primaryForeground: string | null;
  setTenant: (tenant: Partial<TenantInfo>) => void;
  clear: () => void;
}

const storedSlug = typeof window !== 'undefined' ? localStorage.getItem('tenant-slug') : null;

export const useTenantStore = create<TenantState>((set) => ({
  slug: storedSlug,
  name: null,
  logoUrl: null,
  primaryColor: null,
  primaryForeground: null,
  setTenant: (t) => {
    if (t.slug && typeof window !== 'undefined') {
      localStorage.setItem('tenant-slug', t.slug);
    }
    set({
      slug: t.slug ?? null,
      name: t.name ?? null,
      logoUrl: t.logoUrl ?? null,
      primaryColor: t.primaryColor ?? null,
      primaryForeground: t.primaryForeground ?? null,
    });
  },
  clear: () => {
    if (typeof window !== 'undefined') localStorage.removeItem('tenant-slug');
    set({ slug: null, name: null, logoUrl: null, primaryColor: null, primaryForeground: null });
  },
}));
```

> **Careful:** `setTenant` overwrites every field from a `Partial`, so existing callers that pass only `{ slug }` (`providers.tsx:117,139`) already null the name — that is pre-existing behaviour, and the two new fields follow the same rule. Task 8 depends on the settings page passing the colour explicitly.

- [ ] **Step 2: Create `BrandingSync`**

Create `apps/web/components/branding/branding-sync.tsx`:

```tsx
'use client';

/**
 * BRAND-1 — drives the theming engine from the active tenant, mirroring
 * apps/mobile/components/ThemeSync.tsx.
 *
 * Two feeds:
 *   - authed panel  -> the tenant store, filled by /auth/me (not throttled)
 *   - (auth) pages  -> GET /tenants/verify/:slug (public; 10/min per IP, which
 *                      is why the panel does NOT use it)
 *
 * Renders nothing.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTenantStore } from '@/store/tenant.store';
import { rawApi } from '@/lib/api';
import { deriveBrandScale } from '@/lib/branding/scale';
import { applyBrandScale, resetBrandScale } from '@/lib/branding/apply';
import { writeBrandingCache, BRANDING_CACHE_VERSION } from '@/lib/branding/cache';

interface VerifyData {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  primaryForeground: string | null;
}

function paint(slug: string, color: string | null, fg: string | null): void {
  const scale = deriveBrandScale(color);
  if (!scale) {
    // No colour, or one we cannot parse -> Aaramva.
    resetBrandScale();
    return;
  }
  applyBrandScale(scale, fg);
  writeBrandingCache(slug, { v: BRANDING_CACHE_VERSION, source: color!, fg, scale });
}

export function BrandingSync() {
  const pathname = usePathname();
  const accessToken = useAuthStore((s) => s.accessToken);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const slug = useTenantStore((s) => s.slug);
  const primaryColor = useTenantStore((s) => s.primaryColor);
  const primaryForeground = useTenantStore((s) => s.primaryForeground);

  // The platform console spans every school, so no single school's colour
  // applies. Keep it Aaramva.
  const isPlatform = pathname?.startsWith('/super-admin') ?? false;

  useEffect(() => {
    if (isPlatform || !slug) {
      resetBrandScale();
      return;
    }
    // Auth state is still unknown (cold-load boot window, before
    // SessionRestorer's /auth/refresh -> /auth/me round-trip settles):
    // accessToken reads null here regardless of whether the user is actually
    // authed, so we cannot yet tell "logged out, use verify" apart from
    // "authed, verify is off-limits". Do nothing and leave the pre-paint
    // script's cached branding on screen until isInitialized flips true —
    // every SessionRestorer path terminates by setting it.
    if (!isInitialized) {
      return;
    }
    if (primaryColor) {
      paint(slug, primaryColor, primaryForeground);
      return;
    }
    // Authed panel, tenant has no custom colour (e.g. `demo`, and 4 of 7
    // tenants in dev) -> Aaramva locally. A live access token means /auth/me
    // ALREADY answered the colour question (null == "no branding"), so do not
    // also ask the throttled verify endpoint. Without this gate every authed
    // load for an unbranded school hits verify — the exact thing this
    // component exists to avoid.
    if (accessToken) {
      resetBrandScale();
      return;
    }

    // Logged out on an (auth) page: the store has a slug but no colour yet.
    let cancelled = false;
    rawApi
      .get<{ success: boolean; data: VerifyData }>(`/tenants/verify/${slug}`)
      .then((res) => {
        if (cancelled) return;
        const d = res.data.data;
        paint(slug, d.primaryColor, d.primaryForeground);
      })
      .catch(() => {
        // 429 (throttled), 404 (unknown school), offline — keep whatever the
        // pre-paint script applied. Never block the login form.
      });
    return () => {
      cancelled = true;
    };
  }, [isPlatform, slug, primaryColor, primaryForeground, accessToken, isInitialized]);

  return null;
}
```

Import `useAuthStore` from `@/store/auth.store` alongside the tenant store.

- [ ] **Step 3: Mount it**

In `apps/web/app/providers.tsx`, add the import next to the other component imports:

```tsx
import { BrandingSync } from '@/components/branding/branding-sync';
```

and render it beside `<SessionRestorer />` (it must sit inside `SidebarProvider`/`QueryClientProvider` so it is a client component in the same tree):

```tsx
        <QueryClientProvider client={queryClient}>
          <SessionRestorer />
          <BrandingSync />
          {children}
          <Toaster />
        </QueryClientProvider>
```

- [ ] **Step 4: Verify in the browser**

```bash
cd apps/web && npx tsc --noEmit && npm run dev
```

1. Log into `geetanjali-school-college`. Expected: the sidebar, buttons, active nav and links all render in the school's colour, not `#1a8055`.
2. In devtools, inspect `<html>`. Expected: 14 inline custom properties, `--color-brand-500` among them.
3. Navigate to `/super-admin/login` in the same tab. Expected: the inline properties are gone and the console is Aaramva green.
4. Log in as `demo` (no `primaryColor`). Expected: Aaramva green, no inline properties.
5. Open `/login?tenant=geetanjali-school-college` logged out. Expected: school-themed (via `verify`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/store/tenant.store.ts apps/web/components/branding/branding-sync.tsx apps/web/app/providers.tsx
git commit -m "feat(brand-1): drive the panel theme from the active tenant

Mirrors mobile's ThemeSync. The authed panel reads the colour from the tenant
store (filled by /auth/me); (auth) pages fall back to the public
/tenants/verify/:slug. The super-admin console always resets to Aaramva — it
spans every school, so no single school's colour applies.

Every failure path (429, 404, offline, unparseable colour) degrades to Aaramva
and never blocks the login form."
```

---

### Task 7: First paint — the pre-paint script

**Files:**
- Create: `apps/web/components/branding/branding-script.tsx`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Consumes: `BRAND_STEPS` from `@/lib/branding/scale` (Task 3), `BRANDING_CACHE_VERSION` and `brandingCacheKey` from `@/lib/branding/cache` (Task 5).
- Produces: nothing.

**The script text is import-free, but the component is not.** This is a **server** component, so its imports are evaluated at render time on the server and their values are interpolated into the emitted string — the browser still receives a self-contained script with no module loading, but the step list, the cache key and the version are the *same constants* `lib/branding` uses and cannot drift from them.

**Placement — a deliberate deviation from the spec.** The spec says `<head>`. Implement it as the **first child of `<body>`** instead. `next/script` with `strategy="beforeInteractive"` is documented as *"execution does not block page hydration"* (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md:71`) and is aimed at `src`-based scripts, which is not the anti-FOUC guarantee we need. The proven pattern — used by `next-themes`, already a dependency here and already doing exactly this for dark mode — is a raw `<script dangerouslySetInnerHTML>` with `suppressHydrationWarning`, rendered in the tree and executed synchronously during HTML parse. First child of `<body>` runs before any content paints.

- [ ] **Step 1: Create the script component**

Create `apps/web/components/branding/branding-script.tsx`:

```tsx
/**
 * BRAND-1 — applies the cached brand scale BEFORE first paint, so a returning
 * user never sees Aaramva green flash to their school's colour.
 *
 * Server component: this must land in the SSR'd HTML and execute during parse.
 * Same technique next-themes already uses in this app for dark mode (a raw
 * <script> + suppressHydrationWarning), rather than next/script
 * beforeInteractive, whose execution explicitly does not block hydration.
 *
 * The emitted SCRIPT text is import-free (it runs before any bundle loads), but
 * this component is a server component — so the constants below are evaluated at
 * render time and interpolated in. They are the same values lib/branding uses and
 * cannot drift from them.
 */
import { BRAND_STEPS } from '@/lib/branding/scale';
import { BRANDING_CACHE_VERSION, brandingCacheKey } from '@/lib/branding/cache';

// brandingCacheKey('') yields the bare 'branding:' prefix, which the script
// concatenates with the slug it reads — same key shape as lib/branding/cache.ts.
const KEY_PREFIX = JSON.stringify(brandingCacheKey(''));

// Reads the finished scale from the cache — no colour maths before paint.
const SCRIPT = `(function(){try{
if(location.pathname.indexOf('/super-admin')===0)return;
var slug=localStorage.getItem('tenant-slug');if(!slug)return;
var raw=localStorage.getItem(${KEY_PREFIX}+slug);if(!raw)return;
var b=JSON.parse(raw);if(!b||b.v!==${BRANDING_CACHE_VERSION}||!b.scale)return;
var el=document.documentElement;
var steps=${JSON.stringify(BRAND_STEPS)};
for(var i=0;i<steps.length;i++){var v=b.scale[steps[i]];if(v)el.style.setProperty('--color-brand-'+steps[i],v);}
if(b.scale[500])el.style.setProperty('--primary',b.scale[500]);
el.style.setProperty('--primary-foreground',b.fg||'#FFFFFF');
}catch(e){}})();`;

export function BrandingScript() {
  // The try/catch above is not optional: this runs before React, so an uncaught
  // throw here kills first paint for the whole app.
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
```

- [ ] **Step 2: Mount it as the first child of `<body>`**

In `apps/web/app/layout.tsx`, add the import:

```tsx
import { BrandingScript } from '@/components/branding/branding-script';
```

and replace the `<body>` block:

```tsx
      <body>
        <Providers>{children}</Providers>
      </body>
```

with:

```tsx
      <body>
        <BrandingScript />
        <Providers>{children}</Providers>
      </body>
```

- [ ] **Step 3: Verify the constants really interpolated**

The interpolation is what stops the script drifting from `lib/branding`, so confirm it happened
rather than assuming. With the dev server running, view source on any page:

```bash
curl -s http://localhost:3000/login | grep -o "b.v!==[0-9]*" | head -1
```
Expected: `b.v!==1` — the literal value of `BRANDING_CACHE_VERSION`, baked in at render.

If it renders as `b.v!==NaN` or the raw text `${BRANDING_CACHE_VERSION}`, the import is not
resolving — check that `branding-script.tsx` has **no** `'use client'` directive (a client
component would not evaluate these at render time on the server).

- [ ] **Step 4: Verify no-flash in the browser**

```bash
cd apps/web && npx tsc --noEmit && npm run dev
```

1. Log into `geetanjali-school-college`, then hard-reload (Ctrl+Shift+R). Expected: **no green flash** — the panel is school-coloured from the first frame.
2. Devtools → Application → Local Storage. Expected: a `branding:geetanjali-school-college` key holding `{v:1,source,fg,scale}`.
3. Delete that key and reload. Expected: exactly one flash (Aaramva → school), and the key is rewritten.
4. Navigate to `/super-admin/login` and hard-reload. Expected: Aaramva green with **no** flash of school colour.
5. Devtools → Application → Local Storage → block storage (or use a private window). Expected: the app still loads and still themes after hydration. No crash.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/branding/branding-script.tsx apps/web/app/layout.tsx
git commit -m "feat(brand-1): apply cached branding before first paint

A returning user should never watch Aaramva green flash to their school's
colour. The cache holds the finished scale, so the script only reads and
applies — no colour maths before paint.

Rendered as a raw <script> at the top of <body> (the next-themes pattern this
app already uses for dark mode) rather than next/script beforeInteractive, whose
execution explicitly does not block hydration. The try/catch is load-bearing: it
runs before React, so an uncaught throw would kill first paint entirely."
```

---

### Task 8: Repaint on save

Without this the feature reads as broken: the tenant store is fed by `/auth/me`, which is **not** refetched after `PATCH /settings/profile`. A school would change its colour, save successfully, and see nothing until the next login.

**Files:**
- Modify: `apps/web/app/(school)/settings/page.tsx` (`handleSave`, around lines 109-112)
- Modify: `apps/web/components/onboarding/branding-step.tsx`

**Interfaces:**
- Consumes: `useTenantStore().setTenant` (Task 6), `SchoolProfile` from `@/types/api.types`.
- Produces: nothing.

- [ ] **Step 1: Confirm the bug exists**

With Task 6 in place, log into `geetanjali-school-college`, go to Settings, change the primary colour, save.
Expected (the bug): the toast says "School profile updated" but the panel does **not** repaint. Reloading also does not help until re-login, because the pre-paint cache still holds the old colour.

- [ ] **Step 2: Push the saved branding into the tenant store (settings)**

In `apps/web/app/(school)/settings/page.tsx`, add to the imports:

```tsx
import { useTenantStore } from '@/store/tenant.store';
```

Inside `SettingsPage`, next to the existing hooks:

```tsx
  const { slug, setTenant } = useTenantStore();
```

Then in `handleSave`, replace:

```tsx
      await update.mutateAsync(payload);
      toast.success('School profile updated');
      setEditing(false);
      setPendingFiles({});
```

with:

```tsx
      const res = await update.mutateAsync(payload);
      // `useUpdateSchoolProfile`'s mutationFn returns settingsApi.updateProfile(data)
      // — the RAW axios response, not an unwrapped body. ResponseInterceptor wraps
      // as { success, data }, so the profile is at .data.data (the codebase's
      // documented "simple list -> .data.data" rule).
      const saved = res.data.data;
      // The tenant store is fed by /auth/me, which is not refetched here — so
      // without this the panel keeps the old branding until the next login.
      // BrandingSync repaints (and rewrites the pre-paint cache) off this.
      setTenant({
        slug: slug ?? undefined,
        name: saved.name,
        logoUrl: saved.logoUrl,
        primaryColor: saved.primaryColor,
        primaryForeground: saved.primaryForeground,
      });
      toast.success('School profile updated');
      setEditing(false);
      setPendingFiles({});
```

> **Do not "fix" the hook to unwrap.** `settingsApi.updateProfile` returning the raw axios
> response is the established shape here and `useSchoolProfile`'s other consumers rely on it.
> Unwrap at this call site only. `saved.primaryForeground` exists because Task 2 Step 8 added
> it to both the API response and the `SchoolProfile` type.

- [ ] **Step 3: Do the same in the onboarding branding step**

In `apps/web/components/onboarding/branding-step.tsx`, add:

```tsx
import { useTenantStore } from '@/store/tenant.store';
```

and inside `BrandingStep`:

```tsx
  const { slug, setTenant } = useTenantStore();
```

Add this helper inside the component, above the save handlers:

```tsx
  // Same reason as the settings page: the tenant store is fed by /auth/me, which
  // is not refetched here, so a saved colour would otherwise stay invisible.
  function syncTenantBranding(res: Awaited<ReturnType<typeof update.mutateAsync>>) {
    const saved = res.data.data;
    setTenant({
      slug: slug ?? undefined,
      name: saved.name,
      logoUrl: saved.logoUrl,
      primaryColor: saved.primaryColor,
      primaryForeground: saved.primaryForeground,
    });
  }
```

Then at **both** save sites, capture the result and pass it through. The colour save (around
line 74) becomes:

```tsx
      syncTenantBranding(await update.mutateAsync({ primaryColor: manualColor }));
```

and the logo save (around line 48) becomes:

```tsx
      syncTenantBranding(
        await update.mutateAsync(
          uploaded.mode === 'key' ? { logoFileKey: uploaded.key } : { logoUrl: uploaded.dataUrl },
        ),
      );
```

This also covers `POST /settings/branding/rederive`: its server-derived colour comes back on
the very next profile response, so any save that follows a rederive carries it into the store.

- [ ] **Step 4: Verify the repaint**

1. Settings → change the primary colour → Save. Expected: the panel repaints **immediately**, no reload.
2. Hard-reload. Expected: the new colour is there from the first frame (the cache was rewritten).
3. Upload a new logo in Settings. Expected: the sidebar logo updates immediately.
4. Onboarding branding step → pick a colour → Expected: immediate repaint.

- [ ] **Step 5: Commit**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run
git add apps/web/app/\(school\)/settings/page.tsx apps/web/components/onboarding/branding-step.tsx
git commit -m "feat(brand-1): repaint the panel the moment branding is saved

The tenant store is fed by /auth/me, which is not refetched after PATCH
/settings/profile — so a school would change its colour, save successfully, and
see nothing change until the next login. Push the saved branding into the store
so BrandingSync repaints and rewrites the pre-paint cache."
```

---

### Task 9: Documentation and full verification

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: everything.
- Produces: nothing.

- [ ] **Step 1: Correct the stale scope note**

In `CLAUDE.md`, find the note reading `(Web's `#1a8055` reconciliation is out of scope.)` in the mobile theming section and replace it with:

```
  (BRAND-1: web now derives its full `--color-brand-*` ramp from the same
  per-school `primaryColor`, so `#1a8055` is the Aaramva default only.)
```

- [ ] **Step 2: Add the BRAND-1 entry to "What's built so far"**

Append to the checklist, matching the surrounding entries' style:

```
- [x] Per-school web branding (BRAND-1, `docs/superpowers/specs/2026-07-16-web-school-branding-design.md`)
  — **the logo fix:** `sidebar.tsx` was the only `next/image` in the app with a dynamic src;
  FILE-1 turned school logos from base64 `data:` URIs (which next/image passes through
  unoptimized, never reaching the hostname check) into real storage URLs (which do), so the
  panel crashed for any school with a post-FILE-1 logo. Now a plain `<img>`, matching the five
  sites that already did. **The theming:** `/auth/login` + `/auth/me` now return
  `primaryColor`/`primaryForeground` (2 columns onto existing SELECTs — no migration, and NOT
  via `/tenants/verify`, which is throttled 10/min per IP). `lib/branding/scale.ts` derives the
  12-step ramp client-side, reusing the hand-tuned Aaramva curve as its shape and clamping at
  both ends (500 >= 4.5:1 vs white — one constraint covering both `text-brand-500` on white and
  white ink on a `bg-brand-500` fill; 400 >= 4.5:1 vs gray-900 `#101828`, the surface the
  original scale was tuned against at 4.53:1). `apply.ts` writes 14 inline vars on `<html>`,
  which outrank Tailwind's `@theme` `:root` rule — **all 79 `brand-*` consumer files re-theme
  with zero edits**, and Aaramva's look cannot regress because vars are written only when a
  school is active. Pre-paint `<script>` at the top of `<body>` (the next-themes pattern; NOT
  `next/script` beforeInteractive, whose execution doesn't block hydration) applies the cached
  scale — `branding:<slug>`, versioned, keyed by slug so impersonation can't bleed colours.
  **GOTCHA:** the tenant store is fed by `/auth/me`, which is not refetched after
  `PATCH /settings/profile` — Settings and onboarding must push saved branding into the store or
  a colour change is invisible until re-login. Super-admin console and `--chart-1..5` /
  `STATUS_CONFIG` stay Aaramva by design. **Known limit:** `--color-brand-500` is one variable
  serving 132 fills and 94 text usages, so an extreme pick (neon yellow) darkens for legibility
  rather than rendering vivid — the exact hex still shows in the settings swatch, report cards
  and mobile.
```

- [ ] **Step 3: Run every gate**

```bash
cd apps/web && npx tsc --noEmit && npx vitest run && npx eslint .
cd ../api && npm test
```
Expected: `tsc` exits 0; web vitest is 27 + the new branding cases, all green; eslint clean; the API suite passes with no drop from its pre-task baseline.

- [ ] **Step 4: Walk the full manual matrix**

Every row must be **observed**, not assumed:

| # | Scenario | Expected |
|---|---|---|
| 1 | `geetanjali-school-college` panel | logo renders; whole panel in the school's colour |
| 2 | Hard-reload that panel | no flash — school colour on the first frame |
| 3 | Clear `branding:<slug>` then reload | exactly one flash, then cached again |
| 4 | `/super-admin/*` | Aaramva green, no flash of school colour |
| 5 | `/login?tenant=geetanjali-school-college`, logged out | school-themed pre-auth |
| 6 | Settings → change colour → Save | repaints immediately, no reload |
| 7 | `demo` (null `primaryColor`) | Aaramva green, no inline vars on `<html>` |
| 8 | `motherland-school` (base64 logo) | logo still renders — no FILE-1 regression |
| 9 | Dashboard weekly-attendance bar | follows the school colour (single-series accent, by design) |
| 10 | Dashboard attendance status colours | still PRESENT-green / ABSENT-red / LATE-amber / LEAVE-blue |
| 11 | Dark mode, school theme | `dark:text-brand-400` readable on dark cards |
| 12 | Private window | loads and themes post-hydration; no crash |

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(brand-1): record per-school web branding

Reverses the 'Web's #1a8055 reconciliation is out of scope' note — web now
derives its full brand ramp from the same per-school primaryColor mobile uses."
```

---

## Notes for the implementer

**Discovered during planning, deliberately out of scope — do not fix here:**

`dark:bg-boxdark` appears in **83 files**, but `boxdark` is not defined in `app/globals.css`, which is the only CSS file in the app. In Tailwind v4 an undefined token generates no utility, so those classes are almost certainly dead and those surfaces fall back to whatever their parent paints. This predates BRAND-1 and is unrelated to it, but it is worth a separate look — it also means the dark surface under `dark:text-brand-400` is not always the `#101828` the ramp is clamped against. Raise it as its own ticket; do not widen this plan.
