/**
 * BILL-PRINT-1 — units, palette, and type scale for the A5 print stationery.
 *
 * Authority: docs/design/billing-print/SPEC.md §4-§5. Every value here is
 * lifted from that document; nothing is invented.
 *
 * Why there are no px/rem/em anywhere: pdfkit's only unit is the PostScript
 * point. The spec is written in mm and pt, and 1mm = 2.834645669pt exactly,
 * so both map onto the drawing API without an intermediate CSS layer that
 * could leak a design token into print geometry. The "no px" rule the ticket
 * asks for is satisfied by construction rather than by assertion.
 */

/** Millimetres to PostScript points. 72pt / 25.4mm. */
export const mm = (n: number): number => (n * 72) / 25.4;

/** A4 portrait, per SPEC §5. */
export const SHEET_W = mm(210);
export const SHEET_H = mm(297);

/** One A5 half. Two stack vertically; 148.5 = 297/2 exactly. */
export const HALF_H = mm(148.5);

/** Safe area inside a half: padding 12mm 12mm 10mm 12mm (SPEC §5). */
export const PAD_TOP = mm(12);
export const PAD_SIDE = mm(12);
export const PAD_BOTTOM = mm(10);

/** Content box: 210 - 24 = 186mm wide, 148.5 - 22 = 126.5mm tall. */
export const CONTENT_W = SHEET_W - PAD_SIDE * 2;
export const CONTENT_H = HALF_H - PAD_TOP - PAD_BOTTOM;

// ─── Colour — four greys and one accent (SPEC §4) ────────────────────────────
// The accent appears in exactly four places per document: the header rule,
// the document title, the rule above the total figure, and the logo monogram
// border. Nowhere else. No filled backgrounds, no tints, no zebra striping.

export const INK = '#111111';
export const GREY_1 = '#5a5a5a'; // labels, eyebrows, tagline, concessions, fine print
export const GREY_2 = '#b0b0b0'; // hairlines, cut line, placeholder borders
export const GREY_3 = '#dcdcdc'; // interior table row separators only
export const ACCENT = '#0d5c43';

// ─── Rule weights (SPEC §4) ──────────────────────────────────────────────────

export const RULE_ACCENT = 0.75; // header rule; rule above the total figure
export const RULE_INK = 0.5; // table closing rule; signature line
export const RULE_BOX = 0.5; // placeholder box borders (logo, QR)
export const RULE_HAIR = 0.25; // group separators; in-words underline; remark lines
export const RULE_ROW = 0.25; // interior table row separators (GREY_3)

// ─── Typography ──────────────────────────────────────────────────────────────

export type Locale = 'en' | 'ne';

/**
 * Per-locale line-height, deliberately not shared (SPEC §4). Devanagari sits
 * at 1.40 rather than the 1.5 the brief suggested because the halves are
 * height-constrained; verified against glyph clipping during fitting.
 */
export const LINE_HEIGHT: Record<Locale, number> = { en: 1.35, ne: 1.4 };

/**
 * Eyebrow labels: 6.25pt Latin (tracked 0.09em, uppercase) / 6.5pt Devanagari
 * (untracked — tracking damages conjuncts, SPEC §4).
 */
export const EYEBROW_SIZE: Record<Locale, number> = { en: 6.25, ne: 6.5 };
export const EYEBROW_TRACK: Record<Locale, number> = { en: 0.09 * 6.25, ne: 0 };

/** Computer-generated note / filing number: 5.5pt Latin, 6pt Devanagari. */
export const FINEPRINT_SIZE: Record<Locale, number> = { en: 5.5, ne: 6 };

/** Table row padding, vertical: 1.1mm Latin, 0.7mm Devanagari (SPEC §4). */
export const ROW_PAD: Record<Locale, number> = { en: mm(1.1), ne: mm(0.7) };

/** Column-head padding-bottom: 1mm Latin / 0.9mm Devanagari. */
export const HEAD_PAD: Record<Locale, number> = { en: mm(1), ne: mm(0.9) };

/**
 * Totals block width: 74mm Latin, 82mm Devanagari — the wider Devanagari
 * labels absorb into the same right edge so the two locales still overlay.
 */
export const TOTALS_W: Record<Locale, number> = { en: mm(74), ne: mm(82) };

/** Receipt's amount band is marginally narrower than the invoice's (SPEC §7). */
export const RECEIPT_TOTALS_W: Record<Locale, number> = { en: mm(74), ne: mm(80) };

/**
 * Only two weights are embedded (Noto Regular 400 and Bold 700) — the spec's
 * 500 and 600 have no corresponding font file. Mapping: 400/500 -> regular,
 * 600/700 -> bold. This preserves every weight *contrast* the design relies
 * on (money cells 500 vs Total column 600 still reads as regular vs bold),
 * but flattens the two-step ramp into one. Flagged as a deviation.
 */
export type Weight = 400 | 500 | 600 | 700;
export const isBold = (w: Weight): boolean => w >= 600;

// ─── Vertical rhythm (SPEC §4) ───────────────────────────────────────────────
// "A small set of mm steps applied between rule groups."

/**
 * BILL-PRINT-1 refit: sm/md/lg trimmed (1.6/1.8/2 -> 1.4/1.5/1.6) to reclaim
 * height for fee rows. This was the LAST lever applied, not the first —
 * whitespace between rule groups is what makes the document read as
 * stationery rather than a form, so it is spent only after the fixed furniture
 * (QR box, header band) has given up what it can. The ordering
 * xs < sm < md < lg is preserved so the rhythm still steps.
 */
export const STEP = {
  xs: mm(1.2),
  sm: mm(1.4),
  md: mm(1.5),
  lg: mm(1.6),
  xl: mm(4),
} as const;
