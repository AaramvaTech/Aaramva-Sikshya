import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// BILL-8: extracted from examination/pdf.service.ts (report cards) so any
// pdfkit renderer in this codebase reuses the same embedded fonts and script
// detection instead of duplicating ~1.7MB of font binaries per module. Two
// families: Noto Sans (Latin) and Noto Sans Devanagari. The script-specific
// Noto builds are disjoint — Latin has no Devanagari glyphs and vice-versa —
// so callers must pick the family per string (pickFont) to avoid tofu boxes
// for either script.
const FONT_DIR = join(__dirname, 'assets', 'fonts');
const DEVANAGARI = /[ऀ-ॿ]/;

export type PdfFontName = 'latin' | 'latin-bold' | 'deva' | 'deva-bold';

export function loadPdfFonts(): Record<PdfFontName, Buffer> {
  return {
    latin: readFileSync(join(FONT_DIR, 'NotoSans-Regular.ttf')),
    'latin-bold': readFileSync(join(FONT_DIR, 'NotoSans-Bold.ttf')),
    deva: readFileSync(join(FONT_DIR, 'NotoSansDevanagari-Regular.ttf')),
    'deva-bold': readFileSync(join(FONT_DIR, 'NotoSansDevanagari-Bold.ttf')),
  };
}

/** Picks the Latin or Devanagari family based on the string's script. */
export function pickFont(text: string, bold = false): PdfFontName {
  const script = DEVANAGARI.test(text) ? 'deva' : 'latin';
  return bold ? `${script}-bold` : script;
}
