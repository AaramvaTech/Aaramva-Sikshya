# Claude Code Prompt — Session: Logo-Driven Theme Color

Copy everything below the line into Claude Code, started from the monorepo root.
Backend feature. The mobile app needs only a tiny follow-up tweak (see end).

---

We are adding **automatic theme-color extraction from a school's logo** to Aaramva Shikshya. When a school's logo is set or changed, the backend derives a usable primary brand color from it, normalizes it for contrast/usability, stores it, and serves it through the existing public branding endpoint. The mobile app already consumes `primaryColor`, so the theme follows the logo with no client work beyond a one-line foreground tweak.

Use subagent-driven development.

## Step 0 — Read and REPORT before changing anything

1. `CLAUDE.md` — conventions and memory.
2. Find where a school's **logo is uploaded/set** (likely super-admin tenant provisioning and/or a school-admin settings endpoint). Report the route(s), the storage location of the logo file/URL, and the table/record that holds tenant branding (name, logo).
3. Report where the **public branding** that `GET /public/schools/:code` (or `/tenants/verify`) reads from is stored. In a schema-per-tenant setup this must live in the central/registry schema (queryable by slug before any tenant context), not inside a tenant schema. Confirm which schema/table.
4. Report whether `node-vibrant` and an image decoder are already installed.

Report the above, then proceed.

## Decisions already made (do not re-litigate)

- Extraction happens **once on the backend at logo upload**, never on the client.
- The raw dominant color is **not** used directly — it is normalized into a UI-safe band, and a contrast-safe foreground is computed.
- Auto-extraction is the default; a manual admin override exists and is respected (`colorSource` flag).
- Color is stored in the **central/registry branding record** alongside slug, name, logoUrl, so the public pre-login endpoint can serve it.

## Build tasks

### 1. Dependency

Install `node-vibrant` (v4). Node import is `import { Vibrant } from 'node-vibrant/node'`. It accepts a `Buffer`. If a separate decoder is needed in this environment, confirm and add it via the project's normal install path.

### 2. Color derivation service

Create a service (e.g. `BrandingColorService`) with a pure function `deriveThemeFromLogo(buffer: Buffer)`:

```ts
import { Vibrant } from 'node-vibrant/node';

const SWATCH_PRIORITY = ['Vibrant', 'DarkVibrant', 'LightVibrant', 'Muted', 'DarkMuted'] as const;

export async function deriveThemeFromLogo(buffer: Buffer) {
  const palette = await Vibrant.from(buffer).getPalette();
  const swatch = SWATCH_PRIORITY.map((k) => palette[k]).find(Boolean);
  if (!swatch) return null; // monochrome / no usable color -> caller uses Aaramva default

  let [h, s, l] = swatch.getHsl(); // h,s,l each in 0..1

  // Normalize for use as a primary ACTION color, keeping the school's hue:
  l = clamp(l, 0.32, 0.46);  // not washed out, not near-black
  s = clamp(s, 0.45, 0.85);  // reads as a real color, avoids neon

  const primaryColor = hslToHex(h, s, l);                 // e.g. "#1D4ED8"
  const primaryForeground =
    contrastRatio(primaryColor, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0B1220';

  return {
    primaryColor,
    primaryForeground,
    rawSwatch: swatch.hex,
    palette: Object.fromEntries(
      Object.entries(palette).filter(([, sw]) => sw).map(([k, sw]) => [k, sw!.hex]),
    ),
  };
}
```

Implement the helpers (or use a small color lib): `clamp(v, lo, hi)`; `hslToHex(h, s, l)` (h,s,l in 0..1); `relativeLuminance(hex)` and `contrastRatio(a, b)` per the WCAG 2.x formula. Keep the function pure and unit-test it (see task 5).

### 3. Wire into logo upload

- When a logo is created or replaced: read the image buffer, run `deriveThemeFromLogo`.
  - If it returns a result **and** the record's `colorSource !== 'manual'`: store `primaryColor`, `primaryForeground`, set `colorSource = 'auto'`, optionally persist `logoPalette` (the hex map) for the override UI.
  - If it returns `null`: leave the Aaramva default (`primaryColor = null` → client falls back to its built-in default).
- This may run inline (fast for one logo) or as a BullMQ job if you prefer to keep upload responses snappy — match the existing job pattern if you go that route.

### 4. Admin override + serving

4.1 Add/extend an endpoint for an admin to set the color manually (color picker value): store `primaryColor` + recompute `primaryForeground` from it, set `colorSource = 'manual'`. A future logo change must NOT overwrite a `manual` color unless the admin explicitly re-runs extraction (add a "re-derive from logo" action that clears the flag).

4.2 Extend the **public branding response** to include both fields:
```json
{ "success": true, "data": {
  "slug": "...", "name": "...", "nameNp": "...", "logoUrl": "...",
  "primaryColor": "#1D4ED8", "primaryForeground": "#FFFFFF",
  "enabledModules": [ ... ]
}}
```
`primaryColor`/`primaryForeground` may be `null` when no usable color exists — clients fall back to the Aaramva default.

### 5. Migration + tests

5.1 Add the columns to the central branding record: `primaryColor` (nullable), `primaryForeground` (nullable), `colorSource` (`'auto' | 'manual'`, default `'auto'`), optional `logoPalette` (json, nullable).

5.2 Unit-test `deriveThemeFromLogo` and the contrast helper with fixture logos:
- a saturated blue logo → blue-family primary, white foreground;
- a pale yellow logo → normalized darker yellow, **dark** foreground (contrast guard fires);
- a black-and-white logo → returns `null` (falls back to default).

## Acceptance criteria

- Uploading a colored logo populates `primaryColor` + `primaryForeground` on the branding record with `colorSource = 'auto'`.
- The public branding endpoint returns both fields.
- A manual override sets `colorSource = 'manual'` and survives a subsequent logo re-upload.
- The pale-yellow fixture yields a dark foreground (proves the contrast guard); the monochrome fixture yields `null`.
- Existing tests still pass.

## Report back

Files changed, the migration, the three fixture test results (extracted hex + chosen foreground), and confirmation of where branding is stored in the central schema.

---

## Mobile follow-up (tiny — fold into the M2 login or token-migration session)

In `lib/theme/provider.tsx`, apply the served foreground too:

```ts
const style = useMemo(() => {
  if (!branding?.primaryColor) return undefined; // Aaramva default
  return vars({
    '--primary': hexToRgbChannels(branding.primaryColor),
    '--primary-foreground': hexToRgbChannels(branding.primaryForeground ?? '#FFFFFF'),
  });
}, [branding]);
```

Add `primaryForeground?: string` to the `Branding` type, and pass it through from the branding fetch. Nothing else changes — `text-primary-foreground` is already used on primary surfaces, so readable text-on-brand now works for every school automatically.
