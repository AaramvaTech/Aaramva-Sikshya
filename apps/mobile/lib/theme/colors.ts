import { aaramvaTheme } from './tokens';
import { useBranding } from './provider';

// "6 95 70" -> "#065f46"
function channelsToHex(channels: string): string {
  const [r, g, b] = channels.trim().split(/\s+/).map(Number);
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// Aaramva default JS-side hexes, derived from the single source of truth (tokens.ts).
export const AARAMVA_COLORS = {
  primary: channelsToHex(aaramvaTheme['--primary']),
  primaryForeground: channelsToHex(aaramvaTheme['--primary-foreground']),
  background: channelsToHex(aaramvaTheme['--background']),
  surface: channelsToHex(aaramvaTheme['--surface']),
  surfaceMuted: channelsToHex(aaramvaTheme['--surface-muted']),
  border: channelsToHex(aaramvaTheme['--border']),
  foreground: channelsToHex(aaramvaTheme['--foreground']),
  mutedForeground: channelsToHex(aaramvaTheme['--muted-foreground']),
  danger: channelsToHex(aaramvaTheme['--danger']),
};

// Non-token neutral used only for large faded placeholder icons (empty/error states).
// No semantic token exists for this tint; centralized here so no screen holds a hex literal.
export const PLACEHOLDER_ICON = '#d1d5db';

// Saturday calendar highlight (Nepal weekend). Documented exception — amber tint, no token.
export const SATURDAY_HIGHLIGHT = { bg: '#fef9ee', text: '#d97706' };

// Derives on-primary header accent tints from the resolved primary.
// Preserves the primary's hue, softens saturation, fixes lightness stops so
// the tints read as "light ink on the brand header" for ANY brand color.
export function deriveOnPrimary(primary: string): { bright: string; soft: string; pale: string } {
  const [h, s] = hexToHsl(primary);
  const sClamped = Math.min(s, 0.65);
  return {
    bright: hslToHex(h, sClamped, 0.67),
    soft: hslToHex(h, sClamped, 0.80),
    pale: hslToHex(h, sClamped, 0.90),
  };
}

// hex -> {h,s,l} (h 0..360, s/l 0..1)
function hexToHsl(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function shade(hex: string, deltaL: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, Math.min(1, l + deltaL)));
}

// 3-stop gradient ramp derived from the resolved primary.
// Under Aaramva primary #065f46 this renders a green ramp ~identical to the
// previous hand-tuned ['#064e3b', '#065f46', '#047857']; for a school it
// recolors to that school's brand. Returns a tuple typed for expo-linear-gradient.
export function headerGradient(primary: string): readonly [string, string, string] {
  return [shade(primary, -0.06), primary, shade(primary, +0.06)] as const;
}

// Resolved colors for JS props. primary/foreground swap per school; neutrals fixed.
export function useThemeColors() {
  const { branding } = useBranding();
  return {
    ...AARAMVA_COLORS,
    placeholderIcon: PLACEHOLDER_ICON,
    primary: branding?.primaryColor ?? AARAMVA_COLORS.primary,
    primaryForeground: branding?.primaryForeground ?? AARAMVA_COLORS.primaryForeground,
    danger: AARAMVA_COLORS.danger,
  };
}
