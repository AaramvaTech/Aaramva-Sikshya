import { Injectable } from '@nestjs/common';
import { PublicPrismaService } from '../super-admin/public-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { StorageService } from '../storage/storage.service';
import { fetchImageBuffer } from '../branding/branding-color.service';
import { Role } from '../common/enums/role.enum';
import { Money } from '../../common/money/money';
import { amountInWords } from '../../common/money/amount-in-words';
import { resolveBillBrandColor } from '../../common/tenant-brand-color';
import { PrintLanguage, resolvePrintLanguage } from './bill-print-labels';
import { BillInvoiceService } from './bill-invoice.service';
import { BillInvoiceResponseDto } from './entities/bill-invoice.entity';
import { apportionWholeBillConcession } from './bill-pdf.util';
import { BillPdfService, BillPdfData, BillPdfLineItem } from './bill-pdf.service';
import { bsOf } from './ledger.util';

interface TenantHeaderRow {
  name: string;
  logo_url: string | null;
  pan_number: string | null;
  registration_number: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  tagline: string | null;
  payment_instructions: string | null;
  qr_image_url: string | null;
  principal_name: string | null;
  principal_signature_url: string | null;
  school_stamp_url: string | null;
  brand_color: string | null;
  print_language: string | null;
}

const TENANT_HEADER_SELECT = `name, "logoUrl" AS logo_url,
  "panNumber" AS pan_number, "registrationNumber" AS registration_number,
  address, phone, website, tagline,
  "paymentInstructions" AS payment_instructions, "qrImageUrl" AS qr_image_url,
  "principalName" AS principal_name,
  "principalSignatureUrl" AS principal_signature_url,
  "schoolStampUrl" AS school_stamp_url,
  "brandColor" AS brand_color,
  "printLanguage" AS print_language`;

/**
 * BILL-8 Checkpoint A orchestration: fetch (with the same PARENT hard-scope
 * BillInvoiceService.findOne already enforces), apply the §2 footing fix,
 * render via BillPdfService, and store/presign. B8-11: the PDF is an
 * IMMUTABLE artifact at a deterministic key — a second call for the same
 * invoice returns the SAME stored object (byte-identical reprint, B8-3),
 * never a fresh render, so a live tax-rate change after generation can never
 * retroactively affect an already-issued bill.
 */
@Injectable()
export class BillDocumentService {
  constructor(
    private readonly billInvoiceService: BillInvoiceService,
    private readonly publicPrisma: PublicPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storageService: StorageService,
    private readonly billPdfService: BillPdfService,
  ) {}

  private keyFor(slug: string, invoiceId: string, language: string): string {
    // B8-11: ref id + generation version. Always v1 within a checkpoint — an
    // immutable invoice is only ever rendered once per version. Language is
    // part of the key (not the version) — EN/NE/BOTH are genuinely
    // different documents, each its own immutable cached artifact; a staff
    // override never overwrites the tenant-default version.
    return `tenant_${slug}/bill-pdf/${invoiceId}-v1-${language}.pdf`;
  }

  async getOrGenerateBillPdf(
    invoiceId: string,
    callerId?: string,
    callerRole?: Role,
    /** B8-5 §5: staff-only query override — BillPdfController must not pass
     *  this through for a PARENT caller. */
    languageOverride?: string,
  ): Promise<{ presignedUrl: string; generated: boolean }> {
    // Scoping (PARENT -> own child only, 404/403 as BillInvoiceService already
    // enforces) happens here, BEFORE anything storage-related — same
    // discipline as the assignment-submission presign (EDU-1).
    const invoice = await this.billInvoiceService.findOne(invoiceId, callerId, callerRole);
    const { slug } = this.tenantContext.getOrThrow();
    const tenant = await this.loadTenantHeader();
    const language = resolvePrintLanguage(tenant.print_language, languageOverride);
    const key = this.keyFor(slug, invoiceId, language);

    const existing = await this.storageService.headObject(key);
    if (existing) {
      return { presignedUrl: await this.storageService.presignRead(key), generated: false };
    }

    const pdfData = await this.buildPdfData(invoice, tenant, language);
    const buffer = await this.billPdfService.render(pdfData);
    await this.storageService.putObject(key, buffer, 'application/pdf');
    return { presignedUrl: await this.storageService.presignRead(key), generated: true };
  }

  private async loadTenantHeader(): Promise<TenantHeaderRow> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.publicPrisma.query<TenantHeaderRow>(
      `SELECT ${TENANT_HEADER_SELECT} FROM tenants WHERE id = $1`,
      tenantId,
    );
    return rows[0];
  }

  private async buildPdfData(
    invoice: BillInvoiceResponseDto,
    tenant: TenantHeaderRow,
    language: PrintLanguage,
  ): Promise<BillPdfData> {
    const items = invoice.items ?? [];

    // §2 footing fix: the whole-bill (fee_head_id NULL) concession is never
    // attributed to any stored item — it's the header total minus what's
    // already itemized. Apportion it across every line (incl. transport) by
    // gross share, render-time only.
    const itemConcessionSum = items.reduce(
      (acc, i) => acc.add(Money.fromNumber(i.concessionAmount)), Money.zero(),
    );
    const wholeBillConcession = Money.fromNumber(invoice.concessionAmount).sub(itemConcessionSum);
    const apportioned = apportionWholeBillConcession(
      items.map((i) => ({ grossAmount: Money.fromNumber(i.grossAmount) })),
      wholeBillConcession,
    );

    const lineItems: BillPdfLineItem[] = items.map((i, idx) => ({
      itemName: i.itemName,
      grossAmount: i.grossAmount,
      concessionAmount: i.concessionAmount,
      apportionedConcession: apportioned[idx].toNumber(),
      isTaxable: i.isTaxable,
    }));

    // Private-kind storage keys (signature/stamp/QR) fetched via getObjectBuffer;
    // the logo is the one public-read kind and stores a full URL (fetched over
    // HTTP, same pattern branding-color.service.ts already uses).
    const [logoBuffer, qrImageBuffer, principalSignatureBuffer, schoolStampBuffer] = await Promise.all([
      tenant.logo_url ? fetchImageBuffer(tenant.logo_url) : Promise.resolve(null),
      tenant.qr_image_url ? this.storageService.getObjectBuffer(tenant.qr_image_url) : Promise.resolve(null),
      tenant.principal_signature_url
        ? this.storageService.getObjectBuffer(tenant.principal_signature_url) : Promise.resolve(null),
      tenant.school_stamp_url
        ? this.storageService.getObjectBuffer(tenant.school_stamp_url) : Promise.resolve(null),
    ]);

    // No accent color is hardcoded in the drawing code — it's a parameter,
    // resolved here from the tenant's own curated-set value (or slate).
    const { color: accentColor, tint: accentTint } = resolveBillBrandColor(tenant.brand_color);

    return {
      tenant: {
        name: tenant.name,
        logoBuffer,
        panNumber: tenant.pan_number,
        registrationNumber: tenant.registration_number,
        address: tenant.address,
        phone: tenant.phone,
        website: tenant.website,
        tagline: tenant.tagline,
        paymentInstructions: tenant.payment_instructions,
        qrImageBuffer,
        principalName: tenant.principal_name,
        principalSignatureBuffer,
        schoolStampBuffer,
        accentColor,
        accentTint,
      },
      invoice: {
        invoiceNumber: invoice.invoiceNumber ?? '—',
        studentName: invoice.studentName ?? '—',
        admissionNumber: invoice.admissionNumber ?? null,
        className: invoice.className ?? '—',
        bsYear: invoice.bsYear,
        bsMonth: invoice.bsMonth,
        issueDateAd: invoice.issueDate,
        issueDateBs: this.formatBsDate(invoice.issueDate),
        dueDateAd: invoice.dueDate,
        dueDateBs: this.formatBsDate(invoice.dueDate),
        taxRate: invoice.taxRate,
        taxAmount: invoice.taxAmount,
        netAmount: invoice.netAmount,
        previousBalance: invoice.previousBalance,
        totalReceivable: invoice.totalReceivable,
        // BILL-8-BUG-1 follow-up: computed from the invoice's own frozen
        // total_receivable — the same snapshotted-at-post-time field §2's
        // footing fix already trusts — never from the stored
        // amount_in_words_en/ne column, which can carry a stale pre-fix
        // value (or any future drift) that the printed figures no longer
        // agree with. This is a render-time derivation matching §2's own
        // "compute from immutable snapshot data, never trust/mutate the
        // stored row" pattern, NOT a live balance lookup — a reprint next
        // fiscal year still shows the words as posted, since
        // total_receivable itself never changes after posting.
        amountInWordsEn: amountInWords(Money.fromNumber(invoice.totalReceivable), 'en'),
        // Computed the same way regardless of language — harmless to
        // compute even in EN mode; the renderer only ever prints it when
        // `language` says to. Real correctness (native-speaker review) is
        // what the render-time gate resolution above is protecting.
        amountInWordsNe: amountInWords(Money.fromNumber(invoice.totalReceivable), 'ne'),
      },
      items: lineItems,
      language,
    };
  }

  private formatBsDate(adDateString: string): string {
    const bs = bsOf(adDateString);
    return `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`;
  }
}
