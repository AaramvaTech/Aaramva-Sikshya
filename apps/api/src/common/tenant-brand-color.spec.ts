import { BILL_BRAND_COLORS, DEFAULT_BILL_BRAND_COLOR, resolveBillBrandColor } from './tenant-brand-color';

describe('resolveBillBrandColor', () => {
  it('falls back to slate for null', () => {
    expect(resolveBillBrandColor(null)).toEqual({ color: '#475569', tint: '#e9ebed' });
  });

  it('falls back to slate for undefined', () => {
    expect(resolveBillBrandColor(undefined)).toEqual({ color: DEFAULT_BILL_BRAND_COLOR, tint: '#e9ebed' });
  });

  it('falls back to slate for a value outside the curated set — never renders an unreviewed color', () => {
    expect(resolveBillBrandColor('#123456')).toEqual({ color: DEFAULT_BILL_BRAND_COLOR, tint: '#e9ebed' });
  });

  it('accepts a curated value and returns its matching tint', () => {
    expect(resolveBillBrandColor('#0f6e56')).toEqual({ color: '#0f6e56', tint: '#e2eeeb' });
  });

  it('every curated color has a tint and resolves to itself', () => {
    for (const c of BILL_BRAND_COLORS) {
      expect(resolveBillBrandColor(c).color).toBe(c);
    }
  });
});
