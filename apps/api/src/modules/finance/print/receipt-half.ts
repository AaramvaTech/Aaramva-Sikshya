import {
  mm, INK, GREY_1, GREY_2, GREY_3, ACCENT,
  RULE_ACCENT, RULE_INK, RULE_HAIR, RULE_ROW,
  Locale, LINE_HEIGHT, ROW_PAD, HEAD_PAD, RECEIPT_TOTALS_W, EYEBROW_SIZE, STEP,
} from './mm';
import {
  HalfBox, text, eyebrow, eyebrowH, money, mixed, rule, truncate,
  widthOf, logoBox, optionalImage, assertFits, AssetMiss, displayWebsite, PrintCapacityError,
  drCrMarker,
} from './a5-sheet';
import { LabelKey } from '../bill-print-labels';

/**
 * BILL-PRINT-1 — one A5 payment receipt, per SPEC §7.
 *
 * The receipt acknowledges money received. It is shorter and denser at the
 * top than the invoice so it stays readable when the bottom is torn or
 * folded, and its footer carries three hand-annotation rules that also absorb
 * the height difference from the invoice — so the half fills rather than
 * floats.
 *
 * The balance-after-payment line is the single most requested item on a fee
 * slip and was absent from the previous receipt entirely. It ALWAYS renders.
 */

export interface ReceiptAllocation {
  invoiceNumber: string;
  installment: string;
  amount: number;
}

export interface ReceiptHalfData {
  school: {
    name: string;
    address: string | null;
    phone: string | null;
    website: string | null;
    pan: string | null;
    regNo: string | null;
    logo: Buffer | null;
    signatoryName: string | null;
    /** See InvoiceHalfSchool — same reserved space, same best-effort guard. */
    signature: Buffer | null;
    stamp: Buffer | null;
  };
  number: string;
  dateAd: string;
  dateBs: string;
  studentName: string;
  className: string;
  section: string | null;
  roll: string | null;
  method: string;
  /** Empty (not "N/A", not a dash) when the method has no reference — cash. */
  txnRef: string | null;
  amount: number;
  inWords: string | null;
  allocations: ReceiptAllocation[];
  /**
   * Money received but not applied to any invoice (an ADVANCE_ONLY payment,
   * or the remainder after allocation). It renders as its own row in the
   * allocation table so the printed rows ALWAYS sum to the amount received —
   * without it, a fully-unallocated payment prints an empty table under a
   * large figure and the slip does not foot.
   */
  advanceAmount: number;
  /** Magnitude as of this payment's own ledger entry. */
  balanceAfter: number;
  /** The ledger's own three-way sign for that balance — never re-derived here. */
  balanceAfterSign: 'OWES' | 'ADVANCE' | 'ZERO';
  receivedBy: string | null;
  locale: Locale;
  label: (key: LabelKey) => string;
  /** See InvoiceHalfData.continuation — "+ 1 more invoice" / "+ 3 more invoices". */
  continuation: (count: number) => string;
}

const LOGO = mm(12);
const MONOGRAM = 9.5;
const SIG_W = mm(46);
const RECEIVED_W = mm(40);
const REMARK_LINE_H = mm(5.6);
const REMARK_LINES = 3;
const BODY = 8;

/** Allocation columns: invoice number auto, Installment 40mm, Amount 30mm. */
const ALLOC = { installment: mm(40), amount: mm(30) };
const CELL_PAD = mm(1);

interface Density {
  rowPad: number;
  size: number;
}

function densities(locale: Locale): [Density, Density] {
  return [
    { rowPad: ROW_PAD[locale], size: BODY },
    { rowPad: mm(0.7), size: 7.5 },
  ];
}

function rowHeight(d: Density, locale: Locale): number {
  return d.size * LINE_HEIGHT[locale] + d.rowPad * 2;
}

/** See InvoiceHalfResult. */
export interface ReceiptHalfResult extends AllocationPlan {
  assetMisses: AssetMiss[];
  /**
   * The gap scale that would make this receipt's content fill the half exactly.
   * A receipt is a SHORT document — a one-allocation slip left ~38mm of dead
   * space above the remarks block, which is bug #3 from the brief ("half the
   * page empty with content floating at the top").
   *
   * The invoice does not have this problem because its fee table grows into
   * the space. The receipt has no such elastic group, so the slack is instead
   * distributed across the inter-group boundaries — PROPORTIONALLY, by
   * multiplying every boundary step by one scale factor, so the design's
   * 1.4/1.5/1.6mm rhythm keeps its relative proportions instead of flattening
   * to one uniform gap. No single element absorbs the slack, and the remarks
   * block keeps its specified height (3 lines at 5.6mm) as a hard floor —
   * hand-annotation space is never traded away for fitting.
   *
   * Render once to obtain this, then render again passing it as `gapScale`.
   */
  gapScaleForFit: number;
}

export interface AllocationPlan {
  density: Density;
  visible: ReceiptAllocation[];
  omitted: number;
  /** visible + residual === amount received. */
  residual: number;
}

/**
 * Decision 3, applied to allocations with the same reconciliation rule: the
 * printed rows plus the continuation residual must sum to the amount
 * received, so a receipt never shows money that doesn't add up.
 */
export function planAllocations(
  allocations: ReceiptAllocation[],
  available: number,
  amountReceived: number,
  locale: Locale,
): AllocationPlan {
  const [spec, floor] = densities(locale);
  // Nothing to lay out. Returned before the capacity guard because "no rows"
  // is a legitimate receipt (an advance-only payment allocates to nothing),
  // whereas "rows that do not fit" is the error the guard exists for.
  if (allocations.length === 0) {
    return { density: spec, visible: [], omitted: 0, residual: 0 };
  }
  for (const density of [spec, floor]) {
    if (allocations.length * rowHeight(density, locale) <= available) {
      return { density, visible: allocations, omitted: 0, residual: 0 };
    }
  }
  const rowH = rowHeight(floor, locale);
  const rowsAvailable = Math.floor(available / rowH);
  const keep = rowsAvailable - 1;
  // Identical defect to the fee table's: a receipt whose allocation table shows
  // only "+ 5 more invoices" tells a parent nothing about what was paid.
  if (keep < 1) throw new PrintCapacityError('Receipt', Math.max(0, rowsAvailable));
  const visible = allocations.slice(0, keep);
  const shown = visible.reduce((a, x) => a + x.amount, 0);
  return {
    density: floor,
    visible,
    omitted: allocations.length - keep,
    residual: Math.round((amountReceived - shown) * 100) / 100,
  };
}

/** Same reserved signing space as the invoice — see invoice-half.ts SIGN_GAP. */
const SIGN_GAP = mm(4.4);

function signatureHeight(locale: Locale): number {
  return eyebrowH(locale) + SIGN_GAP + RULE_INK + BODY * LINE_HEIGHT[locale] + eyebrowH(locale);
}

/** Received-by: eyebrow, name, rule, then 3.4mm of signing space beneath. */
function receivedByHeight(locale: Locale): number {
  return eyebrowH(locale) + BODY * LINE_HEIGHT[locale] + RULE_HAIR + mm(3.4);
}

function remarksHeight(locale: Locale): number {
  return eyebrowH(locale) + REMARK_LINE_H * REMARK_LINES;
}

export function footerHeight(locale: Locale): number {
  const band = Math.max(remarksHeight(locale), receivedByHeight(locale), signatureHeight(locale));
  return RULE_HAIR + STEP.md + band + STEP.xs + 5.5 * LINE_HEIGHT[locale];
}

export function renderReceiptHalf(
  doc: PDFKit.PDFDocument,
  box: HalfBox,
  data: ReceiptHalfData,
  copyLabel: string | null,
  gapScale = 1,
): ReceiptHalfResult {
  const { locale, label } = data;
  // The eight inter-group boundaries that share the slack. Scaling them by one
  // factor preserves their relative rhythm; at gapScale = 1 this is exactly
  // the unscaled layout.
  const g = (step: number): number => step * gapScale;
  const BASE_GAPS = STEP.md + STEP.lg + STEP.sm + STEP.sm + STEP.sm + STEP.lg + STEP.sm + STEP.lg;
  const assetMisses: AssetMiss[] = [];
  const L = box.x;
  const W = box.w;
  const R = L + W;
  const eyeH = eyebrowH(locale);
  let y = box.y;

  // ── Header band — reduced height: 12mm logo, no tagline, address retained ──
  const panW = mm(40);
  const textX = L + LOGO + mm(5);
  const textW = W - LOGO - mm(5) - panW - mm(5);
  logoBox(doc, L, y, LOGO, MONOGRAM, data.school.name, data.school.logo, assetMisses);

  let ty = y;
  text(doc, truncate(doc, data.school.name, textW, { size: 11, weight: 700 }), textX, ty, {
    size: 11, weight: 700, track: 0.01 * 11, width: textW,
  });
  ty += 11 * LINE_HEIGHT[locale];
  const contact = [data.school.address, data.school.phone, displayWebsite(data.school.website)]
    .filter((p): p is string => !!p);
  if (contact.length > 0) {
    const runs = contact.flatMap((p, i) => (i > 0 ? [{ text: '  ·  ' }, { text: p }] : [{ text: p }]));
    mixed(doc, runs, textX, ty, { width: textW, align: 'left', size: 7.5, color: INK });
    ty += 7.5 * LINE_HEIGHT[locale];
  }

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

  // ── Header rule — accent 1 of 4 ────────────────────────────────────────────
  y += STEP.md;
  rule(doc, L, y, W, RULE_ACCENT, ACCENT);
  y += g(STEP.md);                                    // boundary 1

  // ── Identity: no three-row date stack, just Receipt No. and Date ───────────
  const rowH2 = Math.max(eyeH, 7.5 * LINE_HEIGHT[locale]);
  const rightH = rowH2 * 2;
  const leftH = (copyLabel ? eyeH : 0) + 14 * LINE_HEIGHT[locale];
  const identityH = Math.max(leftH, rightH);
  let ly = y + (identityH - leftH);
  if (copyLabel) {
    eyebrow(doc, copyLabel, L, ly, locale);
    ly += eyeH;
  }
  // Document title — accent 2 of 4.
  text(doc, label('receipt').toUpperCase(), L, ly, {
    size: 14, weight: 700, color: ACCENT, track: locale === 'en' ? 0.04 * 14 : 0,
  });

  const valueW = mm(40);
  const idRow = (labelText: string, value: string, size: number, weight: 600 | 700, rowY: number) => {
    const vx = R - valueW;
    eyebrow(doc, labelText, L, rowY + (rowH2 - eyeH) / 2, locale, {
      width: vx - mm(3) - L, align: 'right',
    });
    text(doc, value, vx, rowY + (rowH2 - size * LINE_HEIGHT[locale]) / 2, {
      size, weight, width: valueW, align: 'right',
    });
  };
  const rightTop = y + (identityH - rightH);
  idRow(label('receiptNo'), data.number, 8.5, 700, rightTop);
  idRow(label('date'), `${data.dateAd} (BS ${data.dateBs})`, 7.5, 600, rightTop + rowH2);

  y += identityH + g(STEP.lg);                        // boundary 2
  rule(doc, L, y, W, RULE_HAIR, GREY_2);
  y += g(STEP.sm);                                    // boundary 3

  // ── Party block — grid 1.6fr 1fr 0.55fr 1fr 1.5fr ─────────────────────────
  const fr = [1.6, 1, 0.55, 1, 1.5];
  const gap = mm(4);
  const unit = (W - gap * 4) / fr.reduce((a, b) => a + b, 0);
  const cells: Array<[string, string]> = [
    [label('student'), data.studentName],
    [label('classSection'), data.section ? `${data.className} / ${data.section}` : data.className],
    [label('roll'), data.roll ?? ''],
    [label('method'), data.method],
    // Cash leaves this slot EMPTY with its geometry intact — no "N/A", no
    // dash. An empty labelled field reads as "not applicable" on paper;
    // "N/A" reads as a bug (Decision 5).
    [label('transactionRef'), data.txnRef ?? ''],
  ];
  let cx = L;
  cells.forEach(([labelText, value], i) => {
    const cw = unit * fr[i];
    eyebrow(doc, labelText, cx, y, locale, { width: cw });
    text(doc, truncate(doc, value, cw, { size: 8, weight: 600 }), cx, y + eyeH, {
      size: 8, weight: 600, width: cw,
    });
    cx += cw + gap;
  });
  y += eyeH + 8 * LINE_HEIGHT[locale] + g(STEP.sm);   // boundary 4
  rule(doc, L, y, W, RULE_HAIR, GREY_2);
  y += g(STEP.sm);                                    // boundary 5

  // ── Amount received band — flex row: words left, figure right ─────────────
  const tW = RECEIPT_TOTALS_W[locale];
  const tX = R - tW;
  const figureH = 16 * LINE_HEIGHT[locale];
  // Accent 3 of 4 — the rule above the dominant figure. No filled shape.
  rule(doc, tX, y, tW, RULE_ACCENT, ACCENT);
  const figureTop = y + STEP.xs;
  text(doc, `Rs. ${money(data.amount)}`, tX, figureTop, {
    size: 16, weight: 700, track: -0.01 * 16, width: tW, align: 'right',
  });
  eyebrow(doc, label('amountReceived'), tX, figureTop + figureH - eyeH - mm(0.6), locale);

  if (data.inWords) {
    const wordsW = W - tW - mm(4);
    eyebrow(doc, label('amountInWords'), L, figureTop, locale, { width: wordsW });
    text(doc, truncate(doc, data.inWords, wordsW, { size: 7.5, weight: 600 }), L, figureTop + eyeH, {
      size: 7.5, weight: 600, width: wordsW,
    });
  }
  y = figureTop + figureH + g(STEP.lg);               // boundary 6

  // ── Allocation table — "Paid towards" ─────────────────────────────────────
  const xs = {
    invoice: L,
    installment: R - ALLOC.installment - ALLOC.amount,
    amount: R - ALLOC.amount,
  };
  const invoiceW = xs.installment - L;

  eyebrow(doc, label('paidTowards'), xs.invoice, y, locale, { width: invoiceW });
  eyebrow(doc, label('installment'), xs.installment, y, locale, { width: ALLOC.installment });
  eyebrow(doc, label('amountApplied'), xs.amount, y, locale, {
    width: ALLOC.amount - CELL_PAD, align: 'right',
  });
  y += eyeH + HEAD_PAD[locale];

  const footerTop = box.bottom - footerHeight(locale);
  const balanceH = 9 * LINE_HEIGHT[locale];
  // Reserve BOTH trailing boundaries (7: table -> balance, 8: balance ->
  // footer) or a full allocation table overruns the footer by exactly the
  // boundary-8 gap.
  const allocBudget = footerTop - y - RULE_INK - g(STEP.sm) - balanceH - g(STEP.lg);
  // The advance row, when present, takes one row of the same height out of
  // the budget before the allocations are planned.
  const advanceRows = data.advanceAmount > 0 ? 1 : 0;
  const [, floorD] = densities(locale);
  const plan = planAllocations(
    data.allocations,
    allocBudget - advanceRows * rowHeight(floorD, locale),
    // The continuation residual must reconcile against what the ALLOCATION
    // rows are meant to total — the amount received minus the advance, which
    // gets its own row — not against the full amount.
    data.amount - data.advanceAmount,
    locale,
  );
  const rowH = rowHeight(plan.density, locale);
  const cellOpts = { size: plan.density.size };

  plan.visible.forEach((a, i) => {
    rule(doc, L, y, W, RULE_ROW, i === 0 ? GREY_2 : GREY_3);
    const ry = y + plan.density.rowPad;
    text(doc, truncate(doc, a.invoiceNumber, invoiceW - CELL_PAD, cellOpts), xs.invoice, ry, cellOpts);
    text(doc, truncate(doc, a.installment, ALLOC.installment - CELL_PAD, cellOpts), xs.installment, ry, cellOpts);
    text(doc, money(a.amount), xs.amount, ry, {
      ...cellOpts, weight: 600, width: ALLOC.amount - CELL_PAD, align: 'right',
    });
    y += rowH;
  });

  if (plan.omitted > 0) {
    rule(doc, L, y, W, RULE_ROW, plan.visible.length === 0 ? GREY_2 : GREY_3);
    const ry = y + plan.density.rowPad;
    text(doc, data.continuation(plan.omitted), xs.invoice, ry, { ...cellOpts, color: GREY_1 });
    text(doc, money(plan.residual), xs.amount, ry, {
      ...cellOpts, weight: 600, width: ALLOC.amount - CELL_PAD, align: 'right',
    });
    y += rowH;
  }

  if (data.advanceAmount > 0) {
    rule(doc, L, y, W, RULE_ROW, plan.visible.length === 0 && plan.omitted === 0 ? GREY_2 : GREY_3);
    const ry = y + plan.density.rowPad;
    text(doc, label('advanceCredit'), xs.invoice, ry, cellOpts);
    text(doc, money(data.advanceAmount), xs.amount, ry, {
      ...cellOpts, weight: 600, width: ALLOC.amount - CELL_PAD, align: 'right',
    });
    y += rowH;
  }

  rule(doc, L, y, W, RULE_INK, INK);
  y += g(STEP.sm);                                    // boundary 7

  // ── Balance after this payment — always renders, even at 0.00 ─────────────
  const balLabel = label('balanceAfterPayment');
  const marker = drCrMarker(data.balanceAfterSign);
  const balW = ALLOC.installment + ALLOC.amount;
  const balX = R - balW;
  text(doc, balLabel, balX - mm(30), y + (balanceH - 8 * LINE_HEIGHT[locale]) / 2, {
    size: 8, weight: 600, width: mm(30) + balW * 0.5, align: 'left',
  });
  if (marker) {
    const lw = widthOf(doc, balLabel, { size: 8, weight: 600 });
    text(doc, marker, balX - mm(30) + lw + mm(1), y + (balanceH - EYEBROW_SIZE[locale]) / 2, {
      size: EYEBROW_SIZE[locale], weight: 600, color: GREY_1, track: 0.09 * EYEBROW_SIZE[locale],
    });
  }
  text(doc, `Rs. ${money(Math.abs(data.balanceAfter))}`, balX, y, {
    size: 9, weight: 700, width: balW - CELL_PAD, align: 'right',
  });
  y += balanceH;
  const contentEnd = y + g(STEP.lg);                  // boundary 8 (balance -> footer)

  assertFits('Receipt', contentEnd, footerTop);
  renderFooter(doc, box, data, footerTop, assetMisses);

  // How much further the gaps would have to stretch to reach the footer. At
  // gapScale = 1 this is the raw slack; on the second pass it lands at ~1.
  const slack = footerTop - contentEnd;
  const scaledGaps = BASE_GAPS * gapScale;
  const gapScaleForFit = scaledGaps > 0
    ? Math.max(1, gapScale * ((scaledGaps + slack) / scaledGaps))
    : 1;
  return { ...plan, assetMisses, gapScaleForFit };
}

function renderFooter(
  doc: PDFKit.PDFDocument,
  box: HalfBox,
  data: ReceiptHalfData,
  footerTop: number,
  assetMisses: AssetMiss[],
): void {
  const { locale, label } = data;
  const L = box.x;
  const R = box.x + box.w;
  const eyeH = eyebrowH(locale);

  rule(doc, L, footerTop, box.w, RULE_HAIR, GREY_2);
  const bandY = footerTop + RULE_HAIR + STEP.md;
  const bandH = Math.max(remarksHeight(locale), receivedByHeight(locale), signatureHeight(locale));
  const bottom = bandY + bandH;

  // 1. Remarks — three ruled lines left blank for hand annotation. These also
  //    absorb the receipt's height difference from the invoice.
  const remarksW = R - SIG_W - mm(8) - RECEIVED_W - mm(8) - L;
  const remarksTop = bottom - remarksHeight(locale);
  eyebrow(doc, label('remarks'), L, remarksTop, locale, { width: remarksW });
  for (let i = 1; i <= REMARK_LINES; i++) {
    rule(doc, L, remarksTop + eyeH + REMARK_LINE_H * i, remarksW, RULE_HAIR, GREY_2);
  }

  // 2. Received by — staff name over a rule with signing space beneath.
  const rbX = R - SIG_W - mm(8) - RECEIVED_W;
  const rbTop = bottom - receivedByHeight(locale);
  eyebrow(doc, label('receivedBy'), rbX, rbTop, locale, { width: RECEIVED_W });
  if (data.receivedBy) {
    text(doc, truncate(doc, data.receivedBy, RECEIVED_W, { size: 8, weight: 600 }),
      rbX, rbTop + eyeH, { size: 8, weight: 600, width: RECEIVED_W });
  }
  rule(doc, rbX, rbTop + eyeH + 8 * LINE_HEIGHT[locale], RECEIVED_W, RULE_HAIR, GREY_2);

  // 3. Authorised signature — same construction as the invoice.
  const sigX = R - SIG_W;
  let sy = bottom - signatureHeight(locale);
  eyebrow(doc, label('authorisedSignature'), sigX, sy, locale, { width: SIG_W });
  sy += eyeH;
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

  const fineY = box.bottom - 5.5 * LINE_HEIGHT[locale];
  text(doc, label('computerGeneratedReceipt'), L, fineY, {
    size: 5.5, color: GREY_1, track: 0.03 * 5.5,
  });
  text(doc, data.number, L, fineY, {
    size: 5.5, color: GREY_1, track: 0.03 * 5.5, width: box.w, align: 'right',
  });
}
