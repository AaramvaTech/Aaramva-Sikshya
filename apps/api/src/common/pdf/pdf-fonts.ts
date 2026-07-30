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

export interface MixedTextRun {
  text: string;
  bold?: boolean;
}

/**
 * BILL-8 Checkpoint B fix: draws a sequence of text runs that may be in
 * DIFFERENT scripts, each independently font-picked, positioned so the
 * combined result respects one overall alignment.
 *
 * Why this exists: pdfkit's single `.text()` call takes exactly one font.
 * Concatenating a translated label (possibly Devanagari) with independently-
 * scripted dynamic data (a tenant name, a registration number — always
 * whatever script the school actually entered, usually Latin) and picking
 * ONE font for the whole string — e.g. `pickFont(label)` applied to
 * `${label}: ${tenant.name}` — silently renders whichever script that one
 * font doesn't cover as tofu, since the Latin and Devanagari Noto builds
 * are disjoint font files with zero shared glyph coverage. Found live: the
 * "For: {School}" signature line rendered the label correctly and the
 * school name as boxes. `pdfkit.continued` text doesn't compose with
 * right/center alignment, so this measures each run's width itself and
 * positions runs manually instead.
 *
 * Assumes short, non-wrapping label+value runs (this document's actual
 * use), not general paragraph layout.
 */
export function drawMixedText(
  doc: PDFKit.PDFDocument,
  runs: MixedTextRun[],
  x: number,
  y: number,
  opts: { width: number; align: 'left' | 'right' | 'center'; fontSize: number; color: string },
): void {
  doc.fontSize(opts.fontSize).fillColor(opts.color);
  const widths = runs.map((r) => {
    doc.font(pickFont(r.text, r.bold));
    return doc.widthOfString(r.text);
  });
  const totalW = widths.reduce((a, b) => a + b, 0);
  let cursorX = x;
  if (opts.align === 'right') cursorX = x + opts.width - totalW;
  else if (opts.align === 'center') cursorX = x + (opts.width - totalW) / 2;

  runs.forEach((r, i) => {
    doc.font(pickFont(r.text, r.bold)).text(r.text, cursorX, y, { lineBreak: false });
    cursorX += widths[i];
  });
}
