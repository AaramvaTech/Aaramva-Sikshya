import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/common.json';
import np from './locales/np/common.json';

/**
 * WEB-P Phase 1 Task 3 — web i18n singleton (English / Nepali).
 *
 * Mirrors the mobile app's engine (i18next + react-i18next, I18N-1) but is a
 * SEPARATE instance/config — this app never imports from apps/mobile. There
 * is no locale-prefixed URL routing here (a plain client toggle is enough for
 * v1), so this is wired via a client `I18nextProvider` in app/providers.tsx
 * rather than next-intl's server/routing setup.
 *
 * The persisted locale preference lives in `store/locale.store.ts` (the
 * `'locale'` localStorage key). To avoid a circular import between that store
 * (which needs `i18n.changeLanguage`) and this module, the initial language
 * is read directly off localStorage here — the same key the store reads/
 * writes — rather than importing the store module. The store owns keeping
 * that key in sync going forward.
 */
export type Locale = 'en' | 'np';

const LOCALE_STORAGE_KEY = 'locale';

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === 'np' ? 'np' : 'en';
}

// Guard against Next.js dev-mode double-init (Fast Refresh / re-evaluated
// module instances) re-running .init() on an already-initialized instance.
if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    resources: {
      en: { common: en },
      np: { common: np },
    },
    lng: getInitialLocale(),
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // React already escapes
  });
}

export { i18next as i18n };
export default i18next;
