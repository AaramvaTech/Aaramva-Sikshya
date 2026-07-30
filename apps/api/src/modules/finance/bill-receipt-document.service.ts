import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { PublicPrismaService } from '../super-admin/public-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { StorageService } from '../storage/storage.service';
import { Role } from '../common/enums/role.enum';
import { Money } from '../../common/money/money';
import { amountInWords } from '../../common/money/amount-in-words';
import { BillPaymentService } from './bill-payment.service';
import { resolveBillBrandColor } from '../../common/tenant-brand-color';
import { resolvePrintLanguage } from './bill-print-labels';
import { bsOf } from './ledger.util';
import { BillReceiptService, BillReceiptData } from './bill-receipt.service';

interface TenantReceiptHeaderRow {
  name: string;
  principal_name: string | null;
  brand_color: string | null;
  print_language: string | null;
}

interface StudentRow {
  student_name: string;
  class_name: string | null;
}

interface InvoiceNumberRow {
  id: string;
  invoice_number: string | null;
}

/**
 * BILL-8 Checkpoint B orchestration: mirrors BillDocumentService exactly
 * (fetch with the same PARENT hard-scope BillPaymentService.findOne already
 * enforces, resolve accent + language, render, get-or-generate against a
 * deterministic MinIO key, presign). A second call for the same payment+
 * language returns the same stored object — same B8-3 immutability as the
 * bill.
 */
@Injectable()
export class BillReceiptDocumentService {
  constructor(
    private readonly billPaymentService: BillPaymentService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly publicPrisma: PublicPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storageService: StorageService,
    private readonly billReceiptService: BillReceiptService,
  ) {}

  private keyFor(slug: string, paymentId: string, language: string): string {
    return `tenant_${slug}/bill-receipt/${paymentId}-v1-${language}.pdf`;
  }

  async getOrGenerateReceiptPdf(
    paymentId: string,
    callerId?: string,
    callerRole?: Role,
    languageOverride?: string,
  ): Promise<{ presignedUrl: string; generated: boolean }> {
    // Scoping (PARENT -> own child only) happens here, before anything
    // storage-related — same discipline as the bill endpoint.
    const payment = await this.billPaymentService.findOne(paymentId, callerId, callerRole);
    const { tenantId, slug } = this.tenantContext.getOrThrow();

    const tenantRows = await this.publicPrisma.query<TenantReceiptHeaderRow>(
      `SELECT name, "principalName" AS principal_name, "brandColor" AS brand_color,
              "printLanguage" AS print_language
       FROM tenants WHERE id = $1`,
      tenantId,
    );
    const tenant = tenantRows[0];
    const language = resolvePrintLanguage(tenant.print_language, languageOverride);
    const key = this.keyFor(slug, paymentId, language);

    const existing = await this.storageService.headObject(key);
    if (existing) {
      return { presignedUrl: await this.storageService.presignRead(key), generated: false };
    }

    const pdfData = await this.buildReceiptData(payment, tenant, language);
    const buffer = await this.billReceiptService.render(pdfData);
    await this.storageService.putObject(key, buffer, 'application/pdf');
    return { presignedUrl: await this.storageService.presignRead(key), generated: true };
  }

  private async buildReceiptData(
    payment: Awaited<ReturnType<BillPaymentService['findOne']>>,
    tenant: TenantReceiptHeaderRow,
    language: ReturnType<typeof resolvePrintLanguage>,
  ): Promise<BillReceiptData> {
    const [studentRows, invoiceRows] = await Promise.all([
      this.tenantPrisma.query<StudentRow>(
        `SELECT s.first_name || ' ' || s.last_name AS student_name, c.name AS class_name
         FROM students s LEFT JOIN classes c ON c.id = s.class_id
         WHERE s.id = $1::uuid`,
        payment.studentId,
      ),
      (payment.allocations ?? []).length > 0
        ? this.tenantPrisma.query<InvoiceNumberRow>(
            `SELECT id, invoice_number FROM bill_invoices WHERE id = ANY($1::uuid[])`,
            (payment.allocations ?? []).map((a) => a.billInvoiceId),
          )
        : Promise.resolve([]),
    ]);
    const student = studentRows[0];
    const invoiceNumberById = new Map(invoiceRows.map((r) => [r.id, r.invoice_number ?? '—']));

    const { color: accentColor } = resolveBillBrandColor(tenant.brand_color);
    const bs = bsOf(payment.receivedDate);
    const totalAmount = Money.fromNumber(payment.amount);

    return {
      tenant: {
        name: tenant.name,
        principalName: tenant.principal_name,
        accentColor,
      },
      receiptNumber: payment.receiptNumber,
      receivedDateAd: payment.receivedDate,
      receivedDateBs: `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`,
      studentName: student?.student_name ?? '—',
      className: student?.class_name ?? '—',
      method: payment.method,
      amount: payment.amount,
      allocations: (payment.allocations ?? []).map((a) => ({
        invoiceNumber: invoiceNumberById.get(a.billInvoiceId) ?? '—',
        amount: a.amount,
      })),
      advanceAmount: payment.advanceAmount ?? 0,
      // Same render-time-from-the-frozen-figure discipline as the bill
      // (BILL-8-BUG-1) — computed from this payment's own immutable amount,
      // not a stored/cached column (bill_payments has no amount-in-words
      // column at all; this avoids ever needing one).
      amountInWordsEn: amountInWords(totalAmount, 'en'),
      amountInWordsNe: amountInWords(totalAmount, 'ne'),
      language,
    };
  }
}
