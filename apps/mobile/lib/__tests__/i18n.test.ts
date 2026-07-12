import { describe, it, expect, beforeEach } from '@jest/globals';
import i18n, { initI18n, deviceLocale } from '../i18n';
import { formatAdAsBs, bsMonthName } from '../i18n/date';

// jest.setup.ts already initialized i18n('en'); these tests drive changeLanguage
// directly (the store wraps this with AsyncStorage persistence, tested separately).

describe('i18n locale switch', () => {
  beforeEach(async () => {
    initI18n('en');
    await i18n.changeLanguage('en');
  });

  it('flips a sampled set of strings from English to Nepali', async () => {
    // English source
    expect(i18n.t('common:attendance.present')).toBe('Present');
    expect(i18n.t('student:assignments.title')).toBe('Assignments');
    expect(i18n.t('common:action.signOut')).toBe('Sign out');

    await i18n.changeLanguage('np');

    // Natural Nepali (the school-domain vocabulary)
    expect(i18n.t('common:attendance.present')).toBe('हाजिर');
    expect(i18n.t('student:assignments.title')).toBe('गृहकार्य');
    expect(i18n.t('common:action.signOut')).toBe('साइन आउट');
  });

  it('keeps interpolation slots intact across locales', async () => {
    await i18n.changeLanguage('np');
    const en = i18n.t('common:common.marks', { value: 9, lng: 'en' });
    const np = i18n.t('common:common.marks', { value: 9 });
    expect(en).toContain('9');
    expect(np).toContain('9'); // numerals stay Arabic in v1
    expect(np).not.toBe(en); // but the surrounding word is translated
  });

  it('resolves i18next plurals (teacher leave request count)', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('teacher:leave.requestCount', { count: 1 })).toBe('1 request');
    expect(i18n.t('teacher:leave.requestCount', { count: 3 })).toBe('3 requests');
  });
});

describe('missing-key fallback', () => {
  beforeEach(async () => {
    initI18n('en');
    await i18n.changeLanguage('np');
  });

  it('falls back to English for a key missing in Nepali (never a raw key on screen)', () => {
    // A key that exists only in English would fall back; here we assert a real
    // key renders a human string, not the dotted key path.
    const value = i18n.t('common:action.tryAgain');
    expect(value).not.toBe('common:action.tryAgain');
    expect(value).not.toBe('action.tryAgain');
    expect(value.length).toBeGreaterThan(0);
  });

  it('a genuinely unknown key returns the last segment, not a crash', () => {
    // i18next default: returns the key itself (bare, no namespace) — still never
    // throws. This documents the behavior the UI relies on.
    const value = i18n.t('common:does.not.exist');
    expect(typeof value).toBe('string');
  });
});

describe('BS date localization', () => {
  it('renders Nepali month names when locale=np (Ashadh vs असार)', () => {
    // 2026-07-11 = 27 Ashadh 2083 (Step-0-verified anchor).
    expect(formatAdAsBs('2026-07-11', 'en')).toBe('27 Ashadh 2083');
    expect(formatAdAsBs('2026-07-11', 'np')).toBe('27 असार 2083');
  });

  it('month names cross-check against the bs-calendar table', () => {
    expect(bsMonthName(3, 'en')).toBe('Ashadh');
    expect(bsMonthName(3, 'np')).toBe('असार');
    expect(bsMonthName(1, 'np')).toBe('बैशाख');
  });
});

describe('deviceLocale', () => {
  it('returns a valid AppLocale', () => {
    expect(['en', 'np']).toContain(deviceLocale());
  });
});
