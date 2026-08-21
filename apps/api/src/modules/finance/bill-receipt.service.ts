import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { loadPdfFonts, pickFont, drawMixedText } from '../../common/pdf/pdf-fonts';
import { Money } from '../../common/money/money';
import { printLabel, PrintLanguage, methodLabel } from './bill-print-labels';
import { drCrMarker } from './print/a5-sheet';

const MUTED = '#6b7280';
const INK = '#111827';
const HAIRLINE = '#e5e2da';

// 80mm thermal width (B8-2). Height is MEASURED per receipt from the real
// drawn extent (see render) rather than estimated — a thermal printer cuts
// wherever content ends, so the page must match that and not a guess.
const PAGE_W = 226.77; // 80mm in points
const MARGIN = 10;
/** Taller than any receipt can be, so the measure pass can never break a page
 *  and its contentEnd is the true extent rather than a post-break artefact. */
const MEASURE_HEIGHT = 4000;

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
  /** Total unallocated: amount - sum(allocations). The split below adds to it. */
  advanceAmount: number;
  /**
   * The unallocated money that went against EXISTING debt. Not an advance —
   * nothing was held. Zero when the payment left the student in credit.
   */
  appliedToBalance: number;
  /** The unallocated money genuinely held as credit. appliedToBalance +
   *  advanceCredit === advanceAmount, always. */
  advanceCredit: number;
  /**
   * BILL-PRINT-1: the student's ledger balance AS OF this payment's own
   * ledger entry — never the live balance. A reprint must never contradict the
   * slip that was originally handed over.
   *
   * NULL when the payment has no ledger entry (it never posted — a bounced or
   * voided instrument). There is no "after" for a payment that did not happen,
   * so the line is SUPPRESSED rather than falling back to the live balance,
   * which would caption an unrelated figure as this payment's outcome.
   */
  balanceAfter: number | null;
  balanceAfterSign: 'OWES' | 'ADVANCE' | 'ZERO' | null;
  receivedByName: string | null;
  /**
   * BILL-RCPT-STATUS: this payment is an uncleared cheque (PENDING). The slip
   * becomes an acknowledgement — the amount is labelled TENDERED, not received,
   * and a subject-to-clearance line renders under the figure.
   *
   * A boolean rather than the raw status because only two states can reach a
   * renderer: BOUNCED and VOIDED are refused in the service, above the cache
   * lookup. This is the whole information content of the distinction.
   */
  provisional: boolean;
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

  /**
   * Two passes. The first draws onto a generously-tall throwaway page purely to
   * learn where the content actually ends; the second draws for real at exactly
   * that height plus the bottom margin.
   *
   * computeHeight()'s per-section estimate ran ~30% over — every slip trailed
   * 39-48mm of blank roll, which on a thermal printer is 4cm of paper fed and
   * cut for nothing, on every receipt. Measuring beats estimating here for the
   * same reason it did on the A5: the drawing code is the only thing that knows
   * how tall the drawing is, and a parallel calculation drifts from it.
   *
   * Cost: one extra render, ~25ms, never serialised (the throwaway document is
   * discarded without being written out).
   *
   * Page breaks are made IMPOSSIBLE in both passes rather than merely unlikely,
   * because the two passes use different page heights and pdfkit's break rule
   * reads the page height — so any slack calculation is a way for them to
   * disagree. The measure pass gets a page taller than any receipt can be; the
   * real pass carries a ZERO bottom margin with the cut margin baked into the
   * height instead. maxY is then the full page height, and content that ended
   * at `contentEnd` on the measure pass cannot reach it.
   *
   * This replaced `contentEnd + MARGIN` with a normal bottom margin, which left
   * EXACTLY zero slack: the last line ended precisely on maxY and pdfkit broke
   * on the boundary, pushing "Thank you" onto a second page on every slip.
   */
  async render(data: BillReceiptData): Promise<Buffer> {
    const measured = await this.draw(data, MEASURE_HEIGHT);
    return (await this.draw(data, measured.contentEnd + MARGIN)).buffer;
  }

  private draw(data: BillReceiptData, height: number): Promise<{ buffer: Buffer; contentEnd: number }> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [PAGE_W, height],
        margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 0 },
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      let contentEnd = 0;
      // Every draw call moves doc.y; the furthest it reaches is the content's
      // true bottom. Recorded by watching the cursor rather than by re-deriving
      // section heights.
      const mark = () => { if (doc.y > contentEnd) contentEnd = doc.y; };
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentEnd }));
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

      // BILL-RCPT-STATUS: the title changes too. A slip headed RECEIPT
      // contradicts the tendered label below it, and the title is what a
      // parent reads first.
      const receiptTitle = label(data.provisional ? 'acknowledgement' : 'receipt');
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
      // BILL-PRINT-1: display label, not the raw enum. A ONE-LINE exception to
      // this renderer's freeze — the counter copy and the office copy describe
      // the same payment, and leaving "ESEWA" on one while the other says
      // "eSewa" would be a worse outcome than the freeze protects against.
      metaRow(label('method'), methodLabel(data.method, lang));

      doc.moveDown(0.3);
      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + w, doc.y).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
      doc.moveDown(0.5);

      // ── Amount received — the one large, accent figure ───────────────
      // BILL-RCPT-STATUS: an uncleared cheque REPLACES this label rather than
      // qualifying it. "Amount received" is the false statement; leaving it up
      // and adding a note beneath would still put the claim on the slip.
      const amountLabel = label(data.provisional ? 'amountTendered' : 'amountReceived');
      doc.font(pickFont(amountLabel)).fontSize(8).fillColor(MUTED)
        .text(amountLabel.toUpperCase(), MARGIN, doc.y, { width: w, align: 'center' });
      doc.moveDown(0.15);
      doc.font('latin-bold').fontSize(18).fillColor(data.tenant.accentColor)
        .text(`Rs. ${num(data.amount)}`, MARGIN, doc.y, { width: w, align: 'center' });
      // Directly under the figure, in ink rather than muted grey: this is the
      // one line that stops the slip reading as a receipt, so it is not
      // de-emphasised to the weight of a caption.
      if (data.provisional) {
        doc.moveDown(0.3);
        const clearance = label('subjectToClearance');
        doc.font(pickFont(clearance)).fontSize(7.5).fillColor(INK)
          .text(clearance, MARGIN, doc.y, { width: w, align: 'center' });
      }
      doc.moveDown(0.5);

      doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + w, doc.y).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
      doc.moveDown(0.4);

      // ── Allocations ────────────────────────────────────────────────────
      // The header covers the WHOLE table, including the applied-to-balance and
      // advance-credit rows — they are rows of it, not a separate list. An
      // advance-only receipt was printing "Advance credit" with no heading
      // above it, so the row appeared without its table.
      const hasTableRows = data.allocations.length > 0
        || data.appliedToBalance > 0 || data.advanceCredit > 0;
      if (hasTableRows) {
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
      }
      // The unallocated money, split by what actually happened to it. Drawn
      // inside the same table as the allocations above (see hasTableRows).
      for (const [key, amt] of [
        ['appliedToBalance', data.appliedToBalance] as const,
        ['advanceCredit', data.advanceCredit] as const,
      ]) {
        if (amt <= 0) continue;
        const y = doc.y;
        const l = label(key);
        doc.font(pickFont(l)).fontSize(8.5).fillColor(INK).text(l, MARGIN, y, { width: w * 0.55 });
        doc.font('latin').fontSize(8.5).fillColor(INK)
          .text(num(amt), MARGIN + w * 0.55, y, { width: w * 0.45, align: 'right' });
        doc.y = y + 16;
      }
      if (hasTableRows) doc.moveDown(0.2);

      // ── Balance after this payment (BILL-PRINT-1) ────────────────────
      // The one addition to this frozen renderer: the most-requested line on
      // a fee slip, and it must be on the counter copy too, not only the A5.
      // Suppressed entirely when the payment never posted — see balanceAfter.
      if (data.balanceAfter !== null && data.balanceAfterSign !== null) {
        const y = doc.y;
        // ZERO carries no marker — see drCrMarker.
        const mk = drCrMarker(data.balanceAfterSign);
        const balLabel = mk ? `${label('balanceAfterPayment')} ${mk}` : label('balanceAfterPayment');
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
      mark();

      doc.end();
    });
  }

}
