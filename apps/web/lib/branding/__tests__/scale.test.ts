import { describe, it, expect } from 'vitest';
import {
  deriveBrandScale,
  contrastRatio,
  BRAND_STEPS,
  DARK_SURFACE,
} from '../scale';

const AARAMVA = '#1a8055';
const MAROON = '#7C1D3F';
const NEON_YELLOW = '#FFD700';

// Lightness of an #rrggbb, matching the HSL definition used by the module.
function lightnessOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
}

describe('deriveBrandScale', () => {
  it('returns Aaramva green unchanged at step 500 — it already passes 4.93:1 on white', () => {
    expect(contrastRatio(AARAMVA, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(deriveBrandScale(AARAMVA)![500]).toBe(AARAMVA);
  });

  it('leaves a maroon untouched at step 500 — 9.98:1 on white', () => {
    // normaliseHex lowercases, so compare against the lowercased input —
    // otherwise this fails on case alone and tells you nothing.
    expect(deriveBrandScale(MAROON)![500]).toBe(MAROON.toLowerCase());
  });

  // Regression guard for MIN_ANCHOR_L: a floor that's too high (it was 0.12)
  // raises the anchor even when anchorForWhite never needed to move it — i.e.
  // when the colour already clears 4.5:1 vs white by a wide margin. Dark navy
  // and dark forest green are exactly this case, and are common school
  // colours. This must fail if the floor is ever raised back above ~0.09
  // (the natural HSL lightness of #001a33).
  it.each([
    ['#001a33', 'dark navy'],
    ['#003318', 'dark forest green'],
  ])('leaves %s (%s) untouched at step 500 — already legible on white', (hex) => {
    expect(contrastRatio(hex, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    // normaliseHex lowercases; these inputs are already lowercase, but match
    // the pattern used elsewhere in this file for consistency.
    expect(deriveBrandScale(hex)![500]).toBe(hex.toLowerCase());
  });

  it('clamps neon yellow, which fails white at 1.40:1', () => {
    expect(contrastRatio(NEON_YELLOW, '#FFFFFF')).toBeLessThan(4.5);
    const step500 = deriveBrandScale(NEON_YELLOW)![500];
    // Compare lowercased: `.not.toBe(NEON_YELLOW)` would pass on casing alone
    // even if the clamp never fired, which would make this a fake test.
    expect(step500).not.toBe(NEON_YELLOW.toLowerCase());
    expect(contrastRatio(step500, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it.each([AARAMVA, MAROON, NEON_YELLOW, '#2563EB', '#808080'])(
    'keeps step 500 legible on white for %s',
    (hex) => {
      expect(contrastRatio(deriveBrandScale(hex)![500], '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([AARAMVA, MAROON, NEON_YELLOW, '#2563EB', '#808080'])(
    'keeps step 400 legible on the dark surface for %s',
    (hex) => {
      expect(contrastRatio(deriveBrandScale(hex)![400], DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([AARAMVA, MAROON, NEON_YELLOW, '#2563EB', '#808080', '#000000', '#050505', '#FFFFFF'])(
    'produces a strictly monotonic lightness ramp for %s',
    (hex) => {
      const scale = deriveBrandScale(hex)!;
      const ls = BRAND_STEPS.map((s) => lightnessOf(scale[s]));
      for (let i = 1; i < ls.length; i++) {
        expect(ls[i]).toBeLessThan(ls[i - 1]);
      }
    },
  );

  it('returns all 12 steps as #rrggbb', () => {
    const scale = deriveBrandScale(AARAMVA)!;
    expect(Object.keys(scale)).toHaveLength(12);
    for (const step of BRAND_STEPS) {
      expect(scale[step]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('expands 3-digit shorthand (@IsHexColor permits it)', () => {
    expect(deriveBrandScale('#0a5')).toEqual(deriveBrandScale('#00aa55'));
  });

  it('strips an alpha channel (@IsHexColor permits #rrggbbaa)', () => {
    expect(deriveBrandScale('#1a8055ff')).toEqual(deriveBrandScale('#1a8055'));
  });

  it.each(['#FFFFFF', '#000000', '#808080'])('does not throw on the extreme %s', (hex) => {
    expect(() => deriveBrandScale(hex)).not.toThrow();
    expect(deriveBrandScale(hex)).not.toBeNull();
  });

  it.each(['', 'red', '#GG0000', '#12345', 'rgb(1,2,3)', null, undefined])(
    'returns null (never throws) for unparseable input %s',
    (bad) => {
      expect(deriveBrandScale(bad as string)).toBeNull();
    },
  );
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('is 1:1 for a colour against itself', () => {
    expect(contrastRatio(AARAMVA, AARAMVA)).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio(AARAMVA, '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', AARAMVA), 5);
  });
});
