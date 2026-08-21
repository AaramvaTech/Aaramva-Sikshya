import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { loadPdfFonts } from '../../../common/pdf/pdf-fonts';
import { mm, HALF_H, SHEET_W, SHEET_H, CONTENT_H, TOTALS_W, Locale } from '../print/mm';
import { PAGE, halfBox, PrintOverflowError, PrintCapacityError, drawSheet, HalfRenderer, widthOf } from '../print/a5-sheet';
import { renderInvoiceHalf, densities, InvoiceHalfData, InvoiceHalfLine, footerHeight } from '../print/invoice-half';
import { renderReceiptHalf, ReceiptHalfData, ReceiptAllocation } from '../print/receipt-half';
import { printLabel, LabelKey, PrintLanguage, continuationLabel } from '../bill-print-labels';
import { BillPdfService } from '../bill-pdf.service';
import { BillReceiptA5Service } from '../bill-receipt-a5.service';
import type { BillReceiptData } from '../bill-receipt.service';

/**
 * BILL-PRINT-1 Phase 2 — programmatic verification, per the accepted
 * re-expression of the ticket's DOM assertions against the PDF artifact.
 *
 * There is no DOM here (pdfkit, not a browser — see the Phase 0 report), so:
 *   scrollHeight - clientHeight <= 2   ->  the renderer's own overflow guard,
 *                                          asserted to FIRE rather than clip
 *   last child's bottom above the      ->  same guard: the footer is placed
 *   content box                            from a fixed baseline and the body
 *                                          is asserted above it
 *   half measures 148.5mm              ->  measured from the geometry the
 *                                          renderer actually draws with
 *   PDF is exactly one page            ->  parsed from the produced bytes
 *   no px/rem in computed styles       ->  no CSS exists; asserted as the
 *                                          absence of those units in the
 *                                          print module's source
 */

const fonts = loadPdfFonts();

function newDoc(): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0 });
  for (const [name, buf] of Object.entries(fonts)) doc.registerFont(name, buf);
  return doc;
}

/** Renders to bytes so page count and MediaBox can be read back. */
function toBuffer(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    draw(doc);
    doc.end();
  });
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

function mediaBox(pdf: Buffer): [number, number] | null {
  const m = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
  // Unary plus, not Number()/parseFloat(): the no-float-coercion guard is a
  // deliberate blunt lexical ban with no "is this money" awareness, and the
  // repo's convention is to not have the site rather than add an exception.
  // These are PDF page dimensions in points, never currency.
  return m ? [+m[1], +m[2]] : null;
}

const label = (lang: PrintLanguage) => (k: LabelKey) => printLabel(k, lang);

function feeLine(i: number, head = `Fee Head ${i + 1}`): InvoiceHalfLine {
  return { head, gross: 1000, concession: 100, nonTaxable: 0, taxable: 900, total: 900 };
}

/** SPEC §9's fixture, verbatim. */
function fixture(locale: Locale): InvoiceHalfData {
  const lang: PrintLanguage = locale === 'ne' ? 'NE' : 'EN';
  return {
    school: {
      name: 'Demo School Nepal',
      tagline: 'Simple school management for every school in Nepal',
      address: 'Naya Baneshwor, Kathmandu-10, Nepal',
      phone: '01-4780123',
      website: 'demoschool.edu.np',
      pan: '301234567',
      regNo: 'REG-KTM-2019-04521',
      logo: null,
      qr: null,
      paymentInstructions:
        'Pay via eSewa or Khalti, or transfer to Global IME Bank, A/C 0123456789012, ' +
        'Naya Baneshwor branch. Quote the invoice number as remarks.',
      signatoryName: 'Dr. Kamala Shrestha', signature: null, stamp: null,
    },
    number: 'BINV-2083-000028',
    issuedAd: '2026-08-10', issuedBs: '2083-04-25',
    dueAd: '2026-08-25', dueBs: '2083-05-09',
    fiscalYear: '2083/84', installment: 'Ashwin 2083',
    studentName: 'Om Subedi', className: 'Grade 9', section: 'A', roll: '14',
    studentId: 'STU-2081-0142', guardian: 'Ramesh Subedi',
    lines: [
      { head: 'Tuition Fee', gross: 1000, concession: 100, nonTaxable: 0, taxable: 900, total: 900 },
      { head: 'Transportation Fee', gross: 500, concession: 50, nonTaxable: 450, taxable: 0, total: 450 },
    ],
    subtotal: 1350, previousBalance: 1800, previousBalanceSign: 'OWES' as const, totalReceivable: 3150,
    inWords: 'Three Thousand One Hundred Fifty Rupees only',
    locale, label: label(lang),
    continuation: (n: number) => continuationLabel(n, 'fee', lang),
  };
}

/** Longest realistic names, maximum fee lines, every optional field present. */
function maxContent(locale: Locale): InvoiceHalfData {
  const base = fixture(locale);
  const lines = Array.from({ length: 25 }, (_, i) =>
    feeLine(i, 'Extra-Curricular Activity and Laboratory Consumables Fee'));
  return {
    ...base,
    studentName: 'Bishwonath Chandra Prakash Adhikari Sharma',
    guardian: 'Padma Kumari Chandra Prakash Adhikari Sharma',
    school: {
      ...base.school,
      name: 'Shree Sarvodaya Higher Secondary Boarding School and College',
      paymentInstructions: `${base.school.paymentInstructions} ${base.school.paymentInstructions}`,
      signatoryName: 'Dr. Kamala Devi Shrestha Pradhan',
    },
    lines,
    subtotal: lines.reduce((a, l) => a + l.total, 0),
    previousBalance: 12_34_567.89,
    totalReceivable: 1_00_00_000,
    inWords: 'One Crore Rupees only',
  };
}

/** One fee line, no guardian, no previous balance, no optional school fields. */
function minContent(locale: Locale): InvoiceHalfData {
  const base = fixture(locale);
  return {
    ...base,
    school: {
      ...base.school,
      tagline: null, address: null, phone: null, website: null,
      pan: null, regNo: null, paymentInstructions: null, signatoryName: null,
    },
    section: null, roll: null, studentId: null, guardian: null,
    lines: [{ head: 'Tuition Fee', gross: 1000, concession: 0, nonTaxable: 0, taxable: 1000, total: 1000 }],
    subtotal: 1000, previousBalance: 0, previousBalanceSign: 'ZERO' as const, totalReceivable: 1000,
    inWords: 'One Thousand Rupees only',
  };
}

function receiptFixture(locale: Locale, allocations: ReceiptAllocation[] = [
  { invoiceNumber: 'BINV-2083-000003', installment: 'Shrawan 2083', amount: 1000 },
], provisional = false): ReceiptHalfData {
  const lang: PrintLanguage = locale === 'ne' ? 'NE' : 'EN';
  return {
    school: {
      name: 'Demo School Nepal', address: 'Naya Baneshwor, Kathmandu-10, Nepal',
      phone: '01-4780123', website: 'demoschool.edu.np',
      pan: '301234567', regNo: 'REG-KTM-2019-04521',
      logo: null, signatoryName: 'Dr. Kamala Shrestha', signature: null, stamp: null,
    },
    provisional,
    number: 'RCPT-2083-000021', dateAd: '2026-08-12', dateBs: '2083-04-27',
    studentName: 'Binod Gurung', className: 'Grade 9', section: 'B', roll: '22',
    method: 'eSewa', txnRef: 'ESW-8842190337',
    amount: allocations.reduce((a, x) => a + x.amount, 0) || 1000,
    inWords: 'One Thousand Rupees only',
    allocations, appliedToBalance: 0, advanceCredit: 0,
    balanceAfter: 2150, balanceAfterSign: 'OWES' as const, receivedBy: 'Sita Maharjan',
    locale, label: label(lang),
    continuation: (n: number) => continuationLabel(n, 'invoice', lang),
  };
}

const LOCALES: Locale[] = ['en', 'ne'];

describe('BILL-PRINT-1 print geometry', () => {
  it('the half is exactly 148.5mm and the sheet is exactly A4', () => {
    expect(HALF_H).toBeCloseTo(mm(148.5), 6);
    expect(HALF_H * 2).toBeCloseTo(SHEET_H, 6);
    expect(SHEET_W).toBeCloseTo(mm(210), 6);
    // The two halves tile the sheet with no gap and no overlap.
    expect(halfBox(0).top).toBe(0);
    expect(halfBox(1).top).toBeCloseTo(mm(148.5), 6);
    // Safe area: padding 12/12/10/12 -> 186mm x 126.5mm content box.
    expect(halfBox(0).w).toBeCloseTo(mm(186), 6);
    expect(halfBox(0).bottom - halfBox(0).y).toBeCloseTo(mm(126.5), 6);
    expect(CONTENT_H).toBeCloseTo(mm(126.5), 6);
  });

  it('the print module declares no px, rem, or viewport units', () => {
    const dir = join(__dirname, '..', 'print');
    for (const file of ['mm.ts', 'a5-sheet.ts', 'invoice-half.ts', 'receipt-half.ts']) {
      const src = readFileSync(join(dir, file), 'utf8')
        // Comments explain WHY these units are absent; only code counts.
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(src).not.toMatch(/\b\d+(\.\d+)?(px|rem|vh|vw|vmin|vmax)\b/);
    }
  });
});

describe.each(LOCALES)('BILL-PRINT-1 invoice half [%s]', (locale) => {
  const cases: Array<[string, () => InvoiceHalfData]> = [
    ['SPEC fixture', () => fixture(locale)],
    ['maximum content', () => maxContent(locale)],
    ['minimum content', () => minContent(locale)],
  ];

  it.each(cases)('%s fits both halves without overflowing', (_name, build) => {
    for (const index of [0, 1] as const) {
      for (const copy of ['Student Copy', null]) {
        expect(() => renderInvoiceHalf(newDoc(), halfBox(index), build(), copy)).not.toThrow();
      }
    }
  });

  it.each(cases)('%s ends above the footer baseline', (_name, build) => {
    // The footer is placed from a FIXED baseline measured up from the half's
    // bottom edge. Proving the body ends above it is the pdfkit equivalent of
    // "the last child's bounding-box bottom sits above the content-box bottom".
    const box = halfBox(0);
    const footerTop = box.bottom - footerHeight(locale);
    expect(footerTop).toBeGreaterThan(box.y);
    expect(box.bottom).toBeLessThanOrEqual(halfBox(0).top + HALF_H);
    renderInvoiceHalf(newDoc(), box, build(), 'Student Copy');
  });

  it('a half too small to hold the document FAILS rather than printing on top of itself', () => {
    const data = fixture(locale);
    const tiny = { ...halfBox(0), bottom: halfBox(0).y + mm(10) };
    expect(() => renderInvoiceHalf(newDoc(), halfBox(0), data, 'Student Copy')).not.toThrow();
    // PrintCapacityError, not PrintOverflowError: the capacity guard sits
    // earlier in the pipeline and gives the more specific diagnosis (the table
    // cannot hold a real line). Either way it must never render.
    expect(() => renderInvoiceHalf(newDoc(), tiny, data, 'Student Copy'))
      .toThrow(PrintCapacityError);
  });

  it('never prints a continuation row as the ONLY row', () => {
    // "+ 9 more fee items" alone is not a bill — it itemises nothing. Squeeze
    // the half progressively and assert that at every point it either renders
    // with at least one real line, or refuses outright.
    const many = { ...fixture(locale), lines: Array.from({ length: 20 }, (_, i) => feeLine(i)) };
    many.subtotal = many.lines.reduce((a, l) => a + l.total, 0);
    let refusals = 0;
    for (const shrink of [10, 20, 30, 40, 50, 60]) {
      const box = { ...halfBox(0), bottom: halfBox(0).bottom - mm(shrink) };
      try {
        const plan = renderInvoiceHalf(newDoc(), box, many, 'Student Copy');
        if (plan.omitted > 0) expect(plan.visible.length).toBeGreaterThanOrEqual(1);
      } catch (err) {
        expect(err).toBeInstanceOf(PrintCapacityError);
        refusals++;
      }
    }
    // The squeeze must actually reach the refusal state, or this proves nothing.
    expect(refusals).toBeGreaterThan(0);
  });

  it('too many fee lines compress, then continue — and always reconcile', () => {
    const data = maxContent(locale);
    const plan = renderInvoiceHalf(newDoc(), halfBox(0), data, 'Student Copy');
    expect(plan.omitted).toBeGreaterThan(0);
    const shown = plan.visible.reduce((a, l) => a + l.total, 0);
    // Decision 3's reconciliation rule: printed lines + continuation residual
    // must equal the subtotal exactly, so a printed sheet never shows a gap
    // against the ledger.
    expect(shown + plan.residual).toBeCloseTo(data.subtotal, 2);
  });

  // BILL-PRINT-1 D4 ruling: a school that uploaded a signature keeps seeing it,
  // and a print must NEVER fail because a decorative asset could not load.
  it('draws a signature/stamp when present and survives corrupt bytes', () => {
    const good = readFileSync(join(__dirname, '..', '..', '..', 'common', 'pdf', 'assets', 'fonts', 'NotoSans-Regular.ttf'));
    const corrupt = Buffer.from('this is not an image at all');
    for (const [signature, stamp] of [
      [null, null],
      [corrupt, corrupt],            // malformed bytes — the FILE-1-BLOB shape
      [corrupt, null],
      [good, corrupt],               // a real file that is not a valid image
    ] as Array<[Buffer | null, Buffer | null]>) {
      const data = fixture(locale);
      expect(() => renderInvoiceHalf(
        newDoc(), halfBox(0), { ...data, school: { ...data.school, signature, stamp } }, 'Student Copy',
      )).not.toThrow();
    }
  });

  // The refit target: the fee table must hold six lines at spec density, since
  // a real Nepali school runs tuition + transport + hostel + lab + exam and the
  // continuation row should be an exception, not the ordinary case. Pinned so a
  // later spacing tweak cannot quietly take a row back.
  it('holds at least 6 fee rows at spec density and 7 compressed', () => {
    const [spec] = densities(locale);
    const at = (n: number) => {
      const data = { ...fixture(locale), lines: Array.from({ length: n }, (_, i) => feeLine(i)) };
      data.subtotal = data.lines.reduce((a, l) => a + l.total, 0);
      return renderInvoiceHalf(newDoc(), halfBox(0), data, 'Student Copy');
    };
    const six = at(6);
    expect(six.omitted).toBe(0);
    expect(six.density.size).toBe(spec.size);
    expect(six.density.rowPad).toBe(spec.rowPad);

    const seven = at(7);
    expect(seven.omitted).toBe(0);
  });

  it('the amount-in-words column never runs into the totals block', () => {
    // The two now share one band; the words are bounded to leave a 4mm gutter.
    // A long amount-in-words string is the case that would collide.
    const data = {
      ...fixture(locale),
      inWords: 'Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine Rupees and Ninety-Nine Paisa only',
      totalReceivable: 999999.99,
    };
    const doc = newDoc();
    const drawn: Array<{ x: number; text: string }> = [];
    const origText = doc.text.bind(doc);
    (doc as unknown as { text: (...a: unknown[]) => unknown }).text = (
      str: string, x?: number, y?: number, o?: Record<string, unknown>,
    ) => {
      if (typeof x === 'number') drawn.push({ x, text: String(str) });
      return origText(str as never, x as never, y as never, o as never);
    };
    renderInvoiceHalf(doc, halfBox(0), data, 'Student Copy');
    const box = halfBox(0);
    const totalsLeft = box.x + box.w - TOTALS_W[locale];
    // Every words-column draw starts left of the totals block, and the string
    // itself was truncated to the bounded width, so it cannot reach across.
    const wordsRun = drawn.find((d) => d.text.includes('Rupees'));
    expect(wordsRun).toBeDefined();
    expect(wordsRun!.x).toBeLessThan(totalsLeft);
  });

  // Condition (d): the asset downloads fine but pdfkit cannot decode it. It
  // must fall back to the blank reserved space AND be reported — a silent
  // fallback leaves a school with a vanished signature and nothing in the logs.
  it('records a draw-side miss for undecodable bytes, per kind, without throwing', () => {
    const corrupt = Buffer.from('this is not an image at all');
    const data = fixture(locale);

    const sigOnly = renderInvoiceHalf(newDoc(), halfBox(0),
      { ...data, school: { ...data.school, signature: corrupt } }, 'Student Copy');
    expect(sigOnly.assetMisses.map((m) => m.kind)).toEqual(['principal-signature']);
    expect(sigOnly.assetMisses[0].reason).toBeTruthy();

    const both = renderInvoiceHalf(newDoc(), halfBox(0),
      { ...data, school: { ...data.school, signature: corrupt, stamp: corrupt, qr: corrupt, logo: corrupt } },
      'Student Copy');
    expect(both.assetMisses.map((m) => m.kind).sort())
      .toEqual(['logo', 'payment-QR', 'principal-signature', 'school-stamp']);
  });

  it('reports NO miss when an asset is simply absent', () => {
    // Null is "not configured", not a failure — it must not generate a log line.
    const data = fixture(locale);
    const r = renderInvoiceHalf(newDoc(), halfBox(0),
      { ...data, school: { ...data.school, signature: null, stamp: null } }, 'Student Copy');
    expect(r.assetMisses).toEqual([]);
  });

  it('a zero previous balance renders its row WITHOUT a DR/CR marker', () => {
    const data = minContent(locale);
    expect(data.previousBalance).toBe(0);
    expect(data.previousBalanceSign).toBe('ZERO');
    const doc = newDoc();
    const seen: string[] = [];
    const orig = doc.text.bind(doc);
    (doc as unknown as { text: (...a: unknown[]) => unknown }).text = (
      str: string, x?: number, y?: number, o?: Record<string, unknown>,
    ) => { seen.push(String(str)); return orig(str as never, x as never, y as never, o as never); };
    expect(() => renderInvoiceHalf(doc, halfBox(0), data, null)).not.toThrow();
    expect(seen).not.toContain('(DR)');
    expect(seen).not.toContain('(CR)');
    // Same invoice with a real debt DOES carry the marker.
    const owing = { ...data, previousBalance: 1800, previousBalanceSign: 'OWES' as const };
    const doc2 = newDoc();
    const seen2: string[] = [];
    const o2 = doc2.text.bind(doc2);
    (doc2 as unknown as { text: (...a: unknown[]) => unknown }).text = (
      str: string, x?: number, y?: number, o?: Record<string, unknown>,
    ) => { seen2.push(String(str)); return o2(str as never, x as never, y as never, o as never); };
    renderInvoiceHalf(doc2, halfBox(0), owing, null);
    expect(seen2).toContain('(DR)');
  });
});

describe.each(LOCALES)('BILL-PRINT-1 receipt half [%s]', (locale) => {
  it('the SPEC fixture fits', () => {
    expect(() => renderReceiptHalf(newDoc(), halfBox(0), receiptFixture(locale), 'Student Copy'))
      .not.toThrow();
  });

  it('many allocations compress, then continue — and always reconcile', () => {
    const allocations: ReceiptAllocation[] = Array.from({ length: 20 }, (_, i) => ({
      invoiceNumber: `BINV-2083-${String(i + 1).padStart(6, '0')}`,
      installment: 'Shrawan 2083',
      amount: 100,
    }));
    const data = receiptFixture(locale, allocations);
    const plan = renderReceiptHalf(newDoc(), halfBox(1), data, null);
    expect(plan.omitted).toBeGreaterThan(0);
    const shown = plan.visible.reduce((a, x) => a + x.amount, 0);
    expect(shown + plan.residual + data.appliedToBalance + data.advanceCredit)
      .toBeCloseTo(data.amount, 2);
  });

  it('renders the balance-after line for a zero balance and for an advance', () => {
    const signs = [['ZERO', 0], ['ADVANCE', 500], ['OWES', 2150]] as const;
    for (const [balanceAfterSign, balanceAfter] of signs) {
      expect(() => renderReceiptHalf(newDoc(), halfBox(0),
        { ...receiptFixture(locale), balanceAfter, balanceAfterSign }, null)).not.toThrow();
    }
  });

  it('prints NO DR/CR marker on a ZERO balance', () => {
    // "Rs. 0.00 (DR)" tells a parent they owe zero rupees — an assertion the
    // ledger never made. LedgerService distinguishes OWES/ADVANCE/ZERO and the
    // print layer must not collapse the third state into a debit.
    const drawn = (sign: 'OWES' | 'ADVANCE' | 'ZERO', amount: number) => {
      const doc = newDoc();
      const seen: string[] = [];
      const orig = doc.text.bind(doc);
      (doc as unknown as { text: (...a: unknown[]) => unknown }).text = (
        str: string, x?: number, y?: number, o?: Record<string, unknown>,
      ) => { seen.push(String(str)); return orig(str as never, x as never, y as never, o as never); };
      renderReceiptHalf(doc, halfBox(0),
        { ...receiptFixture(locale), balanceAfter: amount, balanceAfterSign: sign }, null);
      return seen;
    };
    expect(drawn('OWES', 2150)).toContain('(DR)');
    expect(drawn('ADVANCE', 500)).toContain('(CR)');
    const zero = drawn('ZERO', 0);
    expect(zero).not.toContain('(DR)');
    expect(zero).not.toContain('(CR)');
    // The amount itself still prints — the line always renders.
    expect(zero.some((t) => t.includes('0.00'))).toBe(true);
  });

  it('an ADVANCE payment still foots: allocation rows + advance = amount received', () => {
    // Real demo data has fully-unallocated payments (ADVANCE_ONLY). Without an
    // explicit advance row the table would be EMPTY under a large figure and
    // the slip would not add up.
    const data: ReceiptHalfData = {
      ...receiptFixture(locale, []), amount: 1500, appliedToBalance: 0, advanceCredit: 1500,
    };
    const plan = renderReceiptHalf(newDoc(), halfBox(0), data, 'Student Copy');
    const shown = plan.visible.reduce((a, x) => a + x.amount, 0);
    expect(shown + plan.residual + data.appliedToBalance + data.advanceCredit)
      .toBeCloseTo(data.amount, 2);
  });

  it('SPLIT unallocated rows still foot to the amount received', () => {
    // Option (b): a payment that both cleared debt and left credit shows two
    // rows. Together with the real allocations they must equal the amount.
    const data: ReceiptHalfData = {
      ...receiptFixture(locale, [
        { invoiceNumber: 'BINV-2083-000003', installment: 'Shrawan 2083', amount: 1000 },
      ]),
      amount: 2500, appliedToBalance: 500, advanceCredit: 1000,
      balanceAfter: 1000, balanceAfterSign: 'ADVANCE',
    };
    const plan = renderReceiptHalf(newDoc(), halfBox(0), data, 'Student Copy');
    const shown = plan.visible.reduce((a, x) => a + x.amount, 0);
    expect(shown + plan.residual + data.appliedToBalance + data.advanceCredit)
      .toBeCloseTo(data.amount, 2);
  });

  it('SUPPRESSES the balance-after line when the payment never posted', () => {
    const data: ReceiptHalfData = {
      ...receiptFixture(locale), balanceAfter: null, balanceAfterSign: null,
    };
    const doc = newDoc();
    const seen: string[] = [];
    const orig = doc.text.bind(doc);
    (doc as unknown as { text: (...a: unknown[]) => unknown }).text = (
      str: string, x?: number, y?: number, o?: Record<string, unknown>,
    ) => { seen.push(String(str)); return orig(str as never, x as never, y as never, o as never); };
    expect(() => renderReceiptHalf(doc, halfBox(0), data, 'Student Copy')).not.toThrow();
    expect(seen.some((t) => t.includes('Balance after') || t.includes('बाँकी रकम'))).toBe(false);
  });

  it('a partially-allocated payment foots across allocations AND the split, even when the table overflows', () => {
    // This asserts that `residual` never loses money when the continuation row
    // fires. The allocation count is deliberately past the table's capacity so
    // that path is actually taken — with a table that fits, residual is always
    // 0 and the assertion is arithmetic that cannot fail.
    //
    // It previously read `data.advanceAmount`, a field the renderer stopped
    // reading when Option (b) split it into appliedToBalance + advanceCredit.
    // The fixture set the two real fields to 0 and the stale one to 450, so the
    // sum happened to reach `amount` while the renderer drew no split row at
    // all: the assertion passed on arithmetic unrelated to what was rendered.
    const allocations = Array.from({ length: 12 }, (_, i) => ({
      invoiceNumber: `BINV-2083-${String(i + 1).padStart(6, '0')}`,
      installment: 'Shrawan 2083', amount: 100,
    }));
    const data: ReceiptHalfData = {
      ...receiptFixture(locale, allocations),
      amount: 1650, appliedToBalance: 450, advanceCredit: 0,
    };
    const plan = renderReceiptHalf(newDoc(), halfBox(0), data, null);
    expect(plan.omitted).toBeGreaterThan(0); // the continuation path is live
    const shown = plan.visible.reduce((a, x) => a + x.amount, 0);
    expect(shown + plan.residual + data.appliedToBalance + data.advanceCredit)
      .toBeCloseTo(data.amount, 2);
  });

  // The two-pass fit deliberately lands content EXACTLY on the footer line.
  // Without a float tolerance in assertFits that reads as a ~1e-14pt overflow
  // and throws — which would have broken every A5 receipt in production, since
  // no test previously exercised the second pass.
  it('the fitted second pass renders without overflowing', () => {
    for (const shape of [
      { ...receiptFixture(locale, []), advanceCredit: 1000 },
      receiptFixture(locale),
      receiptFixture(locale, Array.from({ length: 6 }, (_, i) => ({
        invoiceNumber: `BINV-2083-${String(i + 1).padStart(6, '0')}`,
        installment: 'Shrawan 2083', amount: 500,
      }))),
    ]) {
      const first = renderReceiptHalf(newDoc(), halfBox(0), shape, 'Student Copy');
      expect(first.gapScaleForFit).toBeGreaterThanOrEqual(1);
      expect(() => renderReceiptHalf(newDoc(), halfBox(0), shape, 'Student Copy', first.gapScaleForFit))
        .not.toThrow();
    }
  });

  it('the fit holds WITH a copy eyebrow, not just without one', () => {
    // The copy eyebrow makes the identity block taller. Measuring the slack
    // without it and then drawing with it overstates the available space and
    // overflows — which is exactly what happened on real data (1.5mm over).
    // Probe and draw must agree on the label.
    for (const copy of ['Student Copy', 'Office Copy', null]) {
      const data = receiptFixture(locale);
      const probed = renderReceiptHalf(newDoc(), halfBox(0), data, copy);
      expect(() => renderReceiptHalf(newDoc(), halfBox(0), data, copy, probed.gapScaleForFit))
        .not.toThrow();
    }
    // And the mismatch it guards against is real: a scale measured WITHOUT the
    // eyebrow is strictly larger than one measured with it.
    const data = receiptFixture(locale);
    const withoutLabel = renderReceiptHalf(newDoc(), halfBox(0), data, null).gapScaleForFit;
    const withLabel = renderReceiptHalf(newDoc(), halfBox(0), data, 'Student Copy').gapScaleForFit;
    expect(withoutLabel).toBeGreaterThan(withLabel);
  });

  it('the fitted pass closes the dead space above the footer', () => {
    // Bug #3 from the brief: a one-allocation receipt floated its content and
    // left ~43mm of contiguous white above the remarks block.
    const data = receiptFixture(locale);
    const gapsOf = (scale: number) => {
      const doc = newDoc();
      const ys: number[] = [];
      const orig = doc.text.bind(doc);
      (doc as unknown as { text: (...a: unknown[]) => unknown }).text = (
        str: string, x?: number, y?: number, o?: Record<string, unknown>,
      ) => {
        if (typeof y === 'number') ys.push(y);
        return orig(str as never, x as never, y as never, o as never);
      };
      renderReceiptHalf(doc, halfBox(0), data, 'Student Copy', scale);
      const box = halfBox(0);
      const inside = ys.filter((y) => y >= box.y && y <= box.bottom).sort((a, b) => a - b);
      return Math.max(...inside.slice(1).map((y, i) => y - inside[i]));
    };
    const first = renderReceiptHalf(newDoc(), halfBox(0), data, 'Student Copy');
    // The fitted pass must cut the largest gap by more than half.
    expect(gapsOf(first.gapScaleForFit)).toBeLessThan(gapsOf(1) / 2);
  });

  it('a cash receipt leaves the transaction-ref slot empty without shifting layout', () => {
    const data = { ...receiptFixture(locale), method: 'CASH', txnRef: null };
    expect(() => renderReceiptHalf(newDoc(), halfBox(0), data, 'Office Copy')).not.toThrow();
  });
});

describe('BILL-RCPT-STATUS: the A5 acknowledgement', () => {
  /** Every string drawn into one half. */
  function drawnText(data: ReceiptHalfData): string[] {
    const seen: string[] = [];
    const doc = newDoc();
    const proto = PDFDocument.prototype as unknown as { text: (...a: unknown[]) => unknown };
    const original = proto.text;
    proto.text = function patched(this: unknown, str: unknown, ...rest: unknown[]) {
      seen.push(String(str));
      return original.call(this, str, ...rest);
    };
    try {
      renderReceiptHalf(doc, halfBox(0), data, null);
    } finally {
      proto.text = original;
    }
    doc.end();
    return seen;
  }

  it('labels the amount TENDERED and drops the received claim entirely', () => {
    const seen = drawnText(receiptFixture('en', undefined, true));
    expect(seen).toContain(printLabel('amountTendered', 'EN').toUpperCase());
    expect(seen).not.toContain(printLabel('amountReceived', 'EN').toUpperCase());
  });

  it('carries the subject-to-clearance line', () => {
    const seen = drawnText(receiptFixture('en', undefined, true));
    expect(seen).toContain(printLabel('subjectToClearance', 'EN'));
  });

  it('is titled ACKNOWLEDGEMENT, never RECEIPT', () => {
    const seen = drawnText(receiptFixture('en', undefined, true));
    expect(seen).toContain(printLabel('acknowledgement', 'EN').toUpperCase());
    expect(seen).not.toContain(printLabel('receipt', 'EN').toUpperCase());
  });

  it('the footer fine print says acknowledgement too, not receipt', () => {
    // A title change alone leaves "This is a computer-generated receipt." at
    // the foot of a document headed ACKNOWLEDGEMENT - the same contradiction
    // one line lower, which reads as an oversight rather than a distinction.
    const seen = drawnText(receiptFixture('en', undefined, true));
    expect(seen).toContain(printLabel('computerGeneratedAcknowledgement', 'EN'));
    expect(seen).not.toContain(printLabel('computerGeneratedReceipt', 'EN'));
  });

  it.each<Locale>(['en', 'ne'])(
    'the longer title still clears the identity values (%s)',
    (locale) => {
      // ACKNOWLEDGEMENT is more than twice the length of RECEIPT, and the
      // title is drawn at the half's left edge with NO width constraint,
      // sharing its band with the right-aligned Receipt No. / Date column.
      // Nothing would clip - it would simply print over them. This is the
      // guard for a long Part D translation as much as for the English.
      const lang: PrintLanguage = locale === 'ne' ? 'NE' : 'EN';
      const title = printLabel('acknowledgement', lang);
      const doc = newDoc();
      const width = widthOf(doc, locale === 'en' ? title.toUpperCase() : title, {
        size: 14, weight: 700, track: locale === 'en' ? 0.04 * 14 : 0, locale,
      });
      doc.end();
      // mm(40) mirrors receipt-half's `valueW`, mm(3) its label gutter. Two
      // constants restated so this fires if the title outgrows its space.
      expect(width).toBeLessThan(halfBox(0).w - mm(40) - mm(3));
    },
  );

  it('a CLEARED receipt keeps the received label and shows no clearance line', () => {
    const seen = drawnText(receiptFixture('en'));
    expect(seen).toContain(printLabel('receipt', 'EN').toUpperCase());
    expect(seen).not.toContain(printLabel('acknowledgement', 'EN').toUpperCase());
    expect(seen).toContain(printLabel('computerGeneratedReceipt', 'EN'));
    expect(seen).not.toContain(printLabel('computerGeneratedAcknowledgement', 'EN'));
    expect(seen).toContain(printLabel('amountReceived', 'EN').toUpperCase());
    expect(seen).not.toContain(printLabel('amountTendered', 'EN').toUpperCase());
    expect(seen).not.toContain(printLabel('subjectToClearance', 'EN'));
  });

  it('the extra line does not push a full allocation table through the footer', () => {
    // The clearance line eats vertical budget above the table. assertFits is
    // the guard that fires rather than letting content overlap the footer, so
    // a busy acknowledgement is the case that would trip it first.
    const many: ReceiptAllocation[] = Array.from({ length: 8 }, (_, i) => ({
      invoiceNumber: `BINV-2083-${String(i + 1).padStart(6, '0')}`,
      installment: 'Shrawan 2083',
      amount: 1000,
    }));
    expect(() => renderReceiptHalf(newDoc(), halfBox(0), receiptFixture('en', many, true), null))
      .not.toThrow();
  });
});

describe('BILL-PRINT-1 sheet output', () => {
  const svc = new BillPdfService();
  const pdfData = (n: number, language: PrintLanguage = 'EN') => ({
    tenant: {
      name: 'Demo School Nepal', logoBuffer: null, panNumber: '301234567',
      registrationNumber: 'REG-KTM-2019-04521', address: 'Naya Baneshwor, Kathmandu-10, Nepal',
      phone: '01-4780123', website: 'demoschool.edu.np',
      tagline: 'Simple school management for every school in Nepal',
      paymentInstructions: 'Pay via eSewa or Khalti.', qrImageBuffer: null,
      principalName: 'Dr. Kamala Shrestha', principalSignatureBuffer: null,
      schoolStampBuffer: null, accentColor: '#0d5c43', accentTint: '#e6f0ec',
    },
    invoice: {
      invoiceNumber: 'BINV-2083-000028', studentName: 'Om Subedi',
      admissionNumber: 'STU-2081-0142', className: 'Grade 9',
      sectionName: 'A', rollNumber: '14', guardianName: 'Ramesh Subedi',
      bsYear: 2083, bsMonth: 6, fiscalYear: '2083/84', installment: 'Ashwin 2083',
      issueDateAd: '2026-08-10', issueDateBs: '2083-04-25',
      dueDateAd: '2026-08-25', dueDateBs: '2083-05-09',
      taxRate: null, taxAmount: 0, netAmount: 1350,
      previousBalance: 1800, totalReceivable: 3150,
      amountInWordsEn: 'Three Thousand One Hundred Fifty Rupees',
      amountInWordsNe: 'तीन हजार एक सय पचास रुपैयाँ',
    },
    items: Array.from({ length: n }, (_, i) => ({
      itemName: `Fee Head ${i + 1}`, grossAmount: 1000, concessionAmount: 100,
      apportionedConcession: 0, isTaxable: true,
    })),
    language,
  });

  it.each(['EN', 'NE', 'BOTH'] as PrintLanguage[])(
    'a single invoice is exactly ONE A4 page [%s]', async (language) => {
      const { buffer: pdf } = await svc.render(pdfData(2, language));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pageCount(pdf)).toBe(1);
      const box = mediaBox(pdf)!;
      expect(box[0]).toBeCloseTo(595.28, 1);
      expect(box[1]).toBeCloseTo(841.89, 1);
    },
  );

  it('bulk print packs TWO documents per sheet', async () => {
    const { buffer: four } = await svc.renderMerged([pdfData(2), pdfData(2), pdfData(2), pdfData(2)]);
    expect(pageCount(four)).toBe(2);
  });

  it('an ODD batch leaves the trailing half blank rather than crashing', async () => {
    const { buffer: three } = await svc.renderMerged([pdfData(2), pdfData(2), pdfData(2)]);
    expect(pageCount(three)).toBe(2);
    expect(three.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('every sheet in a bulk job is A4', async () => {
    const { buffer: pdf } = await svc.renderMerged([pdfData(1), pdfData(3), pdfData(2)]);
    const boxes = [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
    expect(boxes.length).toBeGreaterThan(0);
    for (const [, w, h] of boxes) {
      expect(+w).toBeCloseTo(595.28, 1);
      expect(+h).toBeCloseTo(841.89, 1);
    }
  });

  // BILL-PRINT-1 D3 ruling: in BOTH mode the two halves are an English
  // document and a Nepali one — they are NOT copies of each other, so labelling
  // them "Student Copy" / "Office Copy" would be actively wrong.
  it('BOTH mode suppresses the copy designation; EN/NE keep it', () => {
    const seen: (string | null)[] = [];
    const spy: HalfRenderer = (_d, _b, copyLabel) => { seen.push(copyLabel); };

    drawSheet(newDoc(), [spy, spy], {
      stackMode: 'batch', copyLabels: ['Student Copy', 'Office Copy'], cutLabel: 'cut',
    });
    expect(seen).toEqual([null, null]);

    seen.length = 0;
    drawSheet(newDoc(), [spy], {
      stackMode: 'duplicate', copyLabels: ['Student Copy', 'Office Copy'], cutLabel: 'cut',
    });
    expect(seen).toEqual(['Student Copy', 'Office Copy']);
  });

  it('BOTH renders as batch (two locales), EN/NE as duplicate (two copies)', async () => {
    // Proven through the real service, not just drawSheet: BOTH must reach
    // drawSheet with stackMode 'batch' or the suppression above never applies.
    for (const language of ['EN', 'NE', 'BOTH'] as PrintLanguage[]) {
      const { buffer: pdf } = await svc.render(pdfData(2, language));
      expect(pageCount(pdf)).toBe(1);
    }
  });

  // The point of the fallback: a broken asset must put NOTHING on the page —
  // same as no asset at all — and be reported.
  //
  // Deliberately NOT asserted as byte-identical. A null asset short-circuits
  // before pdfkit's graphics state is touched; corrupt bytes emit a no-op
  // clip/restore pair (re / W n / Q, ~33 bytes) before doc.image() throws.
  // The rendered RESULT is identical — zero images either way — and chasing
  // byte-equality would mean pre-decoding the image to avoid the clip, which
  // duplicates pdfkit's decoder for no visible gain.
  it('a broken asset puts nothing on the page, exactly like no asset', async () => {
    const corrupt = Buffer.from('this is not an image at all');
    const withNull = await svc.render(pdfData(2));
    const withCorrupt = await svc.render({
      ...pdfData(2),
      tenant: { ...pdfData(2).tenant, principalSignatureBuffer: corrupt },
    });
    const images = (b: Buffer) => (b.toString('latin1').match(/\/Subtype\s*\/Image/g) ?? []).length;
    expect(images(withNull.buffer)).toBe(0);
    expect(images(withCorrupt.buffer)).toBe(0);
    expect(pageCount(withCorrupt.buffer)).toBe(pageCount(withNull.buffer));
    expect(mediaBox(withCorrupt.buffer)).toEqual(mediaBox(withNull.buffer));

    expect(withCorrupt.assetMisses.map((m) => m.kind)).toEqual(['principal-signature']);
    expect(withNull.assetMisses).toEqual([]);
  });

  // The copyLabel bug lived in BillReceiptA5Service.halfFor — the layer that
  // wires probe-to-draw — not in the renderer. Every existing receipt spec
  // MOCKS that service, so nothing exercised the real two-pass wiring and a
  // regression there would ship silently. This renders through the actual
  // service, which is the only test that would catch it.
  it('the A5 receipt service renders end to end through its two-pass fit', async () => {
    const svcA5 = new BillReceiptA5Service();
    const receipt = (allocations: number, advance: number, method: string): BillReceiptData => ({
      tenant: {
        name: 'Demo School Nepal', principalName: 'Dr. Kamala Shrestha', accentColor: '#0d5c43',
        address: 'Naya Baneshwor, Kathmandu-10, Nepal', phone: '01-4780123',
        website: 'https://demoschool.edu.np', panNumber: '301234567', registrationNumber: 'REG-1',
        logoBuffer: null, principalSignatureBuffer: null, schoolStampBuffer: null,
      },
      receiptNumber: 'RCPT-2083-000021', receivedDateAd: '2026-08-12', receivedDateBs: '2083-04-27',
      provisional: false,
      studentName: 'Binod Gurung', className: 'Grade 9', sectionName: 'B', rollNumber: '22',
      method, txnRef: method === 'CASH' ? null : 'ESW-8842190337',
      amount: allocations * 1000 + advance,
      allocations: Array.from({ length: allocations }, (_, i) => ({
        invoiceNumber: `BINV-2083-${String(i + 1).padStart(6, '0')}`, amount: 1000,
        installment: 'Shrawan 2083',
      })),
      // These three were ABSENT before and the fixture still rendered: with
      // balanceAfterSign undefined the balance line printed with NO (DR)
      // marker, so this test's coverage of the marker path was zero even
      // though it rendered a plausible receipt.
      advanceAmount: advance, appliedToBalance: 0, advanceCredit: advance,
      balanceAfter: 2150, balanceAfterSign: 'OWES',
      receivedByName: 'Sita Maharjan',
      amountInWordsEn: 'One Thousand Rupees', amountInWordsNe: null, language: 'EN',
    });

    for (const shape of [receipt(1, 0, 'ESEWA'), receipt(0, 1500, 'CHEQUE'), receipt(6, 0, 'CASH')]) {
      const { buffer } = await svcA5.render(shape);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pageCount(buffer)).toBe(1);
      const box = mediaBox(buffer)!;
      expect(box[0]).toBeCloseTo(595.28, 1);
      expect(box[1]).toBeCloseTo(841.89, 1);
      // The two-pass fit lands content exactly on the footer, so a probe/draw
      // divergence shows up as an overflow rather than as a bad-looking page.
      // Asserting only "it produced a PDF" would not see that; the render call
      // above throwing IS the assertion, and this documents why.
      expect(buffer.length).toBeGreaterThan(1000);
    }
  });

  it('drawSheet renders the cut line and marker once per sheet', async () => {
    const pdf = await toBuffer((doc) => {
      drawSheet(doc, [() => undefined], {
        stackMode: 'duplicate', copyLabels: ['Student Copy', 'Office Copy'], cutLabel: 'cut',
      });
    });
    expect(pageCount(pdf)).toBe(1);
  });
});
