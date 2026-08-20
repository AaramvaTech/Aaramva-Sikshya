import {
  mm, INK, GREY_1, GREY_2, GREY_3, ACCENT,
  RULE_ACCENT, RULE_INK, RULE_HAIR, RULE_ROW,
  Locale, LINE_HEIGHT, ROW_PAD, HEAD_PAD, TOTALS_W, EYEBROW_SIZE, STEP,
} from './mm';
import {
  HalfBox, text, eyebrow, eyebrowH, money, parenMoney, mixed, rule, truncate,
  clampWords, widthOf, logoBox, qrBox, optionalImage, assertFits, AssetMiss, displayWebsite,
  PrintCapacityError,
} from './a5-sheet';
import { LabelKey } from '../bill-print-labels';

/**
 * BILL-PRINT-1 — one A5 fee invoice, per SPEC §6.
 *
 * Structure top to bottom: header band, accent header rule, document
 * identity, hairline, party block, hairline, fee table, totals block, amount
 * in words, [spacer], footer band, fine print.
 *
 * The footer band is positioned from a FIXED BASELINE measured up from the
 * half's bottom edge and the body is asserted to end above it (Decision 1) —
 * a pdfkit draw cursor does not self-correct the way a flex spacer did, so a
 * collision has to fail the render rather than print on top of itself.
 */

export interface InvoiceHalfLine {
  head: string;
  gross: number;
  /** Positive magnitude; rendered parenthesised. */
  concession: number;
  nonTaxable: number;
  taxable: number;
  total: number;
}

export interface InvoiceHalfSchool {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  pan: string | null;
  regNo: string | null;
  logo: Buffer | null;
  qr: Buffer | null;
  paymentInstructions: string | null;
  signatoryName: string | null;
  /**
   * Optional principal's signature and school stamp. SPEC §6 reserves clear
   * space above the signature rule for a WET signature; when a school has
   * uploaded an asset it is drawn INTO that same reserved space, so the
   * layout is identical either way. Both are best-effort: see optionalImage.
   */
  signature: Buffer | null;
  stamp: Buffer | null;
}

export interface InvoiceHalfData {
  school: InvoiceHalfSchool;
  number: string;
  issuedAd: string;
  issuedBs: string;
  dueAd: string;
  dueBs: string;
  fiscalYear: string;
  installment: string;
  studentName: string;
  className: string;
  section: string | null;
  roll: string | null;
  studentId: string | null;
  guardian: string | null;
  lines: InvoiceHalfLine[];
  subtotal: number;
  /** Signed, ledger convention: positive = owes (DR), negative = advance (CR). */
  previousBalance: number;
  totalReceivable: number;
  inWords: string | null;
  locale: Locale;
  label: (key: LabelKey) => string;
  /** Pluralised continuation-row text, e.g. "+ 1 more fee item". Bound to the
   *  document's language by the caller (see continuationLabel). */
  continuation: (count: number) => string;
}

/** Money-column widths, right-aligned, fixed mm (SPEC §6). Fee Head takes the rest. */
const COL = {
  gross: mm(22),
  concession: mm(24),
  nonTaxable: mm(24),
  taxable: mm(22),
  total: mm(24),
};
const MONEY_COLS_W = COL.gross + COL.concession + COL.nonTaxable + COL.taxable + COL.total;
/** Gutter between a column's right edge and its figure, so lakh commas never touch. */
const CELL_PAD = mm(1);

/** BILL-PRINT-1 refit: 15mm -> 12mm, matching the receipt's header. */
const LOGO = mm(12);
const MONOGRAM = 9.5;
/**
 * BILL-PRINT-1 refit: 18mm -> 15mm. 15mm is a HARD floor, not a fitting knob —
 * a NepalPay/eSewa payload at 13mm has modules too fine to survive a 300 DPI
 * photocopy, and a QR that will not scan costs more than the table row it buys.
 * The inner placeholder outline scales with it.
 */
const QR = mm(15);
const SIG_W = mm(46);
const INSTRUCTIONS_W = mm(78);
/**
 * Decision 4: `tenants.paymentInstructions` is unbounded tenant free text
 * going into a fixed slot in a box that must not grow. Three lines at 7.5pt
 * across 78mm is the budget; anything beyond is dropped on a word boundary.
 * Three keeps this column shorter than the QR beside it, so the footer band's
 * height stays pinned by the QR and cannot be pushed by tenant data.
 */
const INSTRUCTIONS_LINES = 3;

const BODY = 8;
const MONEY_SIZE = 8;

/**
 * The fee table always draws at least this many rows, padding with EMPTY ruled
 * rows the way a bank pay-in slip or a ledger form does.
 *
 * Why, rather than stretching the gaps: a 1-line invoice left ~35mm of dead
 * space, and closing that by scaling the inter-group boundaries needed a 4.31x
 * factor — at which point the document is inflated, not distributed, and two
 * invoices from the same school stop reading as the same template. Ruled blanks
 * fill the space honestly: the table's rhythm is IDENTICAL at every line count,
 * because it is always the same table.
 *
 * Second benefit, and it matters on a money document: a bill with no blank
 * ruled space cannot have a line added to it by hand after issue.
 *
 * 6 is the measured spec-density capacity, so the minimum is exactly what the
 * half holds without compressing anything.
 */
export const MIN_FEE_ROWS = 6;

/** Spec density, then the compressed floor. Nothing below the floor. */
interface Density {
  rowPad: number;
  size: number;
}

export function densities(locale: Locale): [Density, Density] {
  return [
    { rowPad: ROW_PAD[locale], size: BODY },
    // The floor: Devanagari's own 0.7mm row padding (a value the spec already
    // blesses as legible) and one type step down. Below this, rows come off
    // instead — the type does not shrink further.
    { rowPad: mm(0.7), size: 7.5 },
  ];
}

export function rowHeight(d: Density, locale: Locale): number {
  return d.size * LINE_HEIGHT[locale] + d.rowPad * 2;
}

/** What one rendered half reports back: its row plan, plus any asset that
 *  arrived as bytes but could not be drawn. */
export interface InvoiceHalfResult extends FeeRowPlan {
  assetMisses: AssetMiss[];
}

export interface FeeRowPlan {
  density: Density;
  visible: InvoiceHalfLine[];
  omitted: number;
  /** Sum of the omitted lines' totals. visible + residual === subtotal. */
  residual: number;
}

/**
 * Decision 3: compress to a stated floor, then a continuation line.
 *
 * The continuation row is NOT decorative — it carries the omitted count AND
 * the summed residual, so the printed lines plus that row always add up to
 * the subtotal. An accountant reconciling the sheet against the ledger must
 * never find a gap; a bill whose printed lines don't foot is worse than one
 * that spills.
 */
export function planFeeRows(
  lines: InvoiceHalfLine[],
  available: number,
  subtotal: number,
  locale: Locale,
): FeeRowPlan {
  const [spec, floor] = densities(locale);
  // An invoice with no lines is a data problem, not a layout one — it still
  // renders (as an all-blank ruled table) rather than throwing the capacity
  // error, which is specifically about lines that exist but cannot fit.
  if (lines.length === 0) {
    return { density: spec, visible: [], omitted: 0, residual: 0 };
  }
  for (const density of [spec, floor]) {
    if (lines.length * rowHeight(density, locale) <= available) {
      return { density, visible: lines, omitted: 0, residual: 0 };
    }
  }
  // Still too many at the floor: keep as many as fit alongside the
  // continuation row, which occupies one row of the same height.
  const rowH = rowHeight(floor, locale);
  const rowsAvailable = Math.floor(available / rowH);
  const keep = rowsAvailable - 1;
  // The continuation row may never be the only row. A table whose sole entry
  // reads "+ 9 more fee items" itemises nothing — see PrintCapacityError.
  if (keep < 1) throw new PrintCapacityError('Invoice', Math.max(0, rowsAvailable));
  const visible = lines.slice(0, keep);
  const shown = visible.reduce((a, l) => a + l.total, 0);
  return {
    density: floor,
    visible,
    omitted: lines.length - keep,
    // Derived from the subtotal, not from summing the omitted lines, so the
    // printed column reconciles exactly even if the two ever disagree.
    residual: Math.round((subtotal - shown) * 100) / 100,
  };
}

// ─── Footer ──────────────────────────────────────────────────────────────────

/**
 * Clear space above the signature rule, for a wet signature or an uploaded
 * signature asset.
 *
 * SPEC §6 says 2.6mm. This uses 4.4mm, which is a deliberate, flagged
 * deviation and it costs NOTHING: the footer band's height is
 * max(QR, signatureStack), the QR is 15mm, and the signature stack reaches
 * only 14.95mm even in Devanagari at 4.4mm. The slack was already there and
 * unused; spending it on signing space makes an uploaded signature legible
 * instead of a 2.6mm sliver, and buys a real wet signature room to breathe.
 * Anything above 4.4mm starts pushing the band and costing fee rows.
 */
const SIGN_GAP = mm(4.4);

/** Height of the signature stack: eyebrow, signing gap, rule, name, designation. */
function signatureHeight(locale: Locale): number {
  return eyebrowH(locale) + SIGN_GAP + RULE_INK + BODY * LINE_HEIGHT[locale] + eyebrowH(locale);
}

/** The whole footer band plus the fine-print line beneath it. */
export function footerHeight(locale: Locale): number {
  const band = Math.max(QR, signatureHeight(locale));
  const finePrint = 5.5 * LINE_HEIGHT[locale];
  return RULE_HAIR + STEP.md + band + STEP.xs + finePrint;
}

// ─── The half ────────────────────────────────────────────────────────────────

/**
 * Returns what it actually printed — the chosen density, the visible rows,
 * and any continuation residual. Verification and the capacity measurement
 * both read this rather than re-deriving the budget arithmetic, so there is
 * only ever one source of truth for how much fits.
 */
export function renderInvoiceHalf(
  doc: PDFKit.PDFDocument,
  box: HalfBox,
  data: InvoiceHalfData,
  copyLabel: string | null,
): InvoiceHalfResult {
  const { locale, label } = data;
  const assetMisses: AssetMiss[] = [];
  const L = box.x;
  const W = box.w;
  const R = L + W;
  const eyeH = eyebrowH(locale);
  let y = box.y;

  // ── Header band ────────────────────────────────────────────────────────────
  const panW = mm(40);
  const textX = L + LOGO + mm(5);
  const textW = W - LOGO - mm(5) - panW - mm(5);
  logoBox(doc, L, y, LOGO, MONOGRAM, data.school.name, data.school.logo, assetMisses);

  let ty = y;
  text(doc, truncate(doc, data.school.name, textW, { size: 11, weight: 700 }), textX, ty, {
    size: 11, weight: 700, track: 0.01 * 11, width: textW,
  });
  ty += 11 * LINE_HEIGHT[locale];
  // BILL-PRINT-1 refit: the tagline is dropped from the invoice. It carries no
  // information a parent needs on a bill, and the header band is one of the
  // few places on a fixed 148.5mm half where height can be reclaimed for fee
  // rows. `school.tagline` stays on the interface — the field still exists and
  // other documents may want it — it is simply not drawn here.
  const contact = [data.school.address, data.school.phone, displayWebsite(data.school.website)]
    .filter((p): p is string => !!p);
  if (contact.length > 0) {
    // Address is tenant-entered and may be Devanagari; phone/website are not.
    // Each run is font-picked independently (the mixed-script tofu bug).
    const runs = contact.flatMap((p, i) => (i > 0 ? [{ text: '  ·  ' }, { text: p }] : [{ text: p }]));
    mixed(doc, runs, textX, ty, { width: textW, align: 'left', size: 7.5, color: INK });
    ty += 7.5 * LINE_HEIGHT[locale];
  }

  // PAN / Reg. — statutory, must stay legible after photocopy.
  let py = y;
  if (data.school.pan) {
    eyebrow(doc, label('panNo'), R - panW, py, locale, { size: 5.5, width: panW, align: 'right' });
    py += 5.5 * LINE_HEIGHT[locale];
    text(doc, data.school.pan, R - panW, py, { size: 8, weight: 600, width: panW, align: 'right' });
    py += 8 * LINE_HEIGHT[locale];
  }
  if (data.school.regNo) {
    eyebrow(doc, label('regNo'), R - panW, py, locale, { size: 5.5, width: panW, align: 'right' });
    py += 5.5 * LINE_HEIGHT[locale];
    text(doc, data.school.regNo, R - panW, py, { size: 8, weight: 600, width: panW, align: 'right' });
    py += 8 * LINE_HEIGHT[locale];
  }

  y = Math.max(y + LOGO, ty, py);

  // ── Header rule — accent use 1 of 4 ────────────────────────────────────────
  y += STEP.md;
  rule(doc, L, y, W, RULE_ACCENT, ACCENT);
  y += STEP.md;

  // ── Document identity ──────────────────────────────────────────────────────
  // Left and right stacks are bottom-aligned (the reference's flex-end).
  const dateRowH = eyeH > 7.5 * LINE_HEIGHT[locale] ? eyeH : 7.5 * LINE_HEIGHT[locale];
  const rightH = dateRowH * 3;
  const leftH = (copyLabel ? eyeH : 0) + 14 * LINE_HEIGHT[locale] + 8.5 * LINE_HEIGHT[locale];
  const identityH = Math.max(leftH, rightH);
  const leftTop = y + (identityH - leftH);
  const rightTop = y + (identityH - rightH);

  let ly = leftTop;
  if (copyLabel) {
    eyebrow(doc, copyLabel, L, ly, locale);
    ly += eyeH;
  }
  // Document title — accent use 2 of 4.
  text(doc, label('invoice').toUpperCase(), L, ly, {
    size: 14, weight: 700, color: ACCENT, track: locale === 'en' ? 0.04 * 14 : 0,
  });
  ly += 14 * LINE_HEIGHT[locale];
  text(doc, data.number, L, ly, { size: 8.5, weight: 700 });

  const valueW = mm(38);
  const dateRow = (labelText: string, value: string, rowY: number) => {
    const vx = R - valueW;
    eyebrow(doc, labelText, L, rowY + (dateRowH - eyeH) / 2, locale, {
      width: vx - mm(3) - L, align: 'right',
    });
    text(doc, value, vx, rowY + (dateRowH - 7.5 * LINE_HEIGHT[locale]) / 2, {
      size: 7.5, weight: 600, width: valueW, align: 'right',
    });
  };
  dateRow(label('issued'), `${data.issuedAd} (BS ${data.issuedBs})`, rightTop);
  dateRow(label('due'), `${data.dueAd} (BS ${data.dueBs})`, rightTop + dateRowH);
  dateRow(label('fyInstallment'), `${data.fiscalYear}  ·  ${data.installment}`, rightTop + dateRowH * 2);

  y += identityH + STEP.lg;
  rule(doc, L, y, W, RULE_HAIR, GREY_2);
  y += STEP.sm;

  // ── Party block — grid 1.5fr 1fr 0.6fr 1.2fr 1.3fr, gap 4mm ────────────────
  const fr = [1.5, 1, 0.6, 1.2, 1.3];
  const gap = mm(4);
  const unit = (W - gap * 4) / fr.reduce((a, b) => a + b, 0);
  const cells: Array<[string, string]> = [
    [label('student'), data.studentName],
    [label('classSection'), data.section ? `${data.className} / ${data.section}` : data.className],
    [label('roll'), data.roll ?? ''],
    [label('studentIdNo'), data.studentId ?? ''],
    [label('guardian'), data.guardian ?? ''],
  ];
  let cx = L;
  cells.forEach(([labelText, value], i) => {
    const cw = unit * fr[i];
    eyebrow(doc, labelText, cx, y, locale, { width: cw });
    // A missing optional field keeps its slot's geometry and renders empty —
    // the layout must not shift (SPEC's real-data rule).
    text(doc, truncate(doc, value, cw, { size: 8, weight: 600 }), cx, y + eyeH, {
      size: 8, weight: 600, width: cw,
    });
    cx += cw + gap;
  });
  y += eyeH + 8 * LINE_HEIGHT[locale] + STEP.sm;
  rule(doc, L, y, W, RULE_HAIR, GREY_2);
  y += STEP.sm;

  // ── Fee table ──────────────────────────────────────────────────────────────
  const headW = W - MONEY_COLS_W;
  const xs = {
    head: L,
    gross: L + headW,
    concession: L + headW + COL.gross,
    nonTaxable: L + headW + COL.gross + COL.concession,
    taxable: L + headW + COL.gross + COL.concession + COL.nonTaxable,
    total: R - COL.total,
  };

  const heads: Array<[string, number, number]> = [
    [label('feeHead'), xs.head, headW],
    [label('gross'), xs.gross, COL.gross],
    [label('concession'), xs.concession, COL.concession],
    [label('nonTaxable'), xs.nonTaxable, COL.nonTaxable],
    [label('taxable'), xs.taxable, COL.taxable],
    [label('total'), xs.total, COL.total],
  ];
  heads.forEach(([labelText, hx, hw], i) => {
    eyebrow(doc, labelText, i === 0 ? hx : hx, y, locale, {
      width: i === 0 ? hw : hw - CELL_PAD,
      align: i === 0 ? 'left' : 'right',
    });
  });
  y += eyeH + HEAD_PAD[locale];

  // Everything below the table is fixed-height, so the table's own budget is
  // whatever is left once the footer, totals, and in-words blocks are reserved.
  const footerTop = box.bottom - footerHeight(locale);
  // The totals band now includes the amount-in-words block (they share one
  // band), so there is no separate wordsH term to reserve.
  const tableBudget = footerTop - y - RULE_INK - STEP.lg - totalsHeight(locale) - STEP.sm;

  const plan = planFeeRows(data.lines, tableBudget, data.subtotal, locale);
  const rowH = rowHeight(plan.density, locale);
  const cellY = (rowTop: number) => rowTop + plan.density.rowPad;
  const cellOpts = { size: plan.density.size };

  plan.visible.forEach((line, i) => {
    rule(doc, L, y, W, RULE_ROW, i === 0 ? GREY_2 : GREY_3);
    const ty2 = cellY(y);
    text(doc, truncate(doc, line.head, headW - CELL_PAD, cellOpts), xs.head, ty2, cellOpts);
    const cell = (value: string, cxx: number, cw: number, weight: 400 | 500 | 600, color = INK) =>
      text(doc, value, cxx, ty2, {
        ...cellOpts, weight, color, width: cw - CELL_PAD, align: 'right',
      });
    cell(money(line.gross), xs.gross, COL.gross, 500);
    // Concession: parenthesised positive in GREY_1 at 400 — greyscale-safe,
    // never a red minus.
    cell(line.concession > 0 ? parenMoney(line.concession) : money(0),
      xs.concession, COL.concession, 400, line.concession > 0 ? GREY_1 : INK);
    cell(money(line.nonTaxable), xs.nonTaxable, COL.nonTaxable, 500);
    cell(money(line.taxable), xs.taxable, COL.taxable, 500);
    cell(money(line.total), xs.total, COL.total, 600);
    y += rowH;
  });

  if (plan.omitted > 0) {
    rule(doc, L, y, W, RULE_ROW, plan.visible.length === 0 ? GREY_2 : GREY_3);
    const ty2 = cellY(y);
    text(doc, data.continuation(plan.omitted), xs.head, ty2, { ...cellOpts, color: GREY_1 });
    text(doc, money(plan.residual), xs.total, ty2, {
      ...cellOpts, weight: 600, width: COL.total - CELL_PAD, align: 'right',
    });
    y += rowH;
  } else {
    // Pad to MIN_FEE_ROWS with EMPTY ruled rows — same hairline, same pitch,
    // no figures. A blank row must read as blank: printing 0.00 would put a
    // number on the page that never came from the ledger, and the subtotal
    // must keep footing against real lines only.
    //
    // Bounded by the remaining budget as well as by MIN_FEE_ROWS, so a tighter
    // half draws fewer blanks instead of overflowing.
    const roomLeft = Math.floor((tableBudget - plan.visible.length * rowH) / rowH);
    const blanks = Math.max(0, Math.min(MIN_FEE_ROWS - plan.visible.length, roomLeft));
    for (let i = 0; i < blanks; i++) {
      rule(doc, L, y, W, RULE_ROW, plan.visible.length === 0 && i === 0 ? GREY_2 : GREY_3);
      y += rowH;
    }
  }

  rule(doc, L, y, W, RULE_INK, INK);
  y += STEP.lg;

  // ── Totals block ───────────────────────────────────────────────────────────
  const tW = TOTALS_W[locale];
  const tX = R - tW;
  const totalRow = (labelText: string, value: string, marker?: string) => {
    text(doc, labelText, tX, y, { size: 8, weight: 600, width: tW * 0.62 });
    if (marker) {
      const lw = widthOf(doc, labelText, { size: 8, weight: 600 });
      text(doc, marker, tX + lw + mm(1), y + (8 - EYEBROW_SIZE[locale]) * 0.7, {
        size: EYEBROW_SIZE[locale], weight: 600, color: GREY_1, track: 0.09 * EYEBROW_SIZE[locale],
      });
    }
    text(doc, value, tX, y, { size: 8, weight: 600, width: tW, align: 'right' });
    y += 8 * LINE_HEIGHT[locale];
  };
  totalRow(label('subtotal'), money(data.subtotal));
  // The previous-balance row ALWAYS renders, at 0.00 with the correct marker
  // when there is none — never a blank cell, never a dash.
  totalRow(
    label('previousBalanceOutstanding'),
    money(Math.abs(data.previousBalance)),
    drCr(data.previousBalance),
  );

  // ── Total band: amount in words (left) beside the total figure (right) ────
  //
  // BILL-PRINT-1 refit: amount-in-words moved from BELOW the totals stack to
  // BESIDE it, sharing one band. This is the arrangement SPEC §7 already
  // specifies for the RECEIPT ("flex row. Left, amount in words. Right, ...
  // AMOUNT RECEIVED eyebrow baseline-aligned against the figure"), so the two
  // documents now agree instead of the invoice stacking what the receipt sets
  // side by side.
  //
  // It reclaims the ~6mm the stacked block spent on full-width height while
  // occupying only the left 108mm, and that 6mm is a sixth fee row — the fee
  // table is the part of this document that has to absorb real data, and the
  // whitespace was going to a block that did not need it. The words themselves
  // are untouched: same eyebrow, same 7.5pt/600 text, same ruled underline.
  y += STEP.lg;
  const bandTop = y;

  // Rule above the total figure — accent use 3 of 4.
  rule(doc, tX, bandTop, tW, RULE_ACCENT, ACCENT);
  const figureTop = bandTop + STEP.xs;

  // The one element carrying hierarchy: weight, size, and the rule above it.
  // No filled shape. The eyebrow is baseline-aligned to the figure's bottom.
  const figure = `Rs. ${money(data.totalReceivable)}`;
  const figureH = 15 * LINE_HEIGHT[locale];
  text(doc, figure, tX, figureTop, {
    size: 15, weight: 700, track: -0.01 * 15, width: tW, align: 'right',
  });
  eyebrow(doc, label('totalReceivable'), tX, figureTop + figureH - eyeH - mm(0.6), locale);
  let bandBottom = figureTop + figureH;

  // Amount in words — same band, left of the figure. The words sit on their
  // own ruled line, as before.
  if (data.inWords) {
    // The words column is bounded to leave a 4mm gutter before the totals
    // block's left edge. Both the eyebrow AND the value carry that width now
    // that the two blocks share a band — an unbounded label could run under
    // the figure, which the stacked layout made impossible.
    const wordsW = W - tW - mm(4);
    eyebrow(doc, label('amountInWords'), L, bandTop, locale, { width: wordsW });
    text(doc, truncate(doc, data.inWords, wordsW, { size: 7.5, weight: 600 }), L, bandTop + eyeH, {
      size: 7.5, weight: 600, width: wordsW,
    });
    const underlineY = bandTop + eyeH + 7.5 * LINE_HEIGHT[locale] + STEP.xs;
    rule(doc, L, underlineY, wordsW, RULE_HAIR, GREY_2);
    bandBottom = Math.max(bandBottom, underlineY);
  }
  y = bandBottom;

  // ── Footer band, drawn from the fixed baseline up ──────────────────────────
  assertFits('Invoice', y, footerTop);
  renderFooter(doc, box, data, footerTop, assetMisses);
  return { ...plan, assetMisses };
}

function drCr(signed: number): string {
  return signed < 0 ? '(CR)' : '(DR)';
}

/**
 * Subtotal + previous-balance rows, then the shared total band: the accent
 * rule and figure on the right, the amount-in-words block on the left. The
 * band is as tall as whichever side is taller, which is why they are max'd
 * rather than summed — that max IS the saving this refit buys.
 */
function totalsHeight(locale: Locale): number {
  const rows = 8 * LINE_HEIGHT[locale] * 2;
  const eyeH = EYEBROW_SIZE[locale] * LINE_HEIGHT[locale];
  const figureSide = RULE_ACCENT + STEP.xs + 15 * LINE_HEIGHT[locale];
  const wordsSide = eyeH + 7.5 * LINE_HEIGHT[locale] + STEP.xs + RULE_HAIR;
  return rows + STEP.lg + Math.max(figureSide, wordsSide);
}

function renderFooter(
  doc: PDFKit.PDFDocument,
  box: HalfBox,
  data: InvoiceHalfData,
  footerTop: number,
  assetMisses: AssetMiss[],
): void {
  const { locale, label } = data;
  const L = box.x;
  const R = box.x + box.w;
  const eyeH = eyebrowH(locale);

  rule(doc, L, footerTop, box.w, RULE_HAIR, GREY_2);
  const bandY = footerTop + RULE_HAIR + STEP.md;

  // 1. Payment instructions — clamped to a measured budget so unbounded
  //    tenant free text can never grow the fixed half (Decision 4).
  if (data.school.paymentInstructions) {
    eyebrow(doc, label('paymentInstructions'), L, bandY, locale);
    const clamped = clampWords(
      doc, data.school.paymentInstructions, INSTRUCTIONS_W, INSTRUCTIONS_LINES, { size: 7.5 },
    );
    text(doc, clamped, L, bandY + eyeH, {
      size: 7.5, width: INSTRUCTIONS_W, wrap: true, locale,
    });
  }

  // 2. QR — designed placeholder, real asset slot wired (generation out of scope).
  const qrX = R - SIG_W - mm(6) - QR;
  qrBox(doc, qrX, bandY, QR, label('scan'), label('toPay'), data.school.qr, assetMisses);

  // 3. Signature — content justified to the band's bottom.
  const sigX = R - SIG_W;
  const sigTop = bandY + Math.max(QR, signatureHeight(locale)) - signatureHeight(locale);
  let sy = sigTop;
  eyebrow(doc, label('authorisedSignature'), sigX, sy, locale, { width: SIG_W });
  sy += eyeH;
  // The stamp sits to the right of the signature within the same reserved
  // space, so a school using both still shifts nothing.
  const stampW = data.school.stamp ? SIGN_GAP : 0;
  optionalImage(doc, data.school.signature, sigX, sy, SIG_W - stampW, SIGN_GAP,
    { kind: 'principal-signature', misses: assetMisses });
  optionalImage(doc, data.school.stamp, sigX + SIG_W - stampW, sy, stampW, SIGN_GAP,
    { kind: 'school-stamp', align: 'right', misses: assetMisses });
  sy += SIGN_GAP;
  rule(doc, sigX, sy, SIG_W, RULE_INK, INK);
  sy += RULE_INK;
  if (data.school.signatoryName) {
    text(doc, truncate(doc, data.school.signatoryName, SIG_W, { size: 8, weight: 600 }), sigX, sy, {
      size: 8, weight: 600, width: SIG_W,
    });
  }
  sy += 8 * LINE_HEIGHT[locale];
  eyebrow(doc, label('principal'), sigX, sy, locale, { width: SIG_W });

  // Fine print — the note and the document number repeated for filing.
  const fineY = box.bottom - 5.5 * LINE_HEIGHT[locale];
  text(doc, label('computerGeneratedInvoice'), L, fineY, {
    size: 5.5, color: GREY_1, track: 0.03 * 5.5,
  });
  text(doc, data.number, L, fineY, {
    size: 5.5, color: GREY_1, track: 0.03 * 5.5, width: box.w, align: 'right',
  });
}
