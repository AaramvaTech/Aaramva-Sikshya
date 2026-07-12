import { useTranslation } from 'react-i18next';
import { useLocaleStore } from '../store/locale';
import type { AppLocale } from '../lib/i18n';

/**
 * The one hook screens use for i18n: `t` (namespaced translator) + the current
 * locale + a setter. Subscribing to the store makes every screen re-render on
 * a language switch. Pass a namespace: `useLocale('student')`.
 */
export function useLocale(ns?: string) {
  const { t } = useTranslation(ns);
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  return { t, locale, setLocale };
}

/** bs-calendar's formatBs lang param for the active locale. */
export function bsLang(locale: AppLocale): 'en' | 'np' {
  return locale === 'np' ? 'np' : 'en';
}
