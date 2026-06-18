import { Test } from '@nestjs/testing';
import { BrandingColorService, contrastRatio, hslToHex } from '../branding-color.service';

jest.mock('node-vibrant/node', () => ({
  Vibrant: {
    from: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Vibrant } = require('node-vibrant/node') as {
  Vibrant: { from: jest.Mock };
};

function mockPalette(
  vibrant: [number, number, number] | null,
  rest: Record<string, [number, number, number] | null> = {},
) {
  const makeSwatch = (hsl: [number, number, number] | null) =>
    hsl
      ? {
          hsl,
          hex: hslToHex(hsl[0], hsl[1], hsl[2]),
          getPopulation: () => 100,
        }
      : null;

  const palette: Record<string, ReturnType<typeof makeSwatch>> = {
    Vibrant: makeSwatch(vibrant),
    DarkVibrant: makeSwatch(rest.DarkVibrant ?? null),
    LightVibrant: makeSwatch(rest.LightVibrant ?? null),
    Muted: makeSwatch(rest.Muted ?? null),
    DarkMuted: makeSwatch(rest.DarkMuted ?? null),
  };

  Vibrant.from.mockReturnValue({
    getPalette: jest.fn().mockResolvedValue(palette),
  });
}

describe('BrandingColorService', () => {
  let service: BrandingColorService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [BrandingColorService],
    }).compile();
    service = module.get(BrandingColorService);
  });

  it('saturated blue logo → blue-family primary, white foreground', async () => {
    // h=0.6 ≈ 216° (blue), s=0.8, l=0.3
    // after clamp: l=clamp(0.3, 0.32, 0.46)=0.32, s=clamp(0.8, 0.45, 0.85)=0.8
    // deep blue → contrast with white >> 4.5 → white fg
    mockPalette([0.6, 0.8, 0.3]);

    const result = await service.deriveThemeFromLogo(Buffer.from('fake'));

    expect(result).not.toBeNull();
    expect(result!.primaryColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(result!.primaryForeground).toBe('#FFFFFF');
    // hue should remain in the blue family (H ≈ 216° → between 180° and 260°)
    const hex = result!.primaryColor.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    expect(b).toBeGreaterThan(r); // blue dominant
  });

  it('pale yellow logo → normalized color, dark foreground (contrast guard fires)', async () => {
    // h=0.15 ≈ 54° (yellow), s=0.9, l=0.85 (very light)
    // after clamp: l=clamp(0.85, 0.32, 0.46)=0.46, s=clamp(0.9, 0.45, 0.85)=0.85
    // yellow at 46% L → bright, low contrast with white → dark fg
    mockPalette([0.15, 0.9, 0.85]);

    const result = await service.deriveThemeFromLogo(Buffer.from('fake'));

    expect(result).not.toBeNull();
    expect(result!.primaryForeground).toBe('#0B1220');
    // verify contrast ratio with white is actually < 4.5 (the guard fired correctly)
    expect(contrastRatio(result!.primaryColor, '#FFFFFF')).toBeLessThan(4.5);
  });

  it('monochrome logo (all swatches null) → returns null', async () => {
    // No usable swatches → falls back to null
    mockPalette(null, {});

    const result = await service.deriveThemeFromLogo(Buffer.from('fake'));

    expect(result).toBeNull();
  });

  describe('contrastRatio helper', () => {
    it('black on white = 21:1', () => {
      expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    });

    it('white on white = 1:1', () => {
      expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 1);
    });
  });
});
