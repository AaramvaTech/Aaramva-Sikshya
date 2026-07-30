import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { loadPdfFonts, pickFont, drawMixedText } from '../../common/pdf/pdf-fonts';
import { BS_MONTH_NAMES_EN } from 'bs-calendar';
import { Money } from '../../common/money/money';
import { printLabel, PrintLanguage } from './bill-print-labels';

const MUTED = '#6b7280';
const INK = '#111827';
const AMBER = '#c0703a';
/** Warm off-white panel background — the neutral surface everywhere the
 *  accent is NOT used, per the reviewed design's "one accent used
 *  purposefully" rule. */
const WARM_PANEL = '#f7f5f0';
const HAIRLINE = '#e5e2da';

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
  /** BILL-8: per-tenant billing accent — resolved (curated-set + default
   *  fallback) by BillDocumentService. NOT hardcoded here — every accent
   *  use in this file reads it from this parameter. */
  accentColor: string;
  accentTint: string;
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
  /** BILL-8 B8-6: computed the same render-time way as amountInWordsEn
   *  (from the frozen total_receivable) — only ever actually printed when
   *  the review gate is open (BillDocumentService resolves `language`
   *  accordingly; this field is harmless to compute either way). */
  amountInWordsNe: string | null;
}

export interface BillPdfData {
  tenant: BillPdfTenant;
  invoice: BillPdfInvoice;
  items: BillPdfLineItem[];
  /** BILL-8 B8-5: resolved by BillDocumentService (tenant default + gate +
   *  optional staff override) — the renderer trusts it as-is, it does not
   *  re-check the gate itself. */
  language: PrintLanguage;
}

/** Plain lakh-grouped number, no currency prefix — used everywhere except
 *  the final Total Receivable figure (design: "Rs." appears once). Numerals
 *  stay Arabic regardless of language, per the I18N-1 mobile precedent. */
const num = (n: number): string => Money.fromNumber(n).toDisplay();
const money = (n: number): string => `Rs. ${num(n)}`;

/**
 * BILL-8 Checkpoint A/B — A4 bill. Pure renderer: takes already-fetched,
 * already-footed, already-colored, already-language-resolved data and
 * produces PDF bytes only — same discipline as examination/pdf.service.ts.
 * Footing/snapshot/reprint/amount-in-words logic all live in
 * BillDocumentService and are untouched by this file.
 *
 * Every fixed label routes through printLabel(key, data.language) — never a
 * hardcoded English string — and every text draw uses pickFont() (not a
 * hardcoded 'latin') so a Nepali label or amount-in-words string picks the
 * embedded Devanagari font automatically, same auto-detection
 * examination/pdf.service.ts already established for report cards.
 *
 * Accent is used in exactly four places: the header rule, the logo tile
 * background (pale tint), the invoice-number text, and the Total
 * Receivable pill. Everywhere else is warm neutral.
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
      const GAP = 24;
      const { accentColor, accentTint } = data.tenant;
      const lang = data.language;

      this.renderHeader(doc, data.tenant, left, pageW, accentColor, accentTint, lang);
      doc.y += GAP;
      this.renderInvoiceTitleRow(doc, data.invoice, left, pageW, accentColor, lang);
      doc.y += GAP;
      this.renderMetaPanel(doc, data.invoice, left, pageW, lang);
      doc.y += GAP;
      this.renderItemsTable(doc, data.items, left, pageW, lang);
      doc.y += GAP;
      const wholeBillConcession = data.items.reduce((acc, i) => acc + i.apportionedConcession, 0);
      this.renderBottomSplit(doc, data, wholeBillConcession, left, pageW, accentColor, lang);
      doc.y += GAP * 0.8;
      this.renderSignature(doc, data.tenant, left, pageW, lang);

      doc.end();
    });
  }

  private label(key: Parameters<typeof printLabel>[0], lang: PrintLanguage): string {
    return printLabel(key, lang);
  }

  private renderHeader(
    doc: PDFKit.PDFDocument, tenant: BillPdfTenant, left: number, pageW: number,
    accentColor: string, accentTint: string, lang: PrintLanguage,
  ) {
    const top = doc.y;
    const tileSize = 46;
    const radius = 10;
    if (tenant.logoBuffer) {
      doc.roundedRect(left, top, tileSize, tileSize, radius).fill(accentTint);
      try {
        doc.save();
        doc.roundedRect(left, top, tileSize, tileSize, radius).clip();
        doc.image(tenant.logoBuffer, left, top, { fit: [tileSize, tileSize], align: 'center', valign: 'center' });
        doc.restore();
      } catch {
        // Corrupt/unsupported logo bytes must never break bill generation —
        // the tinted tile still rendered above, just without an image in it.
        doc.restore();
      }
    }
    // Collapse the reserved space entirely when there's no logo — never a gap.
    const textX = tenant.logoBuffer ? left + tileSize + 14 : left;
    const panBoxW = 150;
    const textW = pageW - (textX - left) - panBoxW - 14;

    doc.font(pickFont(tenant.name, true)).fontSize(19).fillColor(accentColor)
      .text(tenant.name, textX, top + 2, { width: textW });
    if (tenant.tagline) {
      doc.font(pickFont(tenant.tagline)).fontSize(10).fillColor(MUTED)
        .text(tenant.tagline, textX, doc.y + 2, { width: textW });
    }
    // Mixed script: address is free tenant-entered text (could be either
    // script) joined with phone/website (always Latin/numeric) — same
    // audit as the signature line, fixed the same way rather than
    // assuming one font for the whole joined line.
    const contactParts = [tenant.address, tenant.phone, tenant.website].filter((p): p is string => !!p);
    if (contactParts.length > 0) {
      const contactRuns = contactParts.flatMap((part, i) => (i > 0 ? [{ text: '   ·   ' }, { text: part }] : [{ text: part }]));
      const contactW = pageW - (textX - left);
      drawMixedText(doc, contactRuns, textX, doc.y + 2, { width: contactW, align: 'left', fontSize: 8.5, color: MUTED });
    }
    const textBottom = doc.y;

    // PAN + reg — top-right, small, dark values, no border this round.
    let panBottom = top;
    if (tenant.panNumber) {
      const panLabel = this.label('panNo', lang);
      doc.font(pickFont(panLabel)).fontSize(7.5).fillColor(MUTED)
        .text(panLabel, left + pageW - panBoxW, top, { width: panBoxW, align: 'right' });
      doc.font('latin-bold').fontSize(10.5).fillColor(INK)
        .text(tenant.panNumber, left + pageW - panBoxW, top + 11, { width: panBoxW, align: 'right' });
      panBottom = top + 26;
    }
    if (tenant.registrationNumber) {
      const regLabel = this.label('regNo', lang);
      // Mixed script: regLabel may be Devanagari, registrationNumber is
      // whatever the school entered (always Latin in practice) — a single
      // pickFont() on the concatenated string tofu'd whichever script it
      // didn't cover. drawMixedText font-picks each run independently.
      drawMixedText(doc, [{ text: `${regLabel} ` }, { text: tenant.registrationNumber }],
        left + pageW - panBoxW, panBottom + 4, { width: panBoxW, align: 'right', fontSize: 7.5, color: MUTED });
      panBottom += 14;
    }

    doc.y = Math.max(textBottom, panBottom, top + tileSize) + 10;
    doc.moveTo(left, doc.y).lineTo(left + pageW, doc.y).strokeColor(accentColor).lineWidth(2).stroke();
  }

  private renderInvoiceTitleRow(
    doc: PDFKit.PDFDocument, inv: BillPdfInvoice, left: number, pageW: number, accentColor: string, lang: PrintLanguage,
  ) {
    const y = doc.y;
    const titleLabel = this.label('invoice', lang);
    doc.font(pickFont(titleLabel, true)).fontSize(20).fillColor(INK).text(titleLabel, left, y);
    doc.font(pickFont(inv.invoiceNumber, true)).fontSize(11).fillColor(accentColor)
      .text(inv.invoiceNumber, left, y + 26);

    const issuedLabel = this.label('issued', lang);
    const dueLabel = this.label('due', lang);
    const dateW = pageW * 0.4;
    const dateX = left + pageW - dateW;
    doc.font(pickFont(issuedLabel)).fontSize(7.5).fillColor(MUTED)
      .text(issuedLabel, dateX, y, { width: dateW, align: 'right' });
    doc.font('latin').fontSize(9.5).fillColor(INK)
      .text(`${inv.issueDateAd}  (${inv.issueDateBs} BS)`, dateX, y + 10, { width: dateW, align: 'right' });
    doc.font(pickFont(dueLabel)).fontSize(7.5).fillColor(MUTED)
      .text(dueLabel, dateX, y + 26, { width: dateW, align: 'right' });
    doc.font('latin').fontSize(9.5).fillColor(INK)
      .text(`${inv.dueDateAd}  (${inv.dueDateBs} BS)`, dateX, y + 36, { width: dateW, align: 'right' });

    doc.y = y + 50;
  }

  private renderMetaPanel(doc: PDFKit.PDFDocument, inv: BillPdfInvoice, left: number, pageW: number, lang: PrintLanguage) {
    const y = doc.y;
    const panelH = 62;
    doc.roundedRect(left, y, pageW, panelH, 8).fill(WARM_PANEL);

    const cols = [
      { label: this.label('student', lang), value: inv.studentName },
      { label: this.label('class', lang), value: inv.className },
      { label: this.label('installment', lang), value: `${BS_MONTH_NAMES_EN[inv.bsMonth - 1]} ${inv.bsYear}` },
    ];
    const colW = pageW / 3;
    cols.forEach((c, i) => {
      const x = left + i * colW + 18;
      doc.font(pickFont(c.label)).fontSize(7.5).fillColor(MUTED).text(c.label.toUpperCase(), x, y + 16, { width: colW - 30 });
      doc.font(pickFont(c.value, true)).fontSize(11).fillColor(INK).text(c.value || '—', x, y + 28, { width: colW - 30 });
    });

    doc.y = y + panelH;
  }

  private renderItemsTable(doc: PDFKit.PDFDocument, items: BillPdfLineItem[], left: number, pageW: number, lang: PrintLanguage) {
    const cols = [
      { label: this.label('feeHead', lang), w: 0.30, align: 'left' as const },
      { label: this.label('gross', lang), w: 0.14, align: 'right' as const },
      { label: this.label('concession', lang), w: 0.14, align: 'right' as const },
      { label: this.label('nonTaxable', lang), w: 0.14, align: 'right' as const },
      { label: this.label('taxable', lang), w: 0.14, align: 'right' as const },
      { label: this.label('total', lang), w: 0.14, align: 'right' as const },
    ];
    const xs: number[] = [];
    let acc = left;
    for (const c of cols) { xs.push(acc); acc += c.w * pageW; }

    const headerY = doc.y;
    doc.fontSize(7.5).fillColor(MUTED);
    cols.forEach((c, i) => {
      doc.font(pickFont(c.label)).text(c.label.toUpperCase(), xs[i] + 4, headerY, { width: c.w * pageW - 8, align: c.align });
    });
    doc.y = headerY + 16;

    const rowH = 26;
    items.forEach((item) => {
      if (doc.y > doc.page.height - 100) doc.addPage();
      const totalConcession = item.concessionAmount + item.apportionedConcession;
      const net = item.grossAmount - totalConcession;
      const nonTaxable = item.isTaxable ? 0 : net;
      const taxable = item.isTaxable ? net : 0;
      const rowY = doc.y;
      // Hairline above each row (including the first, under the header labels).
      doc.moveTo(left, rowY).lineTo(left + pageW, rowY).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
      const textY = rowY + 8;
      doc.font(pickFont(item.itemName, true)).fontSize(9.5).fillColor(INK)
        .text(item.itemName, xs[0] + 4, textY, { width: cols[0].w * pageW - 8, align: 'left' });
      doc.font('latin').fontSize(9.5).fillColor(INK)
        .text(num(item.grossAmount), xs[1] + 4, textY, { width: cols[1].w * pageW - 8, align: 'right' });
      doc.fillColor(totalConcession > 0 ? AMBER : INK)
        .text(totalConcession > 0 ? `-${num(totalConcession)}` : num(totalConcession),
          xs[2] + 4, textY, { width: cols[2].w * pageW - 8, align: 'right' });
      doc.font('latin').fillColor(INK)
        .text(num(nonTaxable), xs[3] + 4, textY, { width: cols[3].w * pageW - 8, align: 'right' })
        .text(num(taxable), xs[4] + 4, textY, { width: cols[4].w * pageW - 8, align: 'right' });
      // Total column — medium weight, per the reviewed design.
      doc.font('latin-bold').fillColor(INK)
        .text(num(net), xs[5] + 4, textY, { width: cols[5].w * pageW - 8, align: 'right' });
      doc.y = rowY + rowH;
    });
    doc.moveTo(left, doc.y).lineTo(left + pageW, doc.y).strokeColor(HAIRLINE).lineWidth(0.5).stroke();
  }

  private renderBottomSplit(
    doc: PDFKit.PDFDocument,
    data: BillPdfData,
    wholeBillConcession: number,
    left: number,
    pageW: number,
    accentColor: string,
    lang: PrintLanguage,
  ) {
    if (doc.y > doc.page.height - 220) doc.addPage();
    const { invoice: inv, tenant } = data;
    const totalsW = 220;
    const totalsX = left + pageW - totalsW;
    const leftColW = pageW - totalsW - 24;
    const top = doc.y;

    // ── LEFT: amount in words, QR tile, payment instructions ──────────────
    let ly = top;
    const wordsLines = [
      lang !== 'NE' && inv.amountInWordsEn ? `${inv.amountInWordsEn} ${this.label('only', 'EN')}` : null,
      lang !== 'EN' && inv.amountInWordsNe ? `${inv.amountInWordsNe} ${this.label('only', 'NE')}` : null,
    ].filter((l): l is string => l != null);
    if (wordsLines.length > 0) {
      const wordsLabel = this.label('amountInWords', lang);
      doc.font(pickFont(wordsLabel)).fontSize(8).fillColor(MUTED).text(wordsLabel.toUpperCase(), left, ly, { width: leftColW });
      ly += 11;
      for (const line of wordsLines) {
        doc.font(pickFont(line, true)).fontSize(10.5).fillColor(INK).text(line, left, ly, { width: leftColW });
        ly += 15;
      }
      ly += 19;
    }
    const qrSize = 52;
    if (tenant.qrImageBuffer) {
      doc.roundedRect(left, ly, qrSize, qrSize, 6).fill(WARM_PANEL);
      try {
        doc.save();
        doc.roundedRect(left, ly, qrSize, qrSize, 6).clip();
        doc.image(tenant.qrImageBuffer, left, ly, { fit: [qrSize, qrSize], align: 'center', valign: 'center' });
        doc.restore();
      } catch {
        doc.restore();
      }
    }
    if (tenant.paymentInstructions) {
      const textX = tenant.qrImageBuffer ? left + qrSize + 12 : left;
      const textW = leftColW - (textX - left);
      const instrLabel = this.label('paymentInstructions', lang);
      doc.font(pickFont(instrLabel)).fontSize(8).fillColor(MUTED).text(instrLabel.toUpperCase(), textX, ly);
      // Free tenant-entered text — could genuinely be in either script, so
      // this picks dynamically rather than assuming 'latin' (found during
      // the mixed-script audit; not itself a concatenation bug, but the
      // same class of oversight — a hardcoded font on text this codebase
      // doesn't control the script of).
      doc.font(pickFont(tenant.paymentInstructions)).fontSize(8.5).fillColor(INK)
        .text(tenant.paymentInstructions, textX, ly + 11, { width: textW });
    }
    const leftBottom = tenant.qrImageBuffer ? ly + qrSize : ly + 40;

    // ── RIGHT: totals stack + accent-filled Total Receivable pill ─────────
    let ry = top;
    const row = (label: string, value: string, valueColor = INK) => {
      doc.font(pickFont(label)).fontSize(9.5).fillColor(INK).text(label, totalsX, ry, { width: totalsW * 0.55 });
      doc.font('latin').fontSize(9.5).fillColor(valueColor)
        .text(value, totalsX + totalsW * 0.55, ry, { width: totalsW * 0.45, align: 'right' });
      ry += 18;
    };
    // Subtotal = pre-tax net (concessions are already itemized per-line
    // above with the amber minus-sign treatment, so no separate aggregate
    // discount row here).
    row(this.label('subtotal', lang), num(inv.netAmount - inv.taxAmount));
    if (inv.taxRate != null) {
      // The rate% moves into the value slot (already hardcoded 'latin' in
      // row() below, always safe) rather than concatenating it onto the
      // label — the label alone may be Devanagari, and "(13%)" glued onto
      // it would hit the same mixed-script tofu bug drawMixedText exists
      // to fix elsewhere; here it's simpler to just not concatenate.
      row(this.label('tax', lang), `${num(inv.taxAmount)} (${inv.taxRate}%)`);
    }
    const prevAbs = Math.abs(inv.previousBalance);
    if (prevAbs > 0) {
      row(this.label(inv.previousBalance > 0 ? 'previousBalanceDr' : 'previousBalanceCr', lang), num(prevAbs));
    }
    ry += 6;

    const pillH = 44;
    doc.roundedRect(totalsX, ry, totalsW, pillH, pillH / 2).fill(accentColor);
    const totalReceivableLabel = this.label('totalReceivable', lang);
    doc.font(pickFont(totalReceivableLabel)).fontSize(8.5).fillColor('#FFFFFF')
      .text(totalReceivableLabel.toUpperCase(), totalsX + 18, ry + 10, { width: totalsW - 36 });
    doc.font('latin-bold').fontSize(15).fillColor('#FFFFFF')
      .text(money(inv.totalReceivable), totalsX + 18, ry + 22, { width: totalsW - 36 });
    const rightBottom = ry + pillH;

    doc.y = Math.max(leftBottom, rightBottom) + 4;
  }

  private renderSignature(doc: PDFKit.PDFDocument, tenant: BillPdfTenant, left: number, pageW: number, lang: PrintLanguage) {
    if (doc.y > doc.page.height - 90) doc.addPage();
    const sigW = 210;
    const sigX = left + pageW - sigW;
    let imgBottom = doc.y;

    if (tenant.schoolStampBuffer || tenant.principalSignatureBuffer) {
      const imgY = doc.y;
      if (tenant.schoolStampBuffer) {
        try {
          doc.image(tenant.schoolStampBuffer, sigX + sigW - 55, imgY, { fit: [50, 50] });
        } catch {
          // ignore — hairline + text below still render
        }
      }
      if (tenant.principalSignatureBuffer) {
        try {
          doc.image(tenant.principalSignatureBuffer, sigX, imgY + 8, { fit: [sigW - 65, 34] });
        } catch {
          // ignore
        }
      }
      imgBottom = imgY + 54;
    }

    doc.moveTo(sigX, imgBottom).lineTo(sigX + sigW, imgBottom).strokeColor(HAIRLINE).lineWidth(0.75).stroke();
    const forLabel = this.label('forSchool', lang);
    // Mixed script (the reported bug): forLabel may be Devanagari,
    // tenant.name is whatever script the school entered (usually Latin) —
    // drawMixedText font-picks each run independently rather than forcing
    // both through pickFont(forLabel)'s single choice.
    drawMixedText(doc, [{ text: `${forLabel}: ` }, { text: tenant.name }],
      sigX, imgBottom + 6, { width: sigW, align: 'right', fontSize: 9, color: INK });
    if (tenant.principalName) {
      doc.font(pickFont(tenant.principalName)).fontSize(8.5).fillColor(MUTED)
        .text(tenant.principalName, sigX, imgBottom + 19, { width: sigW, align: 'right' });
    }
  }
}
