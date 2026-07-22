import { describe, it, expect, vi, afterEach } from 'vitest';
import { i18n } from '@/lib/i18n';
import { useLocaleStore } from '../locale.store';

// WEB-P Phase 1 Task 3 — store logic only (no component render), matching
// the style of apps/web/lib/branding/__tests__/*.test.ts.

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe('locale store', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('updates the store state and switches the i18next instance language', () => {
    const spy = vi.spyOn(i18n, 'changeLanguage');

    useLocaleStore.getState().setLocale('np');

    expect(useLocaleStore.getState().locale).toBe('np');
    expect(spy).toHaveBeenCalledWith('np');
    expect(i18n.language).toBe('np');
  });

  it('persists the choice to localStorage under the "locale" key', () => {
    const storage = fakeStorage();
    // Guard is `typeof window !== 'undefined'`, but the read/write itself is
    // the bare `localStorage` global (matching tenant.store.ts's existing
    // convention) — stub both, as a real browser provides both pointing at
    // the same object.
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', storage);
    vi.spyOn(i18n, 'changeLanguage');

    useLocaleStore.getState().setLocale('en');

    expect(storage.getItem('locale')).toBe('en');
  });

  it('does not touch localStorage when window is unavailable (SSR)', () => {
    vi.stubGlobal('window', undefined);
    vi.spyOn(i18n, 'changeLanguage');

    expect(() => useLocaleStore.getState().setLocale('np')).not.toThrow();
    expect(useLocaleStore.getState().locale).toBe('np');
  });
});
