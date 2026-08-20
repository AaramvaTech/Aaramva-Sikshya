import { pickFont, drawMixedText, MixedTextRun } from '../../../common/pdf/pdf-fonts';
import { Money } from '../../../common/money/money';
import {
  mm, SHEET_W, SHEET_H, HALF_H, PAD_TOP, PAD_SIDE, PAD_BOTTOM, CONTENT_W,
  INK, GREY_1, GREY_2, ACCENT, RULE_HAIR,
  Locale, LINE_HEIGHT, EYEBROW_SIZE, EYEBROW_TRACK, Weight, isBold,
} from './mm';

/**
 * BILL-PRINT-1 — the A4 sheet skeleton and the drawing primitives both
 * half-renderers are built from.
 *
 * One partial rendered twice per sheet, two flags (SPEC §8):
 *   stackMode  'duplicate' (default) -> same document twice, Student Copy /
 *              Office Copy eyebrows;  'batch' -> two different documents,
 *              no copy eyebrow, and an odd count leaves the trailing half
 *              blank rather than stretching or crashing.
 *   locale     'en' | 'ne' -> font stack, line-height, label widths, strings.
 *              Nothing else changes; the grid and every rule position are
 *              identical so the two locales overlay exactly.
 */

// ─── Overflow ────────────────────────────────────────────────────────────────

/**
 * Decision 1: in CSS the footer was pinned by a flex spacer and the layout
 * self-corrected as content grew. Here it is arithmetic on a draw cursor,
 * which does NOT self-correct — it silently collides. So the footer band is
 * positioned from a fixed baseline measured UP from the half's bottom edge,
 * and every half-renderer asserts the gap to the body's final cursor is >= 0
 * before drawing. A render that would overlap fails loudly instead.
 */
export class PrintOverflowError extends Error {
  constructor(
    readonly document: string,
    readonly overflowPt: number,
  ) {
    super(
      `${document} content overflows its 148.5mm half by ${(overflowPt / mm(1)).toFixed(2)}mm. ` +
        'Tighten the type scale or row density — never grow the box.',
    );
    this.name = 'PrintOverflowError';
  }
}

/** Throws unless `bodyEnd` sits at or above `footerTop`. */
export function assertFits(document: string, bodyEnd: number, footerTop: number): void {
  if (bodyEnd > footerTop) throw new PrintOverflowError(document, bodyEnd - footerTop);
}

// ─── Geometry ────────────────────────────────────────────────────────────────

/** The drawable box of one A5 half, in absolute page coordinates. */
export interface HalfBox {
  /** Top edge of the half itself (0 or 148.5mm). */
  top: number;
  /** Safe-area left edge. */
  x: number;
  /** Safe-area top edge. */
  y: number;
  /** Safe-area width (186mm). */
  w: number;
  /** Safe-area bottom edge — the hard floor the footer is measured up from. */
  bottom: number;
}

export function halfBox(index: 0 | 1): HalfBox {
  const top = index * HALF_H;
  return {
    top,
    x: PAD_SIDE,
    y: top + PAD_TOP,
    w: CONTENT_W,
    bottom: top + HALF_H - PAD_BOTTOM,
  };
}

// ─── Text primitives ─────────────────────────────────────────────────────────

export interface TextOpts {
  size: number;
  weight?: Weight;
  color?: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  /** Extra letter-spacing in points (the spec's em values are pre-multiplied). */
  track?: number;
  /** Allow wrapping onto further lines. Off by default — stationery is fixed. */
  wrap?: boolean;
  locale?: Locale;
}

/**
 * `font-variant-numeric: tabular-nums`, re-declared on every money draw.
 *
 * The spec sets it on the document root AND on every table and money span so
 * it survives font-stack fallback. pdfkit has no inheritance to fall back
 * through, so the equivalent — and the stronger guarantee — is passing the
 * OpenType feature on every single numeric draw. Verified present in
 * NotoSans-Regular.ttf's GSUB table.
 */
const TNUM = ['tnum'] as const;

function applyFont(doc: PDFKit.PDFDocument, text: string, o: TextOpts): void {
  doc
    .font(pickFont(text, isBold(o.weight ?? 400)))
    .fontSize(o.size)
    .fillColor(o.color ?? INK);
}

/** Natural line height minus the spec's target, as pdfkit's lineGap. */
export function lineGapFor(doc: PDFKit.PDFDocument, size: number, locale: Locale): number {
  return size * LINE_HEIGHT[locale] - doc.currentLineHeight();
}

/** Measured width of a string as it would actually be drawn. */
export function widthOf(doc: PDFKit.PDFDocument, text: string, o: TextOpts): number {
  applyFont(doc, text, o);
  return doc.widthOfString(text, { characterSpacing: o.track ?? 0, features: [...TNUM] });
}

/**
 * Truncates on a character boundary with an ellipsis so a long fee head or
 * student name can never wrap into a second line and grow a row (SPEC's
 * real-data rule). Returns the original string when it already fits.
 */
export function truncate(doc: PDFKit.PDFDocument, text: string, maxW: number, o: TextOpts): string {
  if (widthOf(doc, text, o) <= maxW) return text;
  const ell = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const midpoint = Math.ceil((lo + hi) / 2);
    if (widthOf(doc, text.slice(0, midpoint) + ell, o) <= maxW) lo = midpoint;
    else hi = midpoint - 1;
  }
  return lo > 0 ? text.slice(0, lo) + ell : ell;
}

/**
 * Truncates on a WORD boundary and drops the overflow entirely (no ellipsis
 * mid-sentence). Used for the payment-instructions prose slot, which takes
 * unbounded tenant free text into a fixed 78mm box — see the budget note in
 * invoice-half.ts.
 */
export function clampWords(doc: PDFKit.PDFDocument, text: string, maxW: number, lines: number, o: TextOpts): string {
  const budget = maxW * lines;
  if (widthOf(doc, text, o) <= budget) return text;
  const words = text.split(/\s+/);
  const kept: string[] = [];
  for (const word of words) {
    const next = [...kept, word].join(' ');
    if (widthOf(doc, next, o) > budget - widthOf(doc, '…', o)) break;
    kept.push(word);
  }
  return kept.length > 0 ? `${kept.join(' ')}…` : truncate(doc, text, maxW, o);
}

/** Draws one line (or a wrapped block when `wrap`) at an absolute position. */
export function text(doc: PDFKit.PDFDocument, str: string, x: number, y: number, o: TextOpts): void {
  if (!str) return;
  applyFont(doc, str, o);
  doc.text(str, x, y, {
    width: o.width,
    align: o.align ?? 'left',
    characterSpacing: o.track ?? 0,
    features: [...TNUM],
    lineBreak: o.wrap ?? false,
    lineGap: o.wrap ? lineGapFor(doc, o.size, o.locale ?? 'en') : 0,
  });
}

/**
 * An eyebrow: the small tracked label that sits over almost every value in
 * this design. Uppercased for Latin only — Devanagari has no case, and the
 * spec drops the tracking there because it damages conjuncts.
 */
export function eyebrow(
  doc: PDFKit.PDFDocument,
  str: string,
  x: number,
  y: number,
  locale: Locale,
  o: Partial<TextOpts> = {},
): void {
  text(doc, locale === 'en' ? str.toUpperCase() : str, x, y, {
    size: EYEBROW_SIZE[locale],
    weight: 600,
    color: GREY_1,
    track: EYEBROW_TRACK[locale],
    ...o,
  });
}

/** Height of one eyebrow line, for stacking a label over its value. */
export function eyebrowH(locale: Locale): number {
  return EYEBROW_SIZE[locale] * LINE_HEIGHT[locale];
}

/**
 * Money, always Arabic numerals in both locales (only labels translate), two
 * decimals, lakh-grouped via Money.toDisplay() — the same decimal source the
 * ledger uses. No float arithmetic and no rounding happens here; a figure
 * that needs rounding was already rounded in the billing layer.
 */
export function money(n: number): string {
  return Money.fromNumber(n).toDisplay();
}

/**
 * Concessions and credits: parenthesised positives in GREY_1 at weight 400 —
 * `(100.00)`. One marker applied everywhere. Never a red minus, never a
 * colour that vanishes in greyscale.
 */
export function parenMoney(n: number): string {
  return `(${money(Math.abs(n))})`;
}

/** Label + value where either run may be a different script (see drawMixedText). */
export function mixed(
  doc: PDFKit.PDFDocument,
  runs: MixedTextRun[],
  x: number,
  y: number,
  o: { width: number; align: 'left' | 'right' | 'center'; size: number; color?: string },
): void {
  drawMixedText(doc, runs, x, y, {
    width: o.width,
    align: o.align,
    fontSize: o.size,
    color: o.color ?? INK,
  });
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export function rule(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  weight: number,
  color: string,
  dashed = false,
): void {
  doc.save();
  if (dashed) doc.dash(mm(1.2), { space: mm(1) });
  doc
    .moveTo(x, y)
    .lineTo(x + w, y)
    .lineWidth(weight)
    .strokeColor(color)
    .stroke();
  doc.restore();
}

// ─── Asset misses ────────────────────────────────────────────────────────────

/**
 * A drawable asset that arrived as bytes but could not be DRAWN — pdfkit
 * rejected it (corrupt file, unsupported encoding, a text file with a .png
 * name). Distinct from a fetch failure, which never reaches this module.
 *
 * These are *recorded*, not logged. This module stays a pure renderer with no
 * logger dependency; the half-renderers return the misses, and the
 * orchestrating service — which is also the only layer that still knows the
 * asset's stored ref — logs them at the same boundary it already logs fetch
 * failures, in the same message shape.
 */
export interface AssetMiss {
  /** Matches the fetch-side `kind`: logo | payment-QR | principal-signature | school-stamp. */
  kind: string;
  reason: string;
}

const reasonOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// ─── Designed placeholders ───────────────────────────────────────────────────

/**
 * The logo slot. A missing asset must read as a deliberate placeholder, never
 * as a bare rectangle: a 0.5pt accent-bordered box with a centred accent
 * monogram taken from the school's own initials. When an asset exists it goes
 * inside the SAME fixed box, so the layout never shifts either way.
 */
export function logoBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  size: number,
  monogramSize: number,
  schoolName: string,
  logo: Buffer | null,
  misses?: AssetMiss[],
): void {
  if (logo) {
    try {
      doc.save();
      doc.rect(x, y, size, size).clip();
      doc.image(logo, x, y, { fit: [size, size], align: 'center', valign: 'center' });
      doc.restore();
      return;
    } catch (err) {
      // Corrupt or unsupported bytes must never break bill generation — fall
      // through to the monogram, which is a designed state rather than a gap.
      // Recorded so the fallback is not silent.
      doc.restore();
      misses?.push({ kind: 'logo', reason: reasonOf(err) });
    }
  }
  doc.rect(x, y, size, size).lineWidth(0.5).strokeColor(ACCENT).stroke();
  const mono = monogram(schoolName);
  text(doc, mono, x, y + (size - monogramSize * 1.2) / 2, {
    size: monogramSize,
    weight: 700,
    color: ACCENT,
    width: size,
    align: 'center',
  });
}

/** "Demo School Nepal" -> "DS". Latin initials only; falls back to the first glyph. */
export function monogram(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return initials || name.trim().slice(0, 2).toUpperCase();
}

/**
 * The payment-QR slot. BILL-PRINT-1 does not generate the QR (out of scope) —
 * this renders the designed placeholder and leaves the asset slot wired, so a
 * later ticket drops the real image into the same 18mm box with no layout
 * change. An 18x18mm 0.5pt bordered box containing a 7x7mm 0.25pt inner
 * outline and a 5pt SCAN / TO PAY label.
 */
export function qrBox(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  size: number,
  labelTop: string,
  labelBottom: string,
  qr: Buffer | null,
  misses?: AssetMiss[],
): void {
  doc.rect(x, y, size, size).lineWidth(0.5).strokeColor(GREY_2).stroke();
  if (qr) {
    try {
      doc.save();
      doc.rect(x, y, size, size).clip();
      doc.image(qr, x, y, { fit: [size, size], align: 'center', valign: 'center' });
      doc.restore();
      return;
    } catch (err) {
      doc.restore();
      misses?.push({ kind: 'payment-QR', reason: reasonOf(err) });
    }
  }
  // Scales with the box (7/18 of it), so the placeholder keeps its proportions.
  const inner = size * (7 / 18);
  const gap = mm(0.8);
  const labelH = 5 * 1.2;
  const stackH = inner + gap + labelH * 2;
  const innerY = y + (size - stackH) / 2;
  doc
    .rect(x + (size - inner) / 2, innerY, inner, inner)
    .lineWidth(0.25)
    .strokeColor(GREY_2)
    .stroke();
  const opts = { size: 5, color: GREY_2, width: size, align: 'center' as const, track: 0.06 * 5 };
  text(doc, labelTop.toUpperCase(), x, innerY + inner + gap, opts);
  text(doc, labelBottom.toUpperCase(), x, innerY + inner + gap + labelH, opts);
}

/**
 * Draws an optional asset into an ALREADY-RESERVED box, scaled to fit, and
 * silently leaves the box empty on any failure.
 *
 * The guard is the point (BILL-PRINT-1 D4 ruling): a print job must never fail
 * because a decorative asset could not load. Every failure mode ends at the
 * same place — the blank reserved space, which is a designed state (it is
 * where a WET signature goes) rather than a gap. Covers a malformed stored
 * value (the FILE-1-BLOB `data:image/...;base64` case), unsupported bytes,
 * and anything pdfkit rejects. The caller has already reserved the space, so
 * nothing shifts either way.
 */
export function optionalImage(
  doc: PDFKit.PDFDocument,
  asset: Buffer | null,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { kind: string; misses?: AssetMiss[]; align?: 'left' | 'right' },
): void {
  if (!asset) return;
  try {
    doc.save();
    doc.rect(x, y, w, h).clip();
    // pdfkit's image align accepts only 'right' | 'center'; left is its
    // default, expressed by omitting the option.
    doc.image(asset, x, y, {
      fit: [w, h], valign: 'bottom',
      ...(opts.align === 'right' ? { align: 'right' as const } : {}),
    });
    doc.restore();
  } catch (err) {
    // The asset downloaded fine but pdfkit could not decode it. Fall back to
    // the blank reserved space — a designed state — and record the miss so the
    // caller can report it. Never throws: a decorative asset must not take
    // down a money document.
    doc.restore();
    opts.misses?.push({ kind: opts.kind, reason: reasonOf(err) });
  }
}

// ─── The sheet ───────────────────────────────────────────────────────────────

export type StackMode = 'duplicate' | 'batch';

/**
 * Draws one A5 document into the given half. It must fit. Returns any assets
 * that failed to draw, so the caller can report them (see AssetMiss).
 */
export type HalfRenderer = (
  doc: PDFKit.PDFDocument,
  box: HalfBox,
  copyLabel: string | null,
) => AssetMiss[] | void;

export interface SheetOpts {
  stackMode: StackMode;
  /** Copy eyebrows for duplicate mode, e.g. ['Student Copy', 'Office Copy']. */
  copyLabels: [string, string];
  /** The cut marker's word, from the label catalogue. */
  cutLabel: string;
}

/**
 * Renders one A4 sheet holding two A5 halves and the cut line between them.
 *
 * `halves` carries one renderer in duplicate mode (drawn twice) or up to two
 * in batch mode. A batch with an odd count passes a single renderer and the
 * trailing half is simply left blank — the cut line still prints, so the sheet
 * remains usable stationery.
 */
export function drawSheet(doc: PDFKit.PDFDocument, halves: HalfRenderer[], opts: SheetOpts): AssetMiss[] {
  const [first, second] = opts.stackMode === 'duplicate' ? [halves[0], halves[0]] : halves;
  const misses: AssetMiss[] = [];

  misses.push(...(first(doc, halfBox(0), opts.stackMode === 'duplicate' ? opts.copyLabels[0] : null) ?? []));
  if (second) {
    misses.push(...(second(doc, halfBox(1), opts.stackMode === 'duplicate' ? opts.copyLabels[1] : null) ?? []));
  }

  // Cut line at exactly 148.5mm, full width, plus the scissors marker sitting
  // at left: 3mm on a white chip so it never collides with the dashed rule.
  rule(doc, 0, HALF_H, SHEET_W, RULE_HAIR, GREY_2, true);
  const markerY = HALF_H - mm(2.1);
  const marker = `✂ ${opts.cutLabel}`;
  const markerW = widthOf(doc, marker, { size: 5, track: 0.12 * 5 }) + mm(2);
  doc.rect(mm(3) - mm(1), markerY - mm(0.4), markerW, mm(2.6)).fill('#ffffff');
  text(doc, marker, mm(3), markerY, { size: 5, color: GREY_2, track: 0.12 * 5 });

  // The same asset draws once per half, so a single corrupt file yields one
  // miss per half. Deduped by kind — the caller wants "the stamp is broken",
  // not two identical lines.
  return misses.filter((m, i) => misses.findIndex((o) => o.kind === m.kind) === i);
}

/** A4 page dimensions, for the renderers that construct the PDFDocument. */
export const PAGE = { width: SHEET_W, height: SHEET_H };
