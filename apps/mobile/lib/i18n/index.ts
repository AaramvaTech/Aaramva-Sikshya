import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enStudent from './locales/en/student.json';
import enParent from './locales/en/parent.json';
import enTeacher from './locales/en/teacher.json';
import npCommon from './locales/np/common.json';
import npAuth from './locales/np/auth.json';
import npStudent from './locales/np/student.json';
import npParent from './locales/np/parent.json';
import npTeacher from './locales/np/teacher.json';

/**
 * I18N-1 — mobile i18n. Two locales: `en` (source of truth, extracted from the
 * original UI copy) and `np` (natural school-domain Nepali). Namespaces are per
 * app-area, not one monolith.
 *
 * Numerals stay Arabic (0–9) in v1; Devanagari numerals (०–९) are a flagged
 * future decision. Dates render BS with Nepali month names when locale=np
 * (via bs-calendar's formatBs(bs, 'np')). Currency stays "Rs".
 */
export type AppLocale = 'en' | 'np';

export const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    student: enStudent,
    parent: enParent,
    teacher: enTeacher,
  },
  np: {
    common: npCommon,
    auth: npAuth,
    student: npStudent,
    parent: npParent,
    teacher: npTeacher,
  },
} as const;

export const NAMESPACES = ['common', 'auth', 'student', 'parent', 'teacher'] as const;

/** Device default: Nepali only when the top device locale is a `ne*` tag. */
export function deviceLocale(): AppLocale {
  try {
    const tag = getLocales()[0]?.languageCode ?? 'en';
    return tag.toLowerCase().startsWith('ne') ? 'np' : 'en';
  } catch {
    return 'en';
  }
}

/** Idempotent init. `initial` comes from persisted storage (or device default). */
export function initI18n(initial: AppLocale) {
  if (i18n.isInitialized) return i18n;
  void i18n.use(initReactI18next).init({
    resources,
    lng: initial,
    fallbackLng: 'en', // missing key/locale → English, never a raw key on screen
    ns: NAMESPACES,
    defaultNS: 'common',
    interpolation: { escapeValue: false }, // RN has no XSS surface
    returnNull: false,
  });
  return i18n;
}

export default i18n;
