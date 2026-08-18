import { Injectable, Logger } from '@nestjs/common';
import { PublicPrismaService } from '../super-admin/public-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { StorageService } from '../storage/storage.service';
import { fetchImageBuffer } from '../branding/branding-color.service';
import { Role } from '../common/enums/role.enum';
import { Money } from '../../common/money/money';
import { amountInWords } from '../../common/money/amount-in-words';
import { PrintLanguage, resolvePrintLanguage } from './bill-print-labels';
import { BillInvoiceService } from './bill-invoice.service';
import { BillInvoiceResponseDto } from './entities/bill-invoice.entity';
import { apportionWholeBillConcession } from './bill-pdf.util';
import { fiscalYearLabel } from './bill-post.util';
import { BS_MONTH_NAMES_EN } from 'bs-calendar';
import { BillPdfService, BillPdfData, BillPdfLineItem } from './bill-pdf.service';
import { bsOf } from './ledger.util';

export interface TenantHeaderRow {
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

export const TENANT_HEADER_SELECT = `name, "logoUrl" AS logo_url,
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
  private readonly logger = new Logger(BillDocumentService.name);

  constructor(
    private readonly billInvoiceService: BillInvoiceService,
    private readonly publicPrisma: PublicPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storageService: StorageService,
    private readonly billPdfService: BillPdfService,
  ) {}

  private keyFor(slug: string, invoiceId: string, language: string): string {
    // B8-11: ref id + generation version. Language is part of the key (not
    // the version) — EN/NE/BOTH are genuinely different documents, each its
    // own immutable cached artifact; a staff override never overwrites the
    // tenant-default version.
    //
    // BILL-PRINT-1 bumped v1 -> v2: the A5 stationery is a different artifact
    // from BILL-8's single-A4 layout. v1 objects are deliberately NOT
    // backfilled — an already-issued document stays as issued. CONSEQUENCE,
    // documented rather than discovered in support: reprinting a pre-cutover
    // invoice returns the OLD design, which will be reported as broken at
    // least once. A forced-regenerate path is out of scope here.
    return `tenant_${slug}/bill-pdf/${invoiceId}-v2-${language}.pdf`;
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

  /** Public: BILL-8 Checkpoint C's BillPrintRunnerService loads the tenant
   *  header once per bulk-print job and reuses it across every invoice in
   *  the job (a job is always single-tenant), instead of refetching it once
   *  per invoice the way the single-document path implicitly does. */
  async loadTenantHeader(): Promise<TenantHeaderRow> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.publicPrisma.query<TenantHeaderRow>(
      `SELECT ${TENANT_HEADER_SELECT} FROM tenants WHERE id = $1`,
      tenantId,
    );
    return rows[0];
  }

  /** Public for the same Checkpoint C reuse reason as loadTenantHeader. */
  async buildPdfData(
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

    // BILL-PRINT-1: EVERY asset fetch here is best-effort. A print job must
    // never fail because a decorative asset could not load, and this is the
    // exact path where FILE-1-BLOB bites: a tenant whose principalSignatureUrl
    // still holds a legacy `data:image/...;base64` URI makes getObjectBuffer
    // throw XMinioInvalidResourceName, which previously took the whole bill
    // print down with it. Swallowing to null here means such a tenant prints a
    // correct bill with a blank signing space — the design's own fallback —
    // instead of no bill at all.
    //
    // FILE-1-BLOB itself is NOT fixed by this: the column still holds a bad
    // value and every other reader still trips on it. It stays its own ticket.
    //
    // The logo is the one public-read kind and stores a full URL (fetched over
    // HTTP, same pattern branding-color.service.ts already uses).
    const [logoBuffer, qrImageBuffer, principalSignatureBuffer, schoolStampBuffer] = await Promise.all([
      this.optionalAsset('logo', tenant.logo_url, (u) => fetchImageBuffer(u)),
      this.optionalAsset('payment-QR', tenant.qr_image_url, (k) => this.storageService.getObjectBuffer(k)),
      this.optionalAsset('principal-signature', tenant.principal_signature_url,
        (k) => this.storageService.getObjectBuffer(k)),
      this.optionalAsset('school-stamp', tenant.school_stamp_url,
        (k) => this.storageService.getObjectBuffer(k)),
    ]);

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
      },
      invoice: {
        invoiceNumber: invoice.invoiceNumber ?? '—',
        studentName: invoice.studentName ?? '—',
        admissionNumber: invoice.admissionNumber ?? null,
        className: invoice.className ?? '—',
        // BILL-PRINT-1 party block + the identity row's FY / Installment.
        sectionName: invoice.sectionName ?? null,
        rollNumber: invoice.rollNumber ?? null,
        guardianName: invoice.guardianName ?? null,
        fiscalYear: fiscalYearLabel(invoice.bsYear, invoice.bsMonth),
        installment: `${BS_MONTH_NAMES_EN[invoice.bsMonth - 1]} ${invoice.bsYear}`,
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

  /**
   * Loads one optional print asset, resolving to null on ANY failure — bad or
   * malformed URL/key, storage error, timeout, unsupported bytes. Never throws.
   */
  private async optionalAsset(
    kind: string,
    ref: string | null,
    load: (ref: string) => Promise<Buffer | null>,
  ): Promise<Buffer | null> {
    if (!ref) return null;
    try {
      const buf = await load(ref);
      if (!buf) {
        // A configured asset that resolves to nothing — StorageService returns
        // null (it does not throw) when the object is simply absent. That is
        // the likeliest real "my stamp stopped appearing" case, so it gets the
        // same visibility as a hard failure.
        this.logger.warn(`[BILL-PRINT-1] ${kind} asset not found in storage, printing without it: ${ref.slice(0, 60)}`);
      }
      return buf;
    } catch (err) {
      // Swallowed so the bill still prints — but NOT silently. A school whose
      // stamp quietly stopped appearing would otherwise have no signal at all,
      // and "the print succeeded" must not mean "nobody can tell what broke".
      // The ref is logged truncated: a FILE-1-BLOB value is a 300KB data: URI.
      this.logger.warn(
        `[BILL-PRINT-1] ${kind} asset unavailable, printing without it: ` +
        `${ref.slice(0, 60)}${ref.length > 60 ? `… (${ref.length} chars)` : ''} — ${(err as Error).message}`,
      );
      return null;
    }
  }

  private formatBsDate(adDateString: string): string {
    const bs = bsOf(adDateString);
    return `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`;
  }
}
