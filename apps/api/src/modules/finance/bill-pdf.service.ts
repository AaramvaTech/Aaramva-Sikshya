import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { loadPdfFonts, pickFont } from '../../common/pdf/pdf-fonts';
import { BS_MONTH_NAMES_EN } from 'bs-calendar';
import { Money } from '../../common/money/money';

const PRIMARY = '#0B6B43';
const MUTED = '#6b7280';
const BORDER = '#d1d5db';
const INK = '#111827';
const DANGER = '#DC2626';
/** Fee-table header row + Total Receivable highlight — per the reviewed design. */
const TINT = '#E1F5EE';

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
  principalSignatureBuffer: Buffer | null;
  schoolStampBuffer: Buffer | null;
}

export interface BillPdfInvoice {
  invoiceNumber: string;
  studentName: string;
  admissionNumber: string | null;
  className: string;
  bsYear: number;
  bsMonth: number;
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
}

export interface BillPdfData {
  tenant: BillPdfTenant;
  invoice: BillPdfInvoice;
  items: BillPdfLineItem[];
}

/** Plain lakh-grouped number, no currency prefix — used everywhere except
 *  the final Total Receivable figure (design: "Rs." appears once, at the
 *  bottom, not on every row). */
const num = (n: number): string => Money.fromNumber(n).toDisplay();
const money = (n: number): string => `Rs. ${num(n)}`;

/**
 * BILL-8 Checkpoint A — A4 bill. Round 3: rebuilt against Srijan's own
 * reference mockup (exact target, not a description of one). Pure renderer:
 * takes already-fetched, already-footed data (BillDocumentService resolves
 * invoice/tenant/images and applies §2's apportionment before calling this)
 * and produces PDF bytes only — same "pure renderer" discipline as
 * examination/pdf.service.ts. This file only changes drawing code; the
 * footing/snapshot/reprint logic it's fed lives entirely in
 * BillDocumentService and is untouched.
 *
 * Every doc.image() call is guarded by a null check — a missing logo/QR/
 * signature/stamp renders nothing at all, and the layout collapses the
 * space that image would have occupied rather than leaving a gap.
 */
@Injectable()
export class BillPdfService {
  private readonly fonts = loadPdfFonts();

  render(data: BillPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      for (const [name, buf] of Object.entries(this.fonts)) doc.registerFont(name, buf);

      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;
      const GAP = 22; // breathing room between major sections

      this.renderHeader(doc, data.tenant, left, pageW);
      doc.y += GAP;
      this.renderInvoiceTitle(doc, left, pageW);
      doc.y += GAP;
      this.renderInvoiceMeta(doc, data.invoice, left, pageW);
      doc.y += GAP;
      this.renderItemsTable(doc, data.items, left, pageW);
      doc.y += GAP;
      const wholeBillConcession = data.items.reduce((acc, i) => acc + i.apportionedConcession, 0);
      this.renderSummary(doc, data.invoice, wholeBillConcession, left, pageW);
      doc.y += GAP;
      this.renderAmountInWords(doc, data.invoice.amountInWordsEn, left, pageW);
      doc.y += GAP * 1.4;
      this.renderFooter(doc, data.tenant, left, pageW);

      doc.end();
    });
  }

  private renderHeader(doc: PDFKit.PDFDocument, tenant: BillPdfTenant, left: number, pageW: number) {
    const top = doc.y;
    const logoSize = 56;
    if (tenant.logoBuffer) {
      try {
        doc.image(tenant.logoBuffer, left, top, { fit: [logoSize, logoSize] });
      } catch {
        // Corrupt/unsupported logo bytes must never break bill generation.
      }
    }
    // Collapse the reserved space entirely when there's no logo — never a gap.
    const textX = tenant.logoBuffer ? left + logoSize + 14 : left;
    const panBoxW = 150;
    const textW = pageW - (textX - left) - panBoxW - 14;

    doc.font(pickFont(tenant.name, true)).fontSize(21).fillColor(PRIMARY)
      .text(tenant.name, textX, top, { width: textW });
    if (tenant.tagline) {
      doc.font(pickFont(tenant.tagline)).fontSize(10).fillColor(MUTED)
        .text(tenant.tagline, textX, doc.y + 2, { width: textW });
    }
    const contactLine = [tenant.address, tenant.phone, tenant.website].filter(Boolean).join('   ·   ');
    if (contactLine) {
      // Wider than name/tagline above: by the third text line, doc.y has
      // cleared the PAN box's bottom edge, so this line doesn't need to
      // dodge it — using the narrower width here wrapped it to 2 lines.
      const contactW = pageW - (textX - left);
      doc.font('latin').fontSize(8.5).fillColor(MUTED).text(contactLine, textX, doc.y + 2, { width: contactW });
    }
    const textBottom = doc.y;

    // PAN — bordered box, top-right.
    let panBottom = top;
    if (tenant.panNumber) {
      const boxH = 34;
      const boxX = left + pageW - panBoxW;
      doc.rect(boxX, top, panBoxW, boxH).strokeColor(BORDER).lineWidth(0.75).stroke();
      doc.font('latin').fontSize(7.5).fillColor(MUTED)
        .text('PAN NO.', boxX, top + 7, { width: panBoxW - 12, align: 'right' });
      doc.font('latin-bold').fontSize(12).fillColor(INK)
        .text(tenant.panNumber, boxX, top + 18, { width: panBoxW - 12, align: 'right' });
      panBottom = top + boxH;
    }
    if (tenant.registrationNumber) {
      doc.font('latin').fontSize(7.5).fillColor(MUTED)
        .text(`Reg. No. ${tenant.registrationNumber}`, left + pageW - panBoxW, panBottom + 6, { width: panBoxW, align: 'right' });
      panBottom += 16;
    }

    doc.y = Math.max(textBottom, panBottom, top + logoSize) + 10;
    doc.moveTo(left, doc.y).lineTo(left + pageW, doc.y).strokeColor(PRIMARY).lineWidth(1.5).stroke();
  }

  /** Centered, bordered "INVOICE" label with letter-spacing. */
  private renderInvoiceTitle(doc: PDFKit.PDFDocument, left: number, pageW: number) {
    const label = 'I N V O I C E';
    doc.font('latin-bold').fontSize(13);
    const textW = doc.widthOfString(label);
    const boxW = textW + 50;
    const boxH = 26;
    const boxX = left + (pageW - boxW) / 2;
    const boxY = doc.y;
    doc.rect(boxX, boxY, boxW, boxH).strokeColor(PRIMARY).lineWidth(1).stroke();
    doc.fillColor(PRIMARY).text(label, boxX, boxY + 8, { width: boxW, align: 'center' });
    doc.y = boxY + boxH;
  }

  private renderInvoiceMeta(doc: PDFKit.PDFDocument, inv: BillPdfInvoice, left: number, pageW: number) {
    const y = doc.y;
    const colW = pageW / 2;
    const rowGap = 32;
    const field = (label: string, value: string, x: number, fy: number) => {
      doc.font('latin').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x, fy);
      doc.font(pickFont(value, true)).fontSize(10.5).fillColor(INK).text(value || '—', x, fy + 11);
    };
    field('Invoice No.', inv.invoiceNumber, left, y);
    field('Student', inv.studentName, left + colW, y);
    field('Class', inv.className, left, y + rowGap);
    field('Installment', `${BS_MONTH_NAMES_EN[inv.bsMonth - 1]} ${inv.bsYear}`, left + colW, y + rowGap);
    field('Issue Date', `${inv.issueDateAd} (${inv.issueDateBs} BS)`, left, y + rowGap * 2);
    field('Due Date', `${inv.dueDateAd} (${inv.dueDateBs} BS)`, left + colW, y + rowGap * 2);
    doc.y = y + rowGap * 2 + 22;
  }

  private renderItemsTable(doc: PDFKit.PDFDocument, items: BillPdfLineItem[], left: number, pageW: number) {
    const cols = [
      { label: 'Fee head', w: 0.30, align: 'left' as const },
      { label: 'Gross', w: 0.14, align: 'right' as const },
      { label: 'Concession', w: 0.14, align: 'right' as const },
      { label: 'Non-taxable', w: 0.14, align: 'right' as const },
      { label: 'Taxable', w: 0.14, align: 'right' as const },
      { label: 'Total', w: 0.14, align: 'right' as const },
    ];
    const xs: number[] = [];
    let acc = left;
    for (const c of cols) { xs.push(acc); acc += c.w * pageW; }

    // Tinted header row.
    const headerY = doc.y;
    const headerH = 22;
    doc.rect(left, headerY, pageW, headerH).fill(TINT);
    doc.font('latin-bold').fontSize(8.5).fillColor(PRIMARY);
    cols.forEach((c, i) => doc.text(c.label, xs[i] + 8, headerY + 7, { width: c.w * pageW - 12, align: c.align }));
    doc.y = headerY + headerH;

    const rowH = 24;
    items.forEach((item, idx) => {
      if (doc.y > doc.page.height - 100) doc.addPage();
      const totalConcession = item.concessionAmount + item.apportionedConcession;
      const net = item.grossAmount - totalConcession;
      const nonTaxable = item.isTaxable ? 0 : net;
      const taxable = item.isTaxable ? net : 0;
      const rowY = doc.y;
      const textY = rowY + 7;
      doc.font(pickFont(item.itemName, true)).fontSize(9.5).fillColor(INK)
        .text(item.itemName, xs[0] + 8, textY, { width: cols[0].w * pageW - 12, align: 'left' });
      doc.font('latin').fontSize(9.5).fillColor(INK)
        .text(num(item.grossAmount), xs[1] + 8, textY, { width: cols[1].w * pageW - 12, align: 'right' });
      doc.fillColor(totalConcession > 0 ? DANGER : INK)
        .text(num(totalConcession), xs[2] + 8, textY, { width: cols[2].w * pageW - 12, align: 'right' });
      doc.fillColor(INK)
        .text(num(nonTaxable), xs[3] + 8, textY, { width: cols[3].w * pageW - 12, align: 'right' })
        .text(num(taxable), xs[4] + 8, textY, { width: cols[4].w * pageW - 12, align: 'right' })
        .text(num(net), xs[5] + 8, textY, { width: cols[5].w * pageW - 12, align: 'right' });
      doc.y = rowY + rowH;
      // 0.5px row separator, skipped after the last row (the totals block
      // below provides its own visual boundary).
      if (idx < items.length - 1) {
        doc.moveTo(left, doc.y).lineTo(left + pageW, doc.y).strokeColor(BORDER).lineWidth(0.5).stroke();
      }
    });
    doc.moveTo(left, doc.y).lineTo(left + pageW, doc.y).strokeColor(BORDER).lineWidth(0.5).stroke();
  }

  private renderSummary(
    doc: PDFKit.PDFDocument,
    inv: BillPdfInvoice,
    wholeBillConcession: number,
    left: number,
    pageW: number,
  ) {
    if (doc.y > doc.page.height - 180) doc.addPage();
    const summaryW = 270;
    const summaryX = left + pageW - summaryW;
    const labelW = summaryW * 0.6;
    const valueW = summaryW * 0.4;
    // Fixed row height assumes every label fits on one line at this width —
    // true for this phase's known, bounded label set ("Less: Scholarship/
    // Discount" is the longest). A future label that doesn't fit needs a
    // real measured-height row, not a wider guess here.
    const row = (label: string, value: string, valueColor = INK) => {
      const y = doc.y;
      doc.font('latin').fontSize(9.5).fillColor(INK)
        .text(label, summaryX, y, { width: labelW, align: 'left' });
      doc.font('latin').fontSize(9.5).fillColor(valueColor)
        .text(value, summaryX + labelW, y, { width: valueW, align: 'right' });
      doc.y = y + 18;
    };

    if (wholeBillConcession > 0) {
      row('Less: Scholarship / Discount', `(${num(wholeBillConcession)})`, DANGER);
    }
    if (inv.taxRate != null) {
      row(`Tax (${inv.taxRate}%)`, num(inv.taxAmount));
    }
    const prevAbs = Math.abs(inv.previousBalance);
    if (prevAbs > 0) {
      const label = inv.previousBalance > 0 ? 'Previous balance (Dr)' : 'Previous balance (Cr)';
      row(label, num(prevAbs));
    }

    doc.y += 6;

    // Total Receivable — the one figure on this block that carries "Rs."
    // and the only bold/tinted row (no separate "Grand Total" line above it
    // — per the reviewed design, this row already includes the previous
    // balance, so a second subtotal would be redundant).
    const trY = doc.y;
    const trH = 26;
    doc.rect(summaryX, trY, summaryW, trH).fill(TINT);
    doc.font('latin-bold').fontSize(12.5).fillColor(PRIMARY)
      .text('Total receivable', summaryX + 10, trY + 7, { width: labelW - 10, align: 'left' });
    doc.font('latin-bold').fontSize(12.5).fillColor(PRIMARY)
      .text(money(inv.totalReceivable), summaryX + labelW, trY + 7, { width: valueW - 10, align: 'right' });
    doc.y = trY + trH;
  }

  private renderAmountInWords(doc: PDFKit.PDFDocument, amountInWordsEn: string | null, left: number, pageW: number) {
    if (!amountInWordsEn) return;
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.font('latin').fontSize(8).fillColor(MUTED).text('AMOUNT IN WORDS', left, doc.y);
    doc.font('latin-bold').fontSize(10.5).fillColor(INK)
      .text(`${amountInWordsEn} only`, left, doc.y + 3, { width: pageW });
  }

  private renderFooter(doc: PDFKit.PDFDocument, tenant: BillPdfTenant, left: number, pageW: number) {
    if (doc.y > doc.page.height - 120) doc.addPage();
    const y = doc.y;
    const qrSize = 56;

    // QR image left + payment instructions text. The text column starts
    // right after the QR if present; when absent, it starts at `left` —
    // the reserved QR width collapses entirely rather than leaving a gap.
    if (tenant.paymentInstructions || tenant.qrImageBuffer) {
      if (tenant.qrImageBuffer) {
        try {
          doc.image(tenant.qrImageBuffer, left, y, { fit: [qrSize, qrSize] });
        } catch {
          // Corrupt QR bytes never block bill generation.
        }
      }
      if (tenant.paymentInstructions) {
        const textX = tenant.qrImageBuffer ? left + qrSize + 14 : left;
        doc.font('latin').fontSize(8).fillColor(MUTED).text('PAYMENT INSTRUCTIONS', textX, y);
        doc.font('latin').fontSize(9).fillColor(INK)
          .text(tenant.paymentInstructions, textX, y + 12, { width: pageW * 0.55 - (textX - left) });
      }
    }

    // Signature block right — "For: {School}" + principal name, with
    // optional stamp/signature images above. Same null-guard/collapse
    // discipline as the QR: no image, no reserved gap.
    const sigW = 210;
    const sigX = left + pageW - sigW;
    let sigTextY = y + 6;
    if (tenant.schoolStampBuffer || tenant.principalSignatureBuffer) {
      const imgY = y;
      if (tenant.schoolStampBuffer) {
        try {
          doc.image(tenant.schoolStampBuffer, sigX + sigW - 55, imgY, { fit: [50, 50] });
        } catch {
          // ignore
        }
      }
      if (tenant.principalSignatureBuffer) {
        try {
          doc.image(tenant.principalSignatureBuffer, sigX, imgY + 8, { fit: [sigW - 65, 34] });
        } catch {
          // ignore
        }
      }
      sigTextY = imgY + 56;
    }
    doc.font('latin').fontSize(9).fillColor(INK)
      .text(`For: ${tenant.name}`, sigX, sigTextY, { width: sigW, align: 'right' });
    if (tenant.principalName) {
      doc.font('latin').fontSize(8.5).fillColor(PRIMARY)
        .text(tenant.principalName, sigX, sigTextY + 13, { width: sigW, align: 'right' });
    }
  }
}
