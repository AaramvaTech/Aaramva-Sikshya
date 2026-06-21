// Aaramva platform default. DO NOT change the token key names.
export const aaramvaTheme = {
  '--primary': '11 107 67', // #0B6B43 — canonical Aaramva green (matches brand design).
  '--primary-foreground': '255 255 255',
  '--background': '244 246 245', // #F4F6F5
  '--surface': '255 255 255',
  '--surface-muted': '241 244 241', // #F1F4F1
  '--border': '228 233 229', // #E4E9E5
  '--foreground': '16 35 26', // #10231A — warm green-black ink
  '--muted-foreground': '92 112 104', // #5C7068
  '--success': '14 159 119', // #0E9F77
  '--warning': '217 137 43', // #D9892B
  '--danger': '229 72 77', // #E5484D
  '--info': '91 127 224', // #5B7FE0
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
