import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { AppLocale, deviceLocale, initI18n } from '../lib/i18n';

/**
 * Locale state (I18N-1). Persisted to AsyncStorage — it is a preference, not a
 * secret, so it does NOT belong in expo-secure-store (unlike auth tokens).
 */
const STORAGE_KEY = 'appLocale';

interface LocaleState {
  locale: AppLocale;
  ready: boolean;
  /** Load the persisted locale (or device default), init i18n, mark ready. */
  hydrate: () => Promise<void>;
  setLocale: (locale: AppLocale) => Promise<void>;
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: 'en',
  ready: false,
  hydrate: async () => {
    if (get().ready) return;
    let stored: AppLocale | null = null;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw === 'en' || raw === 'np') stored = raw;
    } catch {
      // ignore — fall through to device default
    }
    const initial = stored ?? deviceLocale();
    initI18n(initial);
    if (i18n.language !== initial) await i18n.changeLanguage(initial);
    set({ locale: initial, ready: true });
  },
  setLocale: async (locale) => {
    await i18n.changeLanguage(locale);
    set({ locale });
    try {
      await AsyncStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // a failed persist still switches for this session
    }
  },
}));
