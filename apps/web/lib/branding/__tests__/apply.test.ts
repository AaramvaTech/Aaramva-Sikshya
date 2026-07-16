import { describe, it, expect } from 'vitest';
import { applyBrandScale, resetBrandScale, brandProperties } from '../apply';
import { deriveBrandScale } from '../scale';

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
  it('writes all 12 brand steps plus --primary and --primary-foreground', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, '#FFFFFF', t);
    expect(t.props.size).toBe(14);
    expect(t.props.get('--color-brand-500')).toBe(SCALE[500]);
    expect(t.props.get('--color-brand-25')).toBe(SCALE[25]);
    expect(t.props.get('--color-brand-950')).toBe(SCALE[950]);
    expect(t.props.get('--primary')).toBe(SCALE[500]);
    expect(t.props.get('--primary-foreground')).toBe('#FFFFFF');
  });

  it('falls back to white ink when the server sent no foreground', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, null, t);
    expect(t.props.get('--primary-foreground')).toBe('#FFFFFF');
  });

  it('is a no-op when there is no target (SSR)', () => {
    expect(() => applyBrandScale(SCALE, '#FFFFFF', null)).not.toThrow();
  });
});

describe('resetBrandScale', () => {
  it('removes every property applyBrandScale set', () => {
    const t = fakeTarget();
    applyBrandScale(SCALE, '#FFFFFF', t);
    resetBrandScale(t);
    expect(t.props.size).toBe(0);
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
});
