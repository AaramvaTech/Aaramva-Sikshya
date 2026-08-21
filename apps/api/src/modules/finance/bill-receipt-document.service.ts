import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { errorBody } from '../common/errors/error-codes';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { PublicPrismaService } from '../super-admin/public-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { StorageService } from '../storage/storage.service';
import { fetchImageBuffer } from '../branding/branding-color.service';
import { Role } from '../common/enums/role.enum';
import { toMoney } from './entities/finance.entity';
import { Money } from '../../common/money/money';
import { amountInWords } from '../../common/money/amount-in-words';
import { BillPaymentService } from './bill-payment.service';
import { resolveBillBrandColor } from '../../common/tenant-brand-color';
import { resolvePrintLanguage } from './bill-print-labels';
import { bsOf, balanceSign, BalanceSign } from './ledger.util';
import { fiscalYearLabel } from './bill-post.util';
import { TENANT_HEADER_SELECT, TenantHeaderRow, assetMissLine, refForKind } from './bill-document.service';
import { BillReceiptService, BillReceiptData } from './bill-receipt.service';
import { BillReceiptA5Service } from './bill-receipt-a5.service';
import { BS_MONTH_NAMES_EN } from 'bs-calendar';

/**
 * Decision 2: the receipt has two formats and they are chosen at the CALL
 * SITE, never by a tenant setting or a schema column.
 *   thermal — 80mm roll, the cashier's counter printer. Frozen renderer.
 *   a5      — the BILL-PRINT-1 stationery, two per A4 sheet. Office paths.
 * Data assembly is shared, so balance-after is derived exactly once and both
 * formats read the same figure.
 */
export type ReceiptFormat = 'thermal' | 'a5';

/**
 * BILL-RCPT-STATUS — whether a payment in this state may produce a document
 * at all, and whether that document is a receipt or an acknowledgement.
 *
 * CLEARED    — money is in. A receipt, unchanged.
 * PENDING    — the school holds an uncleared cheque. An acknowledgement: the
 *              amount is labelled TENDERED and the slip says so explicitly.
 * BOUNCED    — the instrument failed. No money, ever.
 * VOIDED     — recorded and then reversed.
 *
 * The last two REFUSE. Printing "Amount received — Rs. 1,500.00" for either is
 * a false statement on a document a parent keeps, and 16 of demo's 31 payments
 * are in one of those two states today.
 *
 * Unknown values refuse. The CHECK constraint admits exactly four, so a fifth
 * means the enum grew without this rule being revisited — and defaulting to
 * "print it" would silently hand out a receipt for a state nobody has ruled on.
 */
export function assertReceiptPrintable(status: string): void {
  switch (status) {
    case 'CLEARED':
    case 'PENDING':
      return;
    case 'BOUNCED':
      throw new ConflictException(errorBody('RECEIPT_PAYMENT_BOUNCED'));
    case 'VOIDED':
      throw new ConflictException(errorBody('RECEIPT_PAYMENT_VOIDED'));
    default:
      throw new ConflictException(
        errorBody('RECEIPT_PAYMENT_VOIDED', `Payments with status ${status} cannot produce a receipt.`),
      );
  }
}

/** PENDING prints an acknowledgement, not a receipt. The one bit either
 *  renderer needs — BOUNCED and VOIDED never reach them. */
export function isProvisional(status: string): boolean {
  return status === 'PENDING';
}

export const RECEIPT_FORMATS: readonly ReceiptFormat[] = ['thermal', 'a5'];

export function resolveReceiptFormat(value: string | undefined, fallback: ReceiptFormat): ReceiptFormat {
  return RECEIPT_FORMATS.includes(value as ReceiptFormat) ? (value as ReceiptFormat) : fallback;
}

interface StudentRow {
  student_name: string;
  class_name: string | null;
  section_name: string | null;
  roll_number: number | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  bs_year: number;
  bs_month: number;
}

/**
 * BILL-8 Checkpoint B orchestration, extended by BILL-PRINT-1: fetch with the
 * same PARENT hard-scope BillPaymentService.findOne already enforces, resolve
 * accent + language + format, render, get-or-generate against a deterministic
 * key, presign. A second call for the same payment+format+language returns
 * the same stored object.
 */
@Injectable()
export class BillReceiptDocumentService {
  private readonly logger = new Logger(BillReceiptDocumentService.name);

  constructor(
    private readonly billPaymentService: BillPaymentService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly publicPrisma: PublicPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storageService: StorageService,
    private readonly billReceiptService: BillReceiptService,
    private readonly billReceiptA5Service: BillReceiptA5Service,
  ) {}

  private keyFor(
    slug: string, paymentId: string, format: ReceiptFormat, language: string, provisional: boolean,
  ): string {
    // BILL-PRINT-1 bumped v1 -> v2 (both formats changed: A5 is new, thermal
    // gained the balance-after line) and added the format segment — a thermal
    // receipt and an A5 receipt for the same payment are two artifacts. v1
    // objects are deliberately not backfilled.
    // BILL-RCPT-STATUS: an acknowledgement and a receipt for the SAME payment
    // are two different documents — a cheque printed while PENDING, then
    // cleared, must not reprint the "subject to clearance" slip. The segment is
    // appended only in the provisional case, so every CLEARED key is byte-
    // identical to what BILL-PRINT-1 already stored and nothing is invalidated.
    // The provisional artifact survives clearance as a true record of what was
    // handed over at the counter.
    const suffix = provisional ? '-pending' : '';
    return `tenant_${slug}/bill-receipt/${paymentId}-v2-${format}-${language}${suffix}.pdf`;
  }

  async getOrGenerateReceiptPdf(
    paymentId: string,
    callerId?: string,
    callerRole?: Role,
    languageOverride?: string,
    format: ReceiptFormat = 'thermal',
  ): Promise<{ presignedUrl: string; generated: boolean }> {
    // Scoping (PARENT -> own child only) happens here, before anything
    // storage-related — same discipline as the bill endpoint.
    const payment = await this.billPaymentService.findOne(paymentId, callerId, callerRole);
    // BILL-RCPT-STATUS, and the reason it sits HERE rather than beside the
    // render: a receipt issued and cached while the payment was CLEARED must
    // refuse on reprint once that payment has bounced or been voided. Below the
    // headObject call this rule would do nothing for exactly the population it
    // exists to protect. The cache stores the document, not the permission to
    // serve it — and refusing to serve is not deleting: the stored object stays
    // as a true record of what was issued.
    assertReceiptPrintable(payment.status);
    const provisional = isProvisional(payment.status);
    const { tenantId, slug } = this.tenantContext.getOrThrow();

    const tenantRows = await this.publicPrisma.query<TenantHeaderRow>(
      `SELECT ${TENANT_HEADER_SELECT} FROM tenants WHERE id = $1`,
      tenantId,
    );
    const tenant = tenantRows[0];
    const language = resolvePrintLanguage(tenant.print_language, languageOverride);
    const key = this.keyFor(slug, paymentId, format, language, provisional);

    const existing = await this.storageService.headObject(key);
    if (existing) {
      return { presignedUrl: await this.storageService.presignRead(key), generated: false };
    }

    const pdfData = await this.buildReceiptData(payment, tenant, language, format, provisional);
    let buffer: Buffer;
    if (format === 'a5') {
      const render = await this.billReceiptA5Service.render(pdfData);
      buffer = render.buffer;
      // Same boundary, same message shape as the fetch-side misses.
      for (const m of render.assetMisses) {
        this.logger.warn(assetMissLine(m.kind, refForKind(tenant, m.kind), m.reason));
      }
    } else {
      // The 80mm thermal renderer draws no images at all — nothing to report.
      buffer = await this.billReceiptService.render(pdfData);
    }
    await this.storageService.putObject(key, buffer, 'application/pdf');
    return { presignedUrl: await this.storageService.presignRead(key), generated: true };
  }

  private async buildReceiptData(
    payment: Awaited<ReturnType<BillPaymentService['findOne']>>,
    tenant: TenantHeaderRow,
    language: ReturnType<typeof resolvePrintLanguage>,
    format: ReceiptFormat,
    provisional: boolean,
  ): Promise<BillReceiptData> {
    const allocationIds = (payment.allocations ?? []).map((a) => a.billInvoiceId);
    const [studentRows, invoiceRows, receivedByRows, balanceAfter, logoBuffer,
      principalSignatureBuffer, schoolStampBuffer] = await Promise.all([
      this.tenantPrisma.query<StudentRow>(
        // BILL-PRINT-1: section + roll join the SELECT for the party block.
        // Both columns already existed; nothing here is a schema change.
        `SELECT s.first_name || ' ' || s.last_name AS student_name, c.name AS class_name,
                sec.name AS section_name, s.roll_number
         FROM students s
         LEFT JOIN classes c ON c.id = s.class_id
         LEFT JOIN sections sec ON sec.id = s.section_id
         WHERE s.id = $1::uuid`,
        payment.studentId,
      ),
      allocationIds.length > 0
        ? this.tenantPrisma.query<InvoiceRow>(
            `SELECT id, invoice_number, bs_year, bs_month FROM bill_invoices WHERE id = ANY($1::uuid[])`,
            allocationIds,
          )
        : Promise.resolve([]),
      this.tenantPrisma.query<{ full_name: string }>(
        `SELECT first_name || ' ' || last_name AS full_name FROM users WHERE id = $1::uuid`,
        payment.receivedBy,
      ),
      this.balanceAsOf(payment.studentId, payment.ledgerEntryId),
      // The A5 stationery carries a letterhead and a signing block; the 80mm
      // thermal one draws neither, so these are only fetched for the format
      // that uses them. Every one is best-effort — a print must never fail
      // because a decorative asset could not load (see optionalAsset).
      optionalAsset(this.logger, 'logo', format === 'a5' ? tenant.logo_url : null, (u) => fetchImageBuffer(u)),
      optionalAsset(this.logger, 'principal-signature',
        format === 'a5' ? tenant.principal_signature_url : null,
        (k) => this.storageService.getObjectBuffer(k)),
      optionalAsset(this.logger, 'school-stamp', format === 'a5' ? tenant.school_stamp_url : null,
        (k) => this.storageService.getObjectBuffer(k)),
    ]);
    const student = studentRows[0];
    const invoiceById = new Map(invoiceRows.map((r) => [r.id, r]));

    const { color: accentColor } = resolveBillBrandColor(tenant.brand_color);
    const bs = bsOf(payment.receivedDate);
    const totalAmount = toMoney(payment.amount);

    return {
      tenant: {
        name: tenant.name,
        principalName: tenant.principal_name,
        accentColor,
        address: tenant.address,
        phone: tenant.phone,
        website: tenant.website,
        panNumber: tenant.pan_number,
        registrationNumber: tenant.registration_number,
        logoBuffer,
        principalSignatureBuffer,
        schoolStampBuffer,
      },
      receiptNumber: payment.receiptNumber,
      receivedDateAd: payment.receivedDate,
      receivedDateBs: `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`,
      studentName: student?.student_name ?? '—',
      className: student?.class_name ?? '—',
      sectionName: student?.section_name ?? null,
      rollNumber: student?.roll_number != null ? String(student.roll_number) : null,
      method: payment.method,
      txnRef: resolveTxnRef(payment),
      amount: payment.amount,
      allocations: (payment.allocations ?? []).map((a) => {
        const inv = invoiceById.get(a.billInvoiceId);
        return {
          invoiceNumber: inv?.invoice_number ?? '—',
          amount: a.amount,
          installment: inv ? `${BS_MONTH_NAMES_EN[inv.bs_month - 1]} ${inv.bs_year}` : '—',
        };
      }),
      advanceAmount: payment.advanceAmount ?? 0,
      ...splitUnallocated(toMoney(payment.advanceAmount ?? 0), balanceAfter),
      balanceAfter: balanceAfter?.amount ?? null,
      balanceAfterSign: balanceAfter?.sign ?? null,
      receivedByName: receivedByRows[0]?.full_name ?? null,
      provisional,
      amountInWordsEn: amountInWords(totalAmount, 'en'),
      amountInWordsNe: amountInWords(totalAmount, 'ne'),
      language,
    };
  }

  /**
   * The student's ledger balance AS OF this payment's own entry — the running
   * sum up to and including it, ordered the same way every other ledger read
   * orders (entry_date, created_at).
   *
   * Deliberately NOT the live balance. The receipt PDF is an immutable cached
   * artifact: if this read the current balance, a reprint after the next
   * payment would contradict the slip the parent is holding. Ledger entries
   * are append-only and corrections post reversing entries rather than
   * mutating rows, so this figure is stable forever.
   *
   * A payment with no ledger entry (PENDING — an uncleared cheque never
   * posts) has no "as of" point; it falls back to the live sum, which is the
   * only honest answer for a provisional receipt.
   */
  private async balanceAsOf(
    _studentId: string,
    ledgerEntryId: string | null,
  ): Promise<{ amount: number; sign: BalanceSign } | null> {
    // No ledger entry means the payment never posted (a bounced or voided
    // instrument). There is NO "balance after this payment" for a payment that
    // did not happen — returning the live balance would caption an unrelated
    // figure as this payment's outcome, which is worse than saying nothing.
    if (!ledgerEntryId) return null;
    const rows = await this.tenantPrisma.query<{ sum: string }>(
      `SELECT COALESCE(SUM(l.debit) - SUM(l.credit), 0) AS sum
         FROM student_ledger_entries l, student_ledger_entries e
        WHERE e.id = $1::uuid
          AND l.student_id = e.student_id
          AND (l.entry_date, l.created_at) <= (e.entry_date, e.created_at)`,
      ledgerEntryId,
    );
    const balance = toMoney(rows[0]?.sum ?? 0);
    // The sign comes from Money via the ledger's own rule — a `< 0` float test
    // here would be a second convention that collapses ZERO into a debit.
    return { amount: balance.toNumber(), sign: balanceSign(balance) };
  }
}

/**
 * Splits the unallocated part of a payment into what it actually did.
 *
 * Unallocated money still credits the ledger, so it reduces the balance whether
 * or not it is tied to an invoice. Whether any of it is genuinely ADVANCED
 * depends on where the balance ended up:
 *
 *   student owed 1500, pays 1500 unallocated -> after 0      -> 0 advanced
 *   student owed    0, pays 1500 unallocated -> after -1500  -> 1500 advanced
 *   student owed  500, pays 1500 unallocated -> after -1000  -> 1000 advanced,
 *                                                               500 applied
 *
 * So the advanced portion is the credit balance the payment created, capped at
 * the unallocated amount; the rest went against existing debt. All in Money —
 * these two numbers have to add back to the unallocated total exactly, because
 * the allocation table foots against the amount received.
 *
 * With no balance (an unposted payment) the split cannot be determined, so the
 * whole unallocated amount stays under one heading rather than asserting a
 * division that was never computed.
 */
export function splitUnallocated(
  unallocated: Money,
  balance: { amount: number; sign: BalanceSign } | null,
): { appliedToBalance: number; advanceCredit: number } {
  if (unallocated.compare(Money.zero()) <= 0) return { appliedToBalance: 0, advanceCredit: 0 };
  if (!balance || balance.sign !== 'ADVANCE') {
    return balance
      ? { appliedToBalance: unallocated.toNumber(), advanceCredit: 0 }
      : { appliedToBalance: 0, advanceCredit: unallocated.toNumber() };
  }
  const credit = Money.fromNumber(Math.abs(balance.amount));
  const advanced = credit.compare(unallocated) < 0 ? credit : unallocated;
  return {
    appliedToBalance: unallocated.sub(advanced).toNumber(),
    advanceCredit: advanced.toNumber(),
  };
}

/**
 * Loads one optional print asset, resolving to null on ANY failure — bad or
 * malformed URL/key (the FILE-1-BLOB `data:` case), storage error, timeout,
 * unsupported bytes. Never throws. Mirrors BillDocumentService.optionalAsset.
 */
async function optionalAsset(
  logger: Logger,
  kind: string,
  ref: string | null,
  load: (ref: string) => Promise<Buffer | null>,
): Promise<Buffer | null> {
  if (!ref) return null;
  try {
    const buf = await load(ref);
    if (!buf) {
      logger.warn(`[BILL-PRINT-1] ${kind} asset not found in storage, printing without it: ${ref.slice(0, 60)}`);
    }
    return buf;
  } catch (err) {
    logger.warn(assetMissLine(kind, ref, (err as Error).message));
    return null;
  }
}

/**
 * Decision 5. Gateway payments carry the gateway's own reference, falling
 * back to the free-text one when the gateway never returned it; bank
 * transfers use the free-text reference; a cheque composes its number, bank
 * and date into the single slot. CASH returns null and the slot prints EMPTY
 * with its geometry intact — an empty labelled field reads as "not
 * applicable" on paper, whereas "N/A" reads as a bug.
 */
export function resolveTxnRef(payment: {
  method: string;
  reference: string | null;
  gatewayTxnRef: string | null;
  chequeBank: string | null;
  chequeDate: string | null;
}): string | null {
  switch (payment.method) {
    case 'ESEWA':
    case 'KHALTI':
      return payment.gatewayTxnRef ?? payment.reference;
    case 'BANK_TRANSFER':
      return payment.reference;
    case 'CHEQUE':
      return [payment.reference, payment.chequeBank, payment.chequeDate]
        .filter((p): p is string => !!p)
        .join(' · ') || null;
    case 'CASH':
    default:
      return null;
  }
}
