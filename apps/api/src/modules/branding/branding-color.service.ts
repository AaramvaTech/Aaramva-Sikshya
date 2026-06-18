import { Injectable } from '@nestjs/common';
import { Vibrant } from 'node-vibrant/node';

const SWATCH_PRIORITY = ['Vibrant', 'DarkVibrant', 'LightVibrant', 'Muted', 'DarkMuted'] as const;

export interface BrandingColorResult {
  primaryColor: string;       // hex e.g. "#1D4ED8"
  primaryForeground: string;  // "#FFFFFF" or "#0B1220"
  rawSwatch: string;          // hex of dominant swatch before normalization
  palette: Record<string, string>; // all non-null swatches as hex
}

@Injectable()
export class BrandingColorService {
  async deriveThemeFromLogo(buffer: Buffer): Promise<BrandingColorResult | null> {
    const palette = await Vibrant.from(buffer).getPalette();
    const swatch = SWATCH_PRIORITY.map((k) => palette[k]).find(Boolean);
    if (!swatch) return null;

    let [h, s, l] = swatch.hsl;

    l = clamp(l, 0.32, 0.46);
    s = clamp(s, 0.45, 0.85);

    const primaryColor = hslToHex(h, s, l);
    const primaryForeground =
      contrastRatio(primaryColor, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#0B1220';

    return {
      primaryColor,
      primaryForeground,
      rawSwatch: swatch.hex,
      palette: Object.fromEntries(
        Object.entries(palette)
          .filter(([, sw]) => sw)
          .map(([k, sw]) => [k, sw!.hex]),
      ),
    };
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;

  let r = 0, g = 0, b = 0;
  const sector = Math.floor(h * 6);
  switch (sector % 6) {
    case 0: r = c; g = x; b = 0; break;
    case 1: r = x; g = c; b = 0; break;
    case 2: r = 0; g = c; b = x; break;
    case 3: r = 0; g = x; b = c; break;
    case 4: r = x; g = 0; b = c; break;
    case 5: r = c; g = 0; b = x; break;
  }

  const toHex = (n: number) =>
    Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function relativeLuminance(hex: string): number {
  const c = hex.replace('#', '');
  const [r, g, b] = [
    parseInt(c.slice(0, 2), 16) / 255,
    parseInt(c.slice(2, 4), 16) / 255,
    parseInt(c.slice(4, 6), 16) / 255,
  ].map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}
