import { describe, it, expect } from 'vitest';
import { applyBrandScale, resetBrandScale, brandProperties } from '../apply';
import { deriveBrandScale, contrastRatio } from '../scale';

function fakeTarget() {
  const props = new Map<string, string>();
  return {
    props,
    style: {
      setProperty: (k: string, v: string) => void props.set(k, v),
      removeProperty: (k: string) => void props.delete(k),
    },
  };
}

const SCALE = deriveBrandScale('#7C1D3F')!;

describe('applyBrandScale', () => {
  it('light: writes all 12 brand steps plus theme-aware --primary/--accent/--ring', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, '#FFFFFF', 'light', t);
    expect(t.props.size).toBe(17); // 12 brand steps + primary pair + accent/accent-fg/ring
    expect(t.props.get('--color-brand-500')).toBe(SCALE[500]);
    expect(t.props.get('--color-brand-25')).toBe(SCALE[25]);
    expect(t.props.get('--color-brand-950')).toBe(SCALE[950]);
    expect(t.props.get('--primary')).toBe(SCALE[500]);
    expect(t.props.get('--primary-foreground')).toBe('#FFFFFF');
    expect(t.props.get('--accent')).toBe(SCALE[50]);
    expect(t.props.get('--accent-foreground')).toBe(SCALE[500]);
    expect(t.props.get('--ring')).toBe(SCALE[500]);
  });

  it('falls back to white ink when the server sent no foreground (light)', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, null, 'light', t);
    expect(t.props.get('--primary-foreground')).toBe('#FFFFFF');
  });

  it('dark: writes --primary = scale[400] and does NOT write --accent/--accent-foreground/--ring', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, '#FFFFFF', 'dark', t);
    expect(t.props.get('--primary')).toBe(SCALE[400]);
    expect(t.props.has('--accent')).toBe(false);
    expect(t.props.has('--accent-foreground')).toBe(false);
    expect(t.props.has('--ring')).toBe(false);
    // 12 brand steps + primary pair only — the three light-only tokens are absent.
    expect(t.props.size).toBe(14);
  });

  it("dark: --primary-foreground reads against scale[400]'s own contrast, not a fixed literal", () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, '#FFFFFF', 'dark', t);
    const fg = t.props.get('--primary-foreground')!;
    expect(contrastRatio(SCALE[400], fg)).toBeGreaterThanOrEqual(4.5);
  });

  it('switching light -> dark on the same target leaves no stale --accent/--accent-foreground/--ring', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, '#FFFFFF', 'light', t);
    expect(t.props.has('--accent')).toBe(true);
    expect(t.props.has('--ring')).toBe(true);

    applyBrandScale(SCALE, '#FFFFFF', 'dark', t);

    // This is the regression guard for the remove-then-set requirement: without
    // it, light mode's --accent/--accent-foreground/--ring would still be set
    // on <html> after switching to dark, outranking .dark's own neutral-grey
    // rule (the exact bug this task fixes).
    expect(t.props.has('--accent')).toBe(false);
    expect(t.props.has('--accent-foreground')).toBe(false);
    expect(t.props.has('--ring')).toBe(false);
  });

  it('is a no-op when there is no target (SSR)', () => {
    expect(() => applyBrandScale(SCALE, '#FFFFFF', 'light', null)).not.toThrow();
  });
});

describe('resetBrandScale', () => {
  it('removes every property applyBrandScale set in light mode', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, '#FFFFFF', 'light', t);
    resetBrandScale(t);
    expect(t.props.size).toBe(0);
  });

  it('removes every property applyBrandScale set in dark mode', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, '#FFFFFF', 'dark', t);
    resetBrandScale(t);
    expect(t.props.size).toBe(0);
  });

  it('removes every key EITHER theme can write, even if only light was ever applied', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, '#FFFFFF', 'light', t);
    resetBrandScale(t);
    // Nothing left over from the light-only set (accent/accent-foreground/ring
    // included) — resetBrandScale's removal set is the union of both themes.
    expect(t.props.size).toBe(0);
    expect(t.props.has('--accent')).toBe(false);
    expect(t.props.has('--ring')).toBe(false);
  });

  it('is a no-op when there is no target (SSR)', () => {
    expect(() => resetBrandScale(null)).not.toThrow();
  });
});

describe('brandProperties', () => {
  it('names every property with the --color-brand- prefix Tailwind emits', () => {
    const keys = brandProperties(SCALE, '#FFFFFF').map(([k]) => k);
    expect(keys).toContain('--color-brand-500');
    expect(keys.filter((k) => k.startsWith('--color-brand-'))).toHaveLength(12);
  });

  it('defaults to the light theme when none is given', () => {
    const withDefault = brandProperties(SCALE, '#FFFFFF');
    const withLight = brandProperties(SCALE, '#FFFFFF', 'light');
    expect(withDefault).toEqual(withLight);
  });
});
