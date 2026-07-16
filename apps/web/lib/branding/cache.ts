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
    // the function bodies below, so it must guard itself or the throw escapes.
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
