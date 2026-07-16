/**
 * BRAND-1 — the only module that touches the DOM.
 *
 * Tailwind v4's plain @theme block (globals.css:92-103) emits --color-brand-* as
 * real custom properties on :root, and .bg-brand-500 compiles to
 * var(--color-brand-500). An INLINE property on <html> outranks that :root rule,
 * so writing these values re-themes all 79 consumer files with zero edits —
 * and removing them lets the globals.css literals resume as the Aaramva default.
 *
 * --primary/--primary-foreground and --accent/--accent-foreground/--ring are
 * THEME-DEPENDENT (final review, BRAND-1 close-out):
 *   - .dark flips --primary to a near-white fill + dark ink (shadcn's dark
 *     convention). An inline override that ignores this forces a *dark*
 *     scale[500] fill in dark mode too — invisible against the dark
 *     background (measured down to 1.13:1 on some brand colours). --primary
 *     therefore mirrors the 79 brand-* files' own light/dark split: scale[500]
 *     in light, scale[400] in dark (the ramp's own dark-surface-safe anchor).
 *   - --accent/--accent-foreground/--ring are byte-identical to Aaramva green
 *     in :root today, so an unbranded school sees no diff, but a branded
 *     school got green dropdown hovers/focus rings alongside its branded
 *     buttons. .dark already overrides all three to neutral greys (chroma 0),
 *     which is already correct — so these three are LIGHT-MODE ONLY.
 */
import { BRAND_STEPS, contrastRatio, type BrandScale } from './scale';

export interface StyleTarget {
  style: {
    setProperty(key: string, value: string): void;
    removeProperty(key: string): void;
  };
}

export type ThemeMode = 'light' | 'dark';

const DEFAULT_FOREGROUND = '#FFFFFF';
/** Ink for a dark-mode --primary fill that itself fails 4.5:1 against white
 *  (only reachable for unusually light brand colours whose scale[400] is
 *  already very light). Matches globals.css .dark's near-black card surfaces. */
const DARK_INK_FALLBACK = '#0B1220';

function defaultTarget(): StyleTarget | null {
  return typeof document === 'undefined' ? null : document.documentElement;
}

/** --primary / --primary-foreground for the given theme. Task 7's inline
 *  script never writes these (see branding-script.tsx) — it can't know the
 *  theme pre-paint, so it leaves them at the CSS default for one frame. */
function primaryProperties(
  scale: BrandScale,
  foreground: string | null,
  theme: ThemeMode,
): Array<[string, string]> {
  if (theme === 'dark') {
    const fg =
      contrastRatio(scale[400], DEFAULT_FOREGROUND) >= 4.5
        ? DEFAULT_FOREGROUND
        : DARK_INK_FALLBACK;
    return [
      ['--primary', scale[400]],
      ['--primary-foreground', fg],
    ];
  }
  return [
    ['--primary', scale[500]],
    ['--primary-foreground', foreground ?? DEFAULT_FOREGROUND],
  ];
}

/** --accent / --accent-foreground / --ring — light mode only; see module
 *  docblock. .dark's own neutral greys stand untouched. */
function accentRingProperties(scale: BrandScale, theme: ThemeMode): Array<[string, string]> {
  if (theme === 'dark') return [];
  return [
    ['--accent', scale[50]],
    ['--accent-foreground', scale[500]],
    ['--ring', scale[500]],
  ];
}

/** The exact (property, value) pairs branding owns for one theme. */
export function brandProperties(
  scale: BrandScale,
  foreground: string | null,
  theme: ThemeMode = 'light',
): Array<[string, string]> {
  const pairs: Array<[string, string]> = BRAND_STEPS.map((step) => [
    `--color-brand-${step}`,
    scale[step],
  ]);
  pairs.push(...primaryProperties(scale, foreground, theme));
  pairs.push(...accentRingProperties(scale, theme));
  return pairs;
}

/** Every key EITHER theme can ever write, derived from brandProperties itself
 *  (not hand-listed a second time — that drift is what caused this bug) so
 *  resetBrandScale can never miss a key one theme writes and the other
 *  doesn't. Values are irrelevant here; only the key set is used. */
const PLACEHOLDER_SCALE: BrandScale = Object.fromEntries(
  BRAND_STEPS.map((step) => [step, '#000000']),
) as BrandScale;

const ALL_KEYS: readonly string[] = Array.from(
  new Set([
    ...brandProperties(PLACEHOLDER_SCALE, null, 'light').map(([k]) => k),
    ...brandProperties(PLACEHOLDER_SCALE, null, 'dark').map(([k]) => k),
  ]),
);

export function applyBrandScale(
  scale: BrandScale,
  foreground: string | null,
  theme: ThemeMode = 'light',
  target: StyleTarget | null = defaultTarget(),
): void {
  if (!target) return;
  // Remove-then-set: the write set differs per theme (dark skips accent/ring
  // entirely), so a stale light-mode key must not survive into dark — it
  // would keep outranking .dark's own rule. Stays synchronous: one frame.
  resetBrandScale(target);
  for (const [key, value] of brandProperties(scale, foreground, theme)) {
    target.style.setProperty(key, value);
  }
}

export function resetBrandScale(target: StyleTarget | null = defaultTarget()): void {
  if (!target) return;
  for (const key of ALL_KEYS) {
    target.style.removeProperty(key);
  }
}
