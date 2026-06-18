// Aaramva platform default. DO NOT change the token key names.
export const aaramvaTheme = {
  '--primary': '26 128 85',              // #1a8055 — Aaramva brand green
  '--primary-foreground': '255 255 255',
  '--background': '255 255 255',
  '--surface': '248 250 252',            // cards
  '--surface-muted': '241 245 249',
  '--border': '226 232 240',
  '--foreground': '15 23 42',            // primary text
  '--muted-foreground': '100 116 139',
  '--success': '22 163 74',
  '--warning': '202 138 4',
  '--danger': '220 38 38',
  '--info': '37 99 235',
} as const;

// Runtime helper: "#1D4ED8" -> "29 78 216"
export function hexToRgbChannels(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}
