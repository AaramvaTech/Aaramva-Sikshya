// Aaramva platform default. DO NOT change the token key names.
export const aaramvaTheme = {
  '--primary': '6 95 70',
  '--primary-foreground': '255 255 255',
  '--background': '249 250 251',
  '--surface': '255 255 255',
  '--surface-muted': '243 244 246',
  '--border': '229 231 235',
  '--foreground': '17 24 39',
  '--muted-foreground': '107 114 128',
  '--success': '22 163 74',
  '--warning': '202 138 4',
  '--danger': '220 38 38',
  '--info': '37 99 235',
} as const;

// Runtime helper: "#1D4ED8" -> "29 78 216"
export function hexToRgbChannels(hex: string): string {
  const stripped = hex.replace('#', '');
  const h = stripped.length === 3
    ? stripped.split('').map((c) => c + c).join('')
    : stripped.slice(0, 6);
  if (h.length !== 6) throw new Error(`Invalid hex color: ${hex}`);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) throw new Error(`Invalid hex color: ${hex}`);
  return `${r} ${g} ${b}`;
}
