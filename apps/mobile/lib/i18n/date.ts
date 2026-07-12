import { adToBs, formatBs, todayBs, BS_MONTH_NAMES_EN, BS_MONTH_NAMES_NP } from 'bs-calendar';
import type { AppLocale } from './index';

/**
 * Locale-aware BS date rendering (I18N-1). The `np` month names
 * (BS_MONTH_NAMES_NP — असार, श्रावण …) finally earn their keep here.
 *
 * Numerals stay Arabic (0–9) in v1 regardless of locale — Devanagari numerals
 * (०–९) are a flagged future decision, not v1 scope.
 */
function lang(locale: AppLocale): 'en' | 'np' {
  return locale === 'np' ? 'np' : 'en';
}

/** An ISO/AD date ('YYYY-MM-DD' or Date) → localized BS string, e.g.
 *  "27 Ashadh 2083" (en) / "27 असार 2083" (np). */
export function formatAdAsBs(adDate: string | Date, locale: AppLocale): string {
  const d = typeof adDate === 'string' ? new Date(`${adDate.slice(0, 10)}T00:00:00`) : adDate;
  return formatBs(adToBs(d), lang(locale));
}

/** Today in BS, localized. */
export function todayBsLocalized(locale: AppLocale): string {
  return formatBs(todayBs(), lang(locale));
}

/** Just the BS month name for a given 1-based month number, localized. */
export function bsMonthName(month: number, locale: AppLocale): string {
  const names = locale === 'np' ? BS_MONTH_NAMES_NP : BS_MONTH_NAMES_EN;
  return names[month - 1] ?? '';
}
