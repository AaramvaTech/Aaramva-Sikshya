import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { loadPdfFonts, pickFont } from '../../common/pdf/pdf-fonts';
import { BS_MONTH_NAMES_EN } from 'bs-calendar';

const PRIMARY = '#0B6B43';
const MUTED = '#6b7280';
const BORDER = '#d1d5db';
const INK = '#111827';

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

const money = (n: number): string => `Rs. ${n.toFixed(2)}`;

/**
 * BILL-8 Checkpoint A — A4 bill, mirrors the Ullens Kathmandu reference
 * layout (B8-4). Pure renderer: takes already-fetched, already-footed data
 * (BillDocumentService resolves invoice/tenant/images and applies §2's
 * apportionment before calling this) and produces PDF bytes only — same
 * "pure renderer" discipline as examination/pdf.service.ts.
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

      this.renderHeader(doc, data.tenant, left, pageW);
      this.renderInvoiceMeta(doc, data.tenant, data.invoice, left, pageW);
      this.renderItemsTable(doc, data.items, left, pageW);
      const wholeBillConcession = data.items.reduce((acc, i) => acc + i.apportionedConcession, 0);
      this.renderSummary(doc, data.invoice, wholeBillConcession, left, pageW);
      this.renderAmountInWords(doc, data.invoice.amountInWordsEn, left, pageW);
      this.renderFooter(doc, data.tenant, left, pageW);

      doc.end();
    });
  }

  private renderHeader(doc: PDFKit.PDFDocument, tenant: BillPdfTenant, left: number, pageW: number) {
    const top = doc.y;
    if (tenant.logoBuffer) {
      try {
        doc.image(tenant.logoBuffer, left, top, { fit: [60, 60] });
      } catch {
        // Corrupt/unsupported logo bytes must never break bill generation.
      }
    }
    const textX = tenant.logoBuffer ? left + 72 : left;
    const textW = pageW - (tenant.logoBuffer ? 72 : 0);
    doc.font(pickFont(tenant.name, true)).fontSize(18).fillColor(PRIMARY)
      .text(tenant.name, textX, top, { width: textW });
    if (tenant.tagline) {
      doc.font('latin').fontSize(9).fillColor(MUTED).text(tenant.tagline, textX, doc.y, { width: textW });
    }
    const contactLine = [tenant.address, tenant.phone, tenant.website].filter(Boolean).join('  ·  ');
    if (contactLine) {
      doc.font('latin').fontSize(8).fillColor(MUTED).text(contactLine, textX, doc.y, { width: textW });
    }
    doc.y = Math.max(doc.y, top + 60) + 6;

    // PAN — boxed field (B8-4).
    if (tenant.panNumber) {
      const boxW = 160;
      const boxY = doc.y;
      doc.rect(left + pageW - boxW, boxY, boxW, 24).strokeColor(BORDER).lineWidth(0.75).stroke();
      doc.font('latin').fontSize(7.5).fillColor(MUTED)
        .text('PAN NO.', left + pageW - boxW + 6, boxY + 4);
      doc.font('latin-bold').fontSize(10).fillColor(INK)
        .text(tenant.panNumber, left + pageW - boxW + 6, boxY + 12);
    }
    if (tenant.registrationNumber) {
      doc.font('latin').fontSize(7.5).fillColor(MUTED)
        .text(`Reg. No. ${tenant.registrationNumber}`, left, doc.y);
    }

    doc.moveDown(0.6);
    doc.moveTo(left, doc.y).lineTo(left + pageW, doc.y).strokeColor(PRIMARY).lineWidth(1.5).stroke();
    doc.moveDown(0.4);
    doc.font('latin-bold').fontSize(15).fillColor(INK).text('INVOICE', left, doc.y, { align: 'center', width: pageW });
    doc.moveDown(0.5);
  }

  private renderInvoiceMeta(
    doc: PDFKit.PDFDocument,
    tenant: BillPdfTenant,
    inv: BillPdfInvoice,
    left: number,
    pageW: number,
  ) {
    const y = doc.y;
    const colW = pageW / 2;
    const field = (label: string, value: string, x: number, fy: number) => {
      doc.font('latin').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x, fy);
      doc.font(pickFont(value, true)).fontSize(10).fillColor(INK).text(value || '—', x, fy + 10);
    };
    field('Invoice No.', inv.invoiceNumber, left, y);
    field('Student', inv.studentName, left + colW, y);
    field('Class', inv.className, left, y + 30);
    field('Installment', `${BS_MONTH_NAMES_EN[inv.bsMonth - 1]} ${inv.bsYear}`, left + colW, y + 30);
    field('Issue Date', `${inv.issueDateAd} AD  (${inv.issueDateBs} BS)`, left, y + 60);
    field('Due Date', `${inv.dueDateAd} AD  (${inv.dueDateBs} BS)`, left + colW, y + 60);
    doc.y = y + 94;
  }

  private renderItemsTable(doc: PDFKit.PDFDocument, items: BillPdfLineItem[], left: number, pageW: number) {
    const cols = [
      { key: 'name', label: 'Fee Head', w: 0.30, align: 'left' as const },
      { key: 'gross', label: 'Gross', w: 0.14, align: 'right' as const },
      { key: 'concession', label: 'Concession', w: 0.14, align: 'right' as const },
      { key: 'nonTaxable', label: 'Non-Taxable', w: 0.14, align: 'right' as const },
      { key: 'taxable', label: 'Taxable', w: 0.14, align: 'right' as const },
      { key: 'total', label: 'Total', w: 0.14, align: 'right' as const },
    ];
    const xs: number[] = [];
    let acc = left;
    for (const c of cols) { xs.push(acc); acc += c.w * pageW; }

    const hy = doc.y;
    doc.font('latin-bold').fontSize(8).fillColor(MUTED);
    cols.forEach((c, i) => doc.text(c.label, xs[i] + 2, hy, { width: c.w * pageW - 4, align: c.align }));
    doc.y = hy + 13;
    doc.moveTo(left, doc.y - 2).lineTo(left + pageW, doc.y - 2).strokeColor(BORDER).lineWidth(0.5).stroke();

    for (const item of items) {
      if (doc.y > doc.page.height - 100) doc.addPage();
      const totalConcession = item.concessionAmount + item.apportionedConcession;
      const net = item.grossAmount - totalConcession;
      const nonTaxable = item.isTaxable ? 0 : net;
      const taxable = item.isTaxable ? net : 0;
      const ry = doc.y + 2;
      doc.font(pickFont(item.itemName)).fontSize(9).fillColor(INK)
        .text(item.itemName, xs[0] + 2, ry, { width: cols[0].w * pageW - 4, align: 'left' });
      const cells = [money(item.grossAmount), money(totalConcession), money(nonTaxable), money(taxable), money(net)];
      doc.font('latin').fontSize(9).fillColor(INK);
      cells.forEach((val, i) => {
        const ci = i + 1;
        doc.text(val, xs[ci] + 2, ry, { width: cols[ci].w * pageW - 4, align: cols[ci].align });
      });
      doc.y = ry + 13;
    }
    doc.moveTo(left, doc.y).lineTo(left + pageW, doc.y).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.moveDown(0.6);
  }

  private renderSummary(
    doc: PDFKit.PDFDocument,
    inv: BillPdfInvoice,
    wholeBillConcession: number,
    left: number,
    pageW: number,
  ) {
    if (doc.y > doc.page.height - 180) doc.addPage();
    const summaryW = pageW * 0.6;
    const summaryX = left + pageW - summaryW;
    const labelW = summaryW * 0.65;
    const valueW = summaryW * 0.35;
    // Fixed row height assumes every label fits on one line at this width —
    // true for this phase's known, bounded label set ("Less: Scholarship/
    // Discount" is the longest). A future label that doesn't fit needs a
    // real measured-height row, not a wider guess here.
    const row = (label: string, value: string, bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'latin-bold' : 'latin').fontSize(bold ? 10.5 : 9.5).fillColor(bold ? PRIMARY : INK)
        .text(label, summaryX, y, { width: labelW, align: 'left' });
      doc.font(bold ? 'latin-bold' : 'latin').fontSize(bold ? 10.5 : 9.5).fillColor(bold ? PRIMARY : INK)
        .text(value, summaryX + labelW, y, { width: valueW, align: 'right' });
      doc.y = y + (bold ? 16 : 14);
    };

    if (wholeBillConcession > 0) {
      row('Less: Scholarship/Discount', `(${money(wholeBillConcession)})`);
    }
    if (inv.taxRate != null) {
      row(`Tax (${inv.taxRate}%)`, money(inv.taxAmount));
    }
    row('Grand Total', money(inv.netAmount), true);

    const prevAbs = Math.abs(inv.previousBalance);
    if (prevAbs > 0) {
      const label = inv.previousBalance > 0 ? 'Previous Balance (Dr)' : 'Previous Balance (Cr)';
      row(label, money(prevAbs));
    }

    doc.moveTo(summaryX, doc.y).lineTo(left + pageW, doc.y).strokeColor(PRIMARY).lineWidth(1).stroke();
    doc.y += 4;
    row('Total Receivable', money(inv.totalReceivable), true);
    doc.moveDown(0.8);
  }

  private renderAmountInWords(doc: PDFKit.PDFDocument, amountInWordsEn: string | null, left: number, pageW: number) {
    if (!amountInWordsEn) return;
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.font('latin').fontSize(8).fillColor(MUTED).text('AMOUNT IN WORDS', left, doc.y);
    doc.font('latin-bold').fontSize(9.5).fillColor(INK)
      .text(`${amountInWordsEn} only`, left, doc.y + 10, { width: pageW });
    doc.y += 30;
  }

  private renderFooter(doc: PDFKit.PDFDocument, tenant: BillPdfTenant, left: number, pageW: number) {
    if (doc.y > doc.page.height - 120) doc.addPage();
    const y = doc.y;

    if (tenant.paymentInstructions || tenant.qrImageBuffer) {
      const qrSize = 70;
      if (tenant.qrImageBuffer) {
        try {
          doc.image(tenant.qrImageBuffer, left, y, { fit: [qrSize, qrSize] });
        } catch {
          // Corrupt QR bytes never block bill generation.
        }
      }
      if (tenant.paymentInstructions) {
        const textX = tenant.qrImageBuffer ? left + qrSize + 10 : left;
        doc.font('latin').fontSize(8).fillColor(MUTED).text('PAYMENT INSTRUCTIONS', textX, y);
        doc.font('latin').fontSize(8.5).fillColor(INK)
          .text(tenant.paymentInstructions, textX, y + 10, { width: pageW - (textX - left) });
      }
    }

    const sigY = y + 90;
    const sigW = 180;
    const sigX = left + pageW - sigW;
    if (tenant.schoolStampBuffer) {
      try {
        doc.image(tenant.schoolStampBuffer, sigX + sigW - 60, sigY - 40, { fit: [55, 55] });
      } catch {
        // ignore
      }
    }
    if (tenant.principalSignatureBuffer) {
      try {
        doc.image(tenant.principalSignatureBuffer, sigX, sigY - 30, { fit: [sigW, 30] });
      } catch {
        // ignore
      }
    }
    doc.moveTo(sigX, sigY).lineTo(sigX + sigW, sigY).strokeColor(BORDER).lineWidth(0.75).stroke();
    doc.font('latin').fontSize(8.5).fillColor(INK)
      .text(`For: ${tenant.name}`, sigX, sigY + 4, { width: sigW, align: 'center' });
    if (tenant.principalName) {
      doc.font('latin').fontSize(7.5).fillColor(MUTED)
        .text(tenant.principalName, sigX, sigY + 16, { width: sigW, align: 'center' });
    }
    doc.y = sigY + 30;
  }
}
