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

/** The dark half is scaled proportionally off step 500, so an anchor at L=0
 *  (a school picking pure black) would collapse steps 600-950 to identical
 *  black and break strict monotonicity — there is simply no room below zero.
 *  This floor exists ONLY to stop that degenerate near-zero collapse, not to
 *  push ordinary dark colours around. It must stay low: `anchorForWhite`
 *  already lowers L when a colour actually fails 4.5:1 on white, so anything
 *  landing above this floor on its own (e.g. dark navy, dark forest green —
 *  both routinely >14:1 on white) needs no correction at all. A floor as high
 *  as 0.12 was raising plenty of already-legible dark colours, silently
 *  replacing the school's exact hex (see scale.test.ts). 0.04 is enough
 *  headroom for the L=0 case — 950 lands at ~0.006 — without reaching into
 *  legitimate dark brand colours. */
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
