import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { loadPdfFonts } from '../../common/pdf/pdf-fonts';
import { printLabel, PrintLanguage, LabelKey } from './bill-print-labels';
import { PAGE, drawSheet, HalfRenderer, StackMode, AssetMiss } from './print/a5-sheet';
import { Locale } from './print/mm';
import { renderInvoiceHalf, InvoiceHalfData, InvoiceHalfLine } from './print/invoice-half';

export interface BillPdfLineItem {
  itemName: string;
  grossAmount: number;
  /** Per-head/transport concession already carried on the stored row. */
  concessionAmount: number;
  /** B8-7: this line's share of the whole-bill concession, render-time only. */
  apportionedConcession: number;
  isTaxable: boolean;
}

export interface BillPdfTenant {
  name: string;
  logoBuffer: Buffer | null;
  panNumber: string | null;
  registrationNumber: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  tagline: string | null;
  paymentInstructions: string | null;
  qrImageBuffer: Buffer | null;
  principalName: string | null;
  /**
   * Drawn into the reserved signing space above the signature rule, scaled to
   * fit, best-effort. A school that uploaded a signature or stamp must keep
   * seeing it on its bills; losing it silently would read as the software
   * breaking, and on a financial record it may matter more than that. Every
   * failure path — malformed stored value, S3 error, unsupported bytes — ends
   * at the blank signing gap, which is the design's own fallback state.
   */
  principalSignatureBuffer: Buffer | null;
  schoolStampBuffer: Buffer | null;
}

// BILL-PRINT-1 removed accentColor/accentTint from this shape: SPEC §4 fixes
// the accent at #0d5c43 and permits it in exactly four places, none of them a
// fill, so a per-tenant accent has nowhere left to go on this document. (The
// 80mm thermal receipt still has its own accentColor and is unaffected.)

export interface BillPdfInvoice {
  invoiceNumber: string;
  studentName: string;
  admissionNumber: string | null;
  className: string;
  /** BILL-PRINT-1: joined for the party block. */
  sectionName: string | null;
  rollNumber: string | null;
  guardianName: string | null;
  bsYear: number;
  bsMonth: number;
  /** Display form of the Nepali fiscal year, e.g. "2083/84". */
  fiscalYear: string;
  /** Month label, e.g. "Ashwin 2083". */
  installment: string;
  issueDateAd: string;
  issueDateBs: string;
  dueDateAd: string;
  dueDateBs: string;
  taxRate: number | null;
  taxAmount: number;
  netAmount: number;
  previousBalance: number;
  totalReceivable: number;
  amountInWordsEn: string | null;
  amountInWordsNe: string | null;
}

/**
 * Bytes plus whatever could not be drawn. The misses are RETURNED, not logged:
 * this service and print/ are pure renderers, and the orchestrating service is
 * the only layer that still knows each asset's stored ref — which the log line
 * needs.
 */
export interface BillPdfRender {
  buffer: Buffer;
  assetMisses: AssetMiss[];
}

export interface BillPdfData {
  tenant: BillPdfTenant;
  invoice: BillPdfInvoice;
  items: BillPdfLineItem[];
  language: PrintLanguage;
}

/**
 * BILL-PRINT-1 — A4 sheet holding two A5 fee invoices, per
 * docs/design/billing-print/SPEC.md.
 *
 * Pure renderer: takes already-fetched, already-footed, already-language-
 * resolved data and produces PDF bytes only. Footing, snapshotting, reprint
 * caching and amount-in-words all live in BillDocumentService and are
 * untouched by this file — same discipline as before, and as
 * examination/pdf.service.ts.
 *
 * Replaces BILL-8's single-A4-per-invoice layout. What changed and why:
 *   - the solid accent-filled "total" pill is gone; hierarchy is now weight,
 *     size, and a 0.75pt rule (it photocopied as a black blob);
 *   - content no longer floats at the top of a mostly-empty page — the A5
 *     half IS the page, and the footer band is pinned to its bottom edge;
 *   - money columns are fixed-width, right-aligned and tabular-figured, so
 *     they sit on the decimal grid;
 *   - copy designation, cut line, fiscal year and the computer-generated
 *     note are all present, none of which the old layout had;
 *   - image slots render designed placeholders rather than filled rectangles.
 *
 * Language mapping: EN and NE render one locale per sheet, as SPEC §8
 * requires. BOTH has no equivalent in the design's model, so it renders the
 * reference files' own arrangement — the English document on the top half and
 * the Nepali one below — instead of the old inline "English / Nepali" labels,
 * which cannot hold the design's fixed label widths. Flagged as a deviation.
 */
@Injectable()
export class BillPdfService {
  private readonly fonts = loadPdfFonts();

  render(data: BillPdfData): Promise<BillPdfRender> {
    return this.document((doc) => this.drawSheetFor(doc, data));
  }

  /**
   * Bulk print: N invoices, two documents per A4 sheet in batch mode (no copy
   * eyebrow, different students on each half). An odd count leaves the
   * trailing half blank — the cut line still prints, so the sheet stays usable
   * stationery rather than crashing or stretching.
   *
   * The one-page rule is asserted per SHEET, not per job artifact: a bulk job
   * is inherently multi-page.
   */
  renderMerged(dataList: BillPdfData[]): Promise<BillPdfRender> {
    if (dataList.length === 0) throw new Error('renderMerged requires at least one invoice');
    return this.document((doc) => {
      const misses: AssetMiss[] = [];
      for (let i = 0; i < dataList.length; i += 2) {
        if (i > 0) doc.addPage();
        const pair = dataList.slice(i, i + 2);
        const first = pair[0];
        misses.push(...drawSheet(doc, pair.map((d) => this.halfFor(d, localeOf(d.language))), {
          stackMode: 'batch',
          copyLabels: copyLabels(first.language),
          cutLabel: printLabel('cut', primaryLanguage(first.language)),
        }));
      }
      return dedupe(misses);
    });
  }

  private document(draw: (doc: PDFKit.PDFDocument) => AssetMiss[]): Promise<BillPdfRender> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0, bufferPages: true });
      const chunks: Buffer[] = [];
      let assetMisses: AssetMiss[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), assetMisses }));
      doc.on('error', reject);
      for (const [name, buf] of Object.entries(this.fonts)) doc.registerFont(name, buf);
      assetMisses = draw(doc);
      doc.end();
    });
  }

  private drawSheetFor(doc: PDFKit.PDFDocument, data: BillPdfData): AssetMiss[] {
    const both = data.language === 'BOTH';
    const halves: HalfRenderer[] = both
      ? [this.halfFor(data, 'en'), this.halfFor(data, 'ne')]
      : [this.halfFor(data, localeOf(data.language))];
    const stackMode: StackMode = both ? 'batch' : 'duplicate';
    return drawSheet(doc, halves, {
      stackMode,
      copyLabels: copyLabels(data.language),
      cutLabel: printLabel('cut', primaryLanguage(data.language)),
    });
  }

  private halfFor(data: BillPdfData, locale: Locale): HalfRenderer {
    const half = toInvoiceHalf(data, locale);
    // The half reports its full result; the sheet only needs the misses.
    return (doc, box, copyLabel) => renderInvoiceHalf(doc, box, half, copyLabel).assetMisses;
  }
}

/** One line per broken asset, not one per sheet it appears on. */
function dedupe(misses: AssetMiss[]): AssetMiss[] {
  return misses.filter((m, i) => misses.findIndex((o) => o.kind === m.kind) === i);
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

function localeOf(language: PrintLanguage): Locale {
  return language === 'NE' ? 'ne' : 'en';
}

/** The PrintLanguage a sheet-level string (cut marker, copy labels) is drawn in. */
function primaryLanguage(language: PrintLanguage): PrintLanguage {
  return language === 'BOTH' ? 'EN' : language;
}

function copyLabels(language: PrintLanguage): [string, string] {
  const lang = primaryLanguage(language);
  return [printLabel('studentCopy', lang), printLabel('officeCopy', lang)];
}

/**
 * The design's five money columns from the stored line shape. Concession is
 * the stored per-line value plus this line's apportioned share of the
 * whole-bill concession; non-taxable and taxable split the net by the line's
 * own is_taxable flag — the same derivation the previous layout used, moved
 * out of the drawing code.
 */
export function toInvoiceLines(items: BillPdfLineItem[]): InvoiceHalfLine[] {
  return items.map((item) => {
    const concession = item.concessionAmount + item.apportionedConcession;
    const net = item.grossAmount - concession;
    return {
      head: item.itemName,
      gross: item.grossAmount,
      concession,
      nonTaxable: item.isTaxable ? 0 : net,
      taxable: item.isTaxable ? net : 0,
      total: net,
    };
  });
}

export function toInvoiceHalf(data: BillPdfData, locale: Locale): InvoiceHalfData {
  const lang: PrintLanguage = locale === 'ne' ? 'NE' : 'EN';
  const { invoice: inv, tenant } = data;
  const words = locale === 'ne' ? inv.amountInWordsNe : inv.amountInWordsEn;
  const only = printLabel('only', lang);
  return {
    school: {
      name: tenant.name,
      tagline: tenant.tagline,
      address: tenant.address,
      phone: tenant.phone,
      website: tenant.website,
      pan: tenant.panNumber,
      regNo: tenant.registrationNumber,
      logo: tenant.logoBuffer,
      qr: tenant.qrImageBuffer,
      paymentInstructions: tenant.paymentInstructions,
      signatoryName: tenant.principalName,
      signature: tenant.principalSignatureBuffer,
      stamp: tenant.schoolStampBuffer,
    },
    number: inv.invoiceNumber,
    issuedAd: inv.issueDateAd,
    issuedBs: inv.issueDateBs,
    dueAd: inv.dueDateAd,
    dueBs: inv.dueDateBs,
    fiscalYear: inv.fiscalYear,
    installment: inv.installment,
    studentName: inv.studentName,
    className: inv.className,
    section: inv.sectionName,
    roll: inv.rollNumber,
    studentId: inv.admissionNumber,
    guardian: inv.guardianName,
    lines: toInvoiceLines(data.items),
    // Pre-tax net, matching the sum of the lines' Total column so the fee
    // table foots against this figure exactly.
    subtotal: inv.netAmount - inv.taxAmount,
    previousBalance: inv.previousBalance,
    totalReceivable: inv.totalReceivable,
    inWords: words ? `${words} ${only}` : null,
    locale,
    label: (key: LabelKey) => printLabel(key, lang),
  };
}
