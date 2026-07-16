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

  it('never throws when the localStorage getter itself is blocked (Chrome "Block all cookies")', () => {
    const g = globalThis as { window?: unknown };
    const had = 'window' in g;
    const prev = g.window;
    // A window whose localStorage GETTER throws, as blocked-cookie Chrome does.
    g.window = Object.defineProperty({}, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
      configurable: true,
    });
    try {
      // NOTE: no explicit storage arg — this is the production call shape and the
      // only one that evaluates defaultStorage().
      expect(readBrandingCache('geetanjali')).toBeNull();
      expect(() => writeBrandingCache('geetanjali', ENTRY)).not.toThrow();
    } finally {
      if (had) g.window = prev;
      else delete g.window;
    }
  });
});
