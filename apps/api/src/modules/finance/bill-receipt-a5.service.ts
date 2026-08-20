import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { loadPdfFonts } from '../../common/pdf/pdf-fonts';
import { printLabel, PrintLanguage, LabelKey, methodLabel, GATEWAY_METHODS, continuationLabel } from './bill-print-labels';
import { PAGE, drawSheet, HalfRenderer, AssetMiss } from './print/a5-sheet';
import { Locale } from './print/mm';
import { renderReceiptHalf, ReceiptHalfData } from './print/receipt-half';
import { halfBox } from './print/a5-sheet';
import { BillReceiptData } from './bill-receipt.service';
import { BillPdfRender } from './bill-pdf.service';

/**
 * BILL-PRINT-1 — A4 sheet holding two A5 payment receipts, per SPEC §7.
 *
 * Decision 2: this does NOT replace the 80mm thermal receipt
 * (bill-receipt.service.ts), which stays live and frozen for the counter
 * printer. Format is chosen at the call site — the cashier's payment modal
 * keeps thermal, the office paths produce A5 — and both read the SAME
 * assembled data from BillReceiptDocumentService, so balance-after is
 * computed once and neither renderer owns a second copy of it.
 */
@Injectable()
export class BillReceiptA5Service {
  private readonly fonts = loadPdfFonts();

  render(data: BillReceiptData): Promise<BillPdfRender> {
    return this.document((doc) => {
      const both = data.language === 'BOTH';
      const halves: HalfRenderer[] = both
        ? [this.halfFor(data, 'en'), this.halfFor(data, 'ne')]
        : [this.halfFor(data, data.language === 'NE' ? 'ne' : 'en')];
      return drawSheet(doc, halves, {
        stackMode: both ? 'batch' : 'duplicate',
        copyLabels: [
          printLabel('studentCopy', primary(data.language)),
          printLabel('officeCopy', primary(data.language)),
        ],
        cutLabel: printLabel('cut', primary(data.language)),
      });
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

  /**
   * Two passes. A receipt is short, so the first pass measures how far the
   * content falls short of the footer and the second re-renders with the
   * inter-group gaps scaled to close it (see ReceiptHalfResult.gapScaleForFit).
   *
   * The measurement pass draws into a throwaway document that is never
   * serialised — using the real drawing code as the measurement keeps ONE
   * source of truth for the layout, instead of a second height calculation
   * that could drift from what is actually drawn.
   */
  private halfFor(data: BillReceiptData, locale: Locale): HalfRenderer {
    const half = toReceiptHalf(data, locale);
    return (doc, box, copyLabel) => {
      // The probe MUST use the same copyLabel as the real draw: the copy
      // eyebrow makes the identity block taller, so measuring without it
      // overstates the slack and the fitted pass then overflows. (Found by
      // real data; the earlier version probed with null and overran by 1.5mm.)
      const probe = new PDFDocument({ size: [PAGE.width, PAGE.height], margin: 0 });
      for (const [name, buf] of Object.entries(this.fonts)) probe.registerFont(name, buf);
      const { gapScaleForFit } = renderReceiptHalf(probe, box, half, copyLabel);
      probe.end();
      return renderReceiptHalf(doc, box, half, copyLabel, gapScaleForFit).assetMisses;
    };
  }
}

function primary(language: PrintLanguage): PrintLanguage {
  return language === 'BOTH' ? 'EN' : language;
}

export function toReceiptHalf(data: BillReceiptData, locale: Locale): ReceiptHalfData {
  const lang: PrintLanguage = locale === 'ne' ? 'NE' : 'EN';
  const words = locale === 'ne' ? data.amountInWordsNe : data.amountInWordsEn;
  const only = printLabel('only', lang);
  return {
    school: {
      name: data.tenant.name,
      address: data.tenant.address,
      phone: data.tenant.phone,
      website: data.tenant.website,
      pan: data.tenant.panNumber,
      regNo: data.tenant.registrationNumber,
      logo: data.tenant.logoBuffer,
      signatoryName: data.tenant.principalName,
      signature: data.tenant.principalSignatureBuffer,
      stamp: data.tenant.schoolStampBuffer,
    },
    number: data.receiptNumber,
    dateAd: data.receivedDateAd,
    dateBs: data.receivedDateBs,
    studentName: data.studentName,
    className: data.className,
    section: data.sectionName,
    roll: data.rollNumber,
    method: methodLabel(data.method, lang),
    txnRef: data.txnRef,
    amount: data.amount,
    inWords: words ? `${words} ${only}` : null,
    allocations: data.allocations.map((a) => ({
      invoiceNumber: a.invoiceNumber,
      installment: a.installment,
      amount: a.amount,
    })),
    advanceAmount: data.advanceAmount,
    balanceAfter: data.balanceAfter,
    // A gateway payment has no human receiver. `bill_payments.received_by` is
    // the user who SUBMITTED it, which for eSewa/Khalti is the parent paying —
    // so the slot was printing the payer's own name under a label that reads
    // "name of the person who received the money" (रकम बुझ्नेको नाम). Suppressed
    // for gateways; the slot keeps its geometry and reads as not-applicable,
    // the same convention the CASH transaction-ref slot already uses. The
    // method is already named in the party block, so nothing is lost.
    receivedBy: GATEWAY_METHODS.includes(data.method) ? null : data.receivedByName,
    locale,
    label: (key: LabelKey) => printLabel(key, lang),
    continuation: (count: number) => continuationLabel(count, 'invoice', lang),
  };
}
