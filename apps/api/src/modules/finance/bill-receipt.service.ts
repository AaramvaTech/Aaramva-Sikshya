import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { loadPdfFonts, pickFont, drawMixedText } from '../../common/pdf/pdf-fonts';
import { Money } from '../../common/money/money';
import { printLabel, PrintLanguage } from './bill-print-labels';

const MUTED = '#6b7280';
const INK = '#111827';
const HAIRLINE = '#e5e2da';

// 80mm thermal width (B8-2), minus small margins. Height is computed per
// receipt (computeHeight) rather than fixed — a real thermal printer cuts
// wherever content ends; a fixed PDF page size just needs to match that.
const PAGE_W = 226.77; // 80mm in points
const MARGIN = 10;

export interface BillReceiptAllocationLine {
  invoiceNumber: string;
  amount: number;
  /** BILL-PRINT-1: the allocated invoice's BS period, e.g. "Shrawan 2083". */
  installment: string;
}

export interface BillReceiptTenant {
  name: string;
  principalName: string | null;
  accentColor: string;
  // BILL-PRINT-1: the A5 stationery carries a full letterhead. The thermal
  // renderer below ignores every field in this block — 80mm has no room for
  // one — but both formats read one assembled payload, so these live here
  // rather than in a parallel shape.
  address: string | null;
  phone: string | null;
  website: string | null;
  panNumber: string | null;
  registrationNumber: string | null;
  logoBuffer: Buffer | null;
  /** A5 only — drawn into the reserved signing space, best-effort. */
  principalSignatureBuffer: Buffer | null;
  schoolStampBuffer: Buffer | null;
}

export interface BillReceiptData {
  tenant: BillReceiptTenant;
  receiptNumber: string;
  receivedDateAd: string;
  receivedDateBs: string;
  studentName: string;
  className: string;
  /** BILL-PRINT-1 party block. */
  sectionName: string | null;
  rollNumber: string | null;
  method: string;
  /** Resolved per Decision 5; null for CASH, which prints an empty slot. */
  txnRef: string | null;
  amount: number;
  allocations: BillReceiptAllocationLine[];
  advanceAmount: number;
  /**
   * BILL-PRINT-1: the student's ledger balance AS OF this payment's own
   * ledger entry — never the live balance. Signed on the ledger convention:
   * positive = owes (DR), negative = advance (CR). A reprint must never
   * contradict the slip that was originally handed over.
   */
  balanceAfter: number;
  receivedByName: string | null;
  amountInWordsEn: string | null;
  amountInWordsNe: string | null;
  language: PrintLanguage;
}

/**
 * BILL-8 Checkpoint B — 80mm thermal receipt (B8-2). Pure renderer, same
 * discipline as BillPdfService: already-fetched, already-colored, already-
 * language-resolved data in, bytes out. Accent used exactly twice here
 * (narrower format than the bill): the header rule and the Amount
 * Received figure — everything else stays ink/muted, same "one accent
 * used purposefully" principle.
 */
@Injectable()
export class BillReceiptService {
  private readonly fonts = loadPdfFonts();

  render(data: BillReceiptData): Promise<Buffer> {
    const height = this.computeHeight(data);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [PAGE_W, height], margin: MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (const [name, buf] of Object.entries(this.fonts)) doc.registerFont(name, buf);
      const w = PAGE_W - MARGIN * 2;
      const lang = data.language;
      const label = (key: Parameters<typeof printLabel>[0]) => printLabel(key, lang);
      const num = (n: number) => Money.fromNumber(n).toDisplay();

      // ── Header ────────────────────────────────────────────────────────
      doc.font(pickFont(data.tenant.name, true)).fontSize(13).fillColor(data.tenant.accentColor)
        .text(data.tenant.name, MARGIN, doc.y, { width: w, align: 'center' });
      doc.moveDown(0.3);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + w, doc.y).strokeColor(data.tenant.accentColor).lineWidth(1.5).stroke();
      doc.moveDown(0.5);

      const receiptTitle = label('receipt');
      doc.font(pickFont(receiptTitle, true)).fontSize(11).fillColor(INK)
        .text(receiptTitle, MARGIN, doc.y, { width: w, align: 'center' });
      doc.moveDown(0.4);

      // ── Meta rows (label left, value right) ──────────────────────────
      const metaRow = (labelText: string, value: string) => {
        const y = doc.y;
        doc.font(pickFont(labelText)).fontSize(8).fillColor(MUTED).text(labelText, MARGIN, y, { width: w * 0.45 });
        doc.font(pickFont(value, true)).fontSize(8.5).fillColor(INK)
          .text(value, MARGIN + w * 0.45, y, { width: w * 0.55, align: 'right' });
        doc.y = y + 13;
      };
      metaRow(label('receiptNo'), data.receiptNumber);
      metaRow(label('date'), `${data.receivedDateAd} (${data.receivedDateBs} BS)`);
      metaRow(label('student'), data.studentName);
      metaRow(label('class'), data.className);
      metaRow(label('method'), data.method);

      doc.moveDown(0.3);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + w, doc.y).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
      doc.moveDown(0.5);

      // ── Amount received — the one large, accent figure ───────────────
      const amountLabel = label('amountReceived');
      doc.font(pickFont(amountLabel)).fontSize(8).fillColor(MUTED)
        .text(amountLabel.toUpperCase(), MARGIN, doc.y, { width: w, align: 'center' });
      doc.moveDown(0.15);
      doc.font('latin-bold').fontSize(18).fillColor(data.tenant.accentColor)
        .text(`Rs. ${num(data.amount)}`, MARGIN, doc.y, { width: w, align: 'center' });
      doc.moveDown(0.5);

      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + w, doc.y).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
      doc.moveDown(0.4);

      // ── Allocations ────────────────────────────────────────────────────
      if (data.allocations.length > 0) {
        const paidLabel = label('paidTowards');
        doc.font(pickFont(paidLabel)).fontSize(8).fillColor(MUTED).text(paidLabel.toUpperCase(), MARGIN, doc.y);
        doc.moveDown(0.2);
        for (const a of data.allocations) {
          const y = doc.y;
          doc.font('latin').fontSize(8.5).fillColor(INK).text(a.invoiceNumber, MARGIN, y, { width: w * 0.55 });
          doc.font('latin').fontSize(8.5).fillColor(INK)
            .text(num(a.amount), MARGIN + w * 0.55, y, { width: w * 0.45, align: 'right' });
          doc.y = y + 12;
        }
        doc.moveDown(0.2);
      }
      if (data.advanceAmount > 0) {
        const y = doc.y;
        const advLabel = label('advanceCredit');
        doc.font(pickFont(advLabel)).fontSize(8.5).fillColor(INK).text(advLabel, MARGIN, y, { width: w * 0.55 });
        doc.font('latin').fontSize(8.5).fillColor(INK)
          .text(num(data.advanceAmount), MARGIN + w * 0.55, y, { width: w * 0.45, align: 'right' });
        doc.y = y + 16;
      }

      // ── Balance after this payment (BILL-PRINT-1) ────────────────────
      // The one addition to this frozen renderer: the most-requested line on
      // a fee slip, and it must be on the counter copy too, not only the A5.
      {
        const y = doc.y;
        const balLabel = `${label('balanceAfterPayment')} ${data.balanceAfter < 0 ? '(CR)' : '(DR)'}`;
        doc.font(pickFont(balLabel)).fontSize(8).fillColor(MUTED).text(balLabel, MARGIN, y, { width: w * 0.6 });
        doc.font('latin-bold').fontSize(9).fillColor(INK)
          .text(`Rs. ${num(Math.abs(data.balanceAfter))}`, MARGIN + w * 0.6, y, { width: w * 0.4, align: 'right' });
        doc.y = y + 18;
      }

      // ── Amount in words (compact) ─────────────────────────────────────
      const wordsLines = [
        lang !== 'NE' && data.amountInWordsEn ? `${data.amountInWordsEn} ${label('only')}` : null,
        lang !== 'EN' && data.amountInWordsNe ? `${data.amountInWordsNe} ${printLabel('only', 'NE')}` : null,
      ].filter((l): l is string => l != null);
      if (wordsLines.length > 0) {
        doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + w, doc.y).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
        doc.moveDown(0.4);
        for (const line of wordsLines) {
          doc.font(pickFont(line)).fontSize(7.5).fillColor(MUTED).text(line, MARGIN, doc.y, { width: w });
          doc.moveDown(0.2);
        }
        doc.moveDown(0.2);
      }

      // ── Footer ────────────────────────────────────────────────────────
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + w, doc.y).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
      doc.moveDown(0.4);
      const forLabel = label('forSchool');
      // Same mixed-script bug as the bill's signature line: forLabel may
      // be Devanagari, data.tenant.name is whatever script the school
      // entered (usually Latin) — drawMixedText font-picks each run
      // independently instead of forcing both through one font.
      drawMixedText(doc, [{ text: `${forLabel}: ` }, { text: data.tenant.name }],
        MARGIN, doc.y, { width: w, align: 'center', fontSize: 8, color: INK });
      if (data.tenant.principalName) {
        doc.moveDown(0.15);
        doc.font(pickFont(data.tenant.principalName)).fontSize(7.5).fillColor(MUTED)
          .text(data.tenant.principalName, MARGIN, doc.y, { width: w, align: 'center' });
      }
      doc.moveDown(0.4);
      const thankYou = label('thankYou');
      doc.font(pickFont(thankYou)).fontSize(8).fillColor(data.tenant.accentColor)
        .text(thankYou, MARGIN, doc.y, { width: w, align: 'center' });

      doc.end();
    });
  }

  /** Rough per-section point budget matching the draw calls above — a
   *  reasonable fixed-ish estimate rather than a true two-pass measure,
   *  same trade-off real thermal-receipt generators make (the printer
   *  cuts wherever content ends; this just needs to not clip). Generous
   *  padding at the end absorbs line-wrap variance in longer names/
   *  addresses/amount-in-words. */
  private computeHeight(data: BillReceiptData): number {
    const header = 70;
    const metaRows = 5 * 13;
    const amountBlock = 70;
    const allocations = data.allocations.length * 12 + (data.allocations.length > 0 ? 30 : 0);
    const advance = data.advanceAmount > 0 ? 16 : 0;
    const balanceAfter = 18; // BILL-PRINT-1 line above
    const wordsLines = (data.language === 'BOTH' ? 2 : 1) * 22;
    const footer = 90;
    const padding = 40;
    return header + metaRows + amountBlock + allocations + advance + balanceAfter + wordsLines + footer + padding;
  }
}
