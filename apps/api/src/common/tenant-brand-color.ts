/**
 * BILL-8: the curated, print-tested-readable accent color set for billing
 * documents. Deliberately separate from Tenant.primaryColor (arbitrary,
 * logo-extracted, for the web UI's own color-ramp system) — print media has
 * no runtime contrast-ratio enforcement, so the set is pre-vetted instead of
 * accepting any hex. Tints are a fixed 88%-white mix per color (computed,
 * not hand-picked) rather than a general light-color algorithm, since there
 * are only 8 of them and a lookup stays exact and reviewable.
 */
export const DEFAULT_BILL_BRAND_COLOR = '#475569'; // slate — used when a tenant's brandColor is null

export const BILL_BRAND_TINTS: Readonly<Record<string, string>> = {
  '#475569': '#e9ebed', // slate
  '#0f6e56': '#e2eeeb', // green
  '#1e5aa8': '#e4ebf5', // blue
  '#9a2c2c': '#f3e6e6', // maroon
  '#6b3fa0': '#ede8f4', // purple
  '#b45309': '#f6eae1', // amber
  '#0e7490': '#e2eef2', // teal
  '#a1306e': '#f4e6ee', // rose
};

export const BILL_BRAND_COLORS: readonly string[] = Object.keys(BILL_BRAND_TINTS);

export interface ResolvedBrandColor {
  color: string;
  tint: string;
}

/** Validates a stored/candidate value against the curated set; null or an
 *  invalid value (e.g. manual DB tampering) falls back to the slate default
 *  rather than rendering with an unreviewed color. */
export function resolveBillBrandColor(stored: string | null | undefined): ResolvedBrandColor {
  const color = stored && BILL_BRAND_TINTS[stored] ? stored : DEFAULT_BILL_BRAND_COLOR;
  return { color, tint: BILL_BRAND_TINTS[color] };
}
