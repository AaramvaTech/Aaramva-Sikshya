import { create } from 'zustand';
import { i18n } from '@/lib/i18n';

/**
 * WEB-P Phase 1 Task 3 — locale preference store. Mirrors the shape/
 * conventions of `tenant.store.ts` (Zustand, persisted to localStorage at the
 * `'locale'` key, read back at module load the same way `tenant.store.ts`
 * reads `storedSlug`). This is a UI preference, not a secret or token, so
 * localStorage is fine here — unlike the access-token rule.
 *
 * NOTE: the `'locale'` key must stay in sync with `lib/i18n/index.ts`'s
 * `LOCALE_STORAGE_KEY` — that module reads it directly (rather than
 * importing this store) to avoid a circular import, since this store needs
 * to import the `i18n` singleton to call `changeLanguage`.
 */
export type Locale = 'en' | 'np';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LOCALE_KEY = 'locale';

function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(LOCALE_KEY);
  return raw === 'en' || raw === 'np' ? raw : null;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: readStoredLocale() ?? 'en',
  setLocale: (locale) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCALE_KEY, locale);
    }
    i18n.changeLanguage(locale);
    set({ locale });
  },
}));
