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
