import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { BillPaymentService } from '../bill-payment.service';
import { LedgerService } from '../ledger.service';
import { GuardianScopeService } from '../../student/guardian-scope.service';
import { BillPaymentAllocationMode, BillPaymentMethod } from '../dto/bill-payment.dto';
import { InitiateEsewaPaymentDto } from '../dto/esewa.dto';
import { toMoney } from '../entities/finance.entity';
import { Money } from '../../../common/money/money';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../auth/auth.types';
import {
  buildSignedMessage,
  esewaSignature,
  formatEsewaAmount,
  parseEsewaAmount,
} from './esewa-signature.util';

// ─── Row / result shapes ───────────────────────────────────────────────────────

export interface PaymentTransactionRow {
  id: string;
  invoice_id: string | null;
  bill_invoice_id: string | null;
  gateway: string;
  transaction_uuid: string;
  amount: string | number;
  status: string;
  gateway_ref: string | null;
  failure_reason: string | null;
  raw_payload: unknown;
  payment_id: string | null;
  bill_payment_id: string | null;
  initiated_by: string;
  verified_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

/** bill_invoices row + the CLEARED-only allocation-sum-derived `outstanding` column. */
interface BillInvoiceOutstandingRow {
  id: string;
  invoice_number: string;
  student_id: string;
  academic_year_id: string;
  outstanding: string | number;
}

/**
 * Outcome of one verification attempt. `state` describes what THIS attempt
 * did; `status` is the transaction row's status after it.
 */
export type EsewaVerifyState =
  | 'VERIFIED' // this attempt confirmed COMPLETE and recorded the payment
  | 'ALREADY_VERIFIED' // a previous attempt recorded it — idempotent no-op
  | 'PENDING' // gateway says payment is still in flight (or too fresh to expire)
  | 'FAILED' // terminal: canceled / refunded / amount mismatch
  | 'EXPIRED' // terminal-ish: NOT_FOUND past the grace window (late COMPLETE can still verify)
  | 'UNVERIFIED'; // status-check unreachable/malformed — nothing changed, retry later

export interface EsewaVerifyResult {
  state: EsewaVerifyState;
  transactionUuid: string;
  status: string;
  amount: number;
  invoiceId: string;
  gatewayRef: string | null;
  reason?: string;
}

interface EsewaStatusCheckResponse {
  product_code?: string;
  transaction_uuid?: string;
  total_amount: number | string;
  status: string;
  ref_id: string | null;
}

/**
 * A transaction younger than this is never EXPIRED on NOT_FOUND: eSewa returns
 * NOT_FOUND until the payer actually submits the form, so expiring eagerly
 * would race a payer who is still typing credentials. (The eSewa session
 * itself dies ~5 minutes after login; 15 minutes is comfortable slack.)
 */
const EXPIRE_GRACE_MS = 15 * 60 * 1000;

const SIGNED_FIELD_NAMES = 'total_amount,transaction_uuid,product_code';

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * eSewa ePay v2 gateway (PAY-1). Contract verified against
 * developer.esewa.com.np on 2026-07-11 — see docs/api-contracts/PAY-1-esewa.md.
 *
 * Security invariants:
 *  1. Redirects are hints. Money is recognized only after OUR server calls
 *     eSewa's status-check API and sees COMPLETE.
 *  2. Amounts are server-computed (invoice outstanding balance at initiation)
 *     and re-checked to the paisa against the gateway-confirmed amount.
 *  3. The INITIATED→VERIFIED transition is a conditional UPDATE in the same
 *     DB transaction that records the payment — exactly once, ever.
 *  4. Credentials via env (optional — absent disables the gateway), never logged.
 */
@Injectable()
export class EsewaService implements OnModuleInit {
  private readonly logger = new Logger(EsewaService.name);

  private readonly productCode: string;
  private readonly secretKey: string;
  private readonly formUrl: string;
  private readonly statusUrl: string;
  private readonly apiPublicUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly billPaymentService: BillPaymentService,
    private readonly ledgerService: LedgerService,
    private readonly guardianScope: GuardianScopeService,
  ) {
    this.productCode = this.config.get<string>('ESEWA_PRODUCT_CODE') || '';
    this.secretKey = this.config.get<string>('ESEWA_SECRET_KEY') || '';
    this.formUrl =
      this.config.get<string>('ESEWA_FORM_URL') ||
      'https://rc-epay.esewa.com.np/api/epay/main/v2/form';
    this.statusUrl =
      this.config.get<string>('ESEWA_STATUS_URL') ||
      'https://rc.esewa.com.np/api/epay/transaction/status/';
    this.apiPublicUrl = (
      this.config.get<string>('API_PUBLIC_URL') ||
      `http://localhost:${this.config.get<string>('PORT') || '3001'}`
    ).replace(/\/$/, '');
  }

  get enabled(): boolean {
    return Boolean(this.productCode && this.secretKey);
  }

  onModuleInit(): void {
    if (this.enabled) {
      this.logger.log(
        `eSewa gateway enabled (product ${this.productCode}, form ${this.formUrl})`,
      );
    } else {
      this.logger.log(
        'eSewa gateway disabled (set ESEWA_PRODUCT_CODE + ESEWA_SECRET_KEY to enable) — initiate returns 503',
      );
    }
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException({
        code: 'GATEWAY_DISABLED',
        message: 'Online payment via eSewa is not configured for this server.',
      });
    }
  }

  // ─── Initiate ───────────────────────────────────────────────────────────────

  /**
   * Compute the outstanding balance server-side, create the INITIATED row and
   * return the signed form the client auto-submits to eSewa. PARENT callers
   * are object-scoped to their own children's invoices (guardians linkage).
   */
  async initiate(dto: InitiateEsewaPaymentDto, user: AuthUser) {
    this.assertEnabled();
    const { slug } = this.tenantContext.getOrThrow();

    const [invoice] = await this.tenantPrisma.query<BillInvoiceOutstandingRow>(
      `SELECT bi.*,
              bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS outstanding
       FROM bill_invoices bi
       LEFT JOIN bill_payment_allocations bpa
         ON bpa.bill_invoice_id = bi.id
         AND EXISTS (SELECT 1 FROM bill_payments bp WHERE bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED')
       WHERE bi.id = $1::uuid AND bi.deleted_at IS NULL
       GROUP BY bi.id`,
      dto.invoiceId,
    );
    if (!invoice) throw new NotFoundException(`Invoice ${dto.invoiceId} not found`);

    if (user.role === Role.PARENT) {
      await this.guardianScope.assertOwnsStudent(user.userId, invoice.student_id);
    }

    const outstanding = toMoney(invoice.outstanding).toNumber();
    if (outstanding <= 0) {
      throw new BadRequestException('Invoice has no outstanding balance to pay');
    }

    const transactionUuid = randomUUID(); // alphanumeric + hyphen, per eSewa constraint

    await this.tenantPrisma.execute(
      `INSERT INTO payment_transactions (bill_invoice_id, gateway, transaction_uuid, amount, initiated_by)
       VALUES ($1::uuid, 'ESEWA', $2, $3, $4::uuid)`,
      dto.invoiceId,
      transactionUuid,
      outstanding,
      user.userId,
    );

    return {
      transactionUuid,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      amount: outstanding,
      formUrl: this.formUrl,
      fields: this.buildFormFields(slug, transactionUuid, outstanding),
      // For mobile: a plain GET URL (system browser) that renders the
      // auto-submitting form server-side.
      paymentPageUrl: `${this.apiPublicUrl}/api/v1/finance/payments/esewa/public/pay/${slug}/${transactionUuid}`,
    };
  }

  private buildFormFields(
    slug: string,
    transactionUuid: string,
    amount: number,
  ): Record<string, string> {
    const totalAmount = formatEsewaAmount(amount);
    const callbackBase = `${this.apiPublicUrl}/api/v1/finance/payments/esewa/public/callback`;
    const values: Record<string, string> = {
      amount: totalAmount,
      tax_amount: '0',
      total_amount: totalAmount,
      transaction_uuid: transactionUuid,
      product_code: this.productCode,
      product_service_charge: '0',
      product_delivery_charge: '0',
      // The failure redirect carries NO payload and the success ?data= payload
      // is untrusted — so both URLs embed tenant + transaction identity.
      success_url: `${callbackBase}/success/${slug}/${transactionUuid}`,
      failure_url: `${callbackBase}/failure/${slug}/${transactionUuid}`,
      signed_field_names: SIGNED_FIELD_NAMES,
    };
    values.signature = esewaSignature(
      buildSignedMessage(SIGNED_FIELD_NAMES, values),
      this.secretKey,
    );
    return values;
  }

  // ─── Verify (the only path that recognizes money) ──────────────────────────

  /**
   * Idempotent verification: server-to-server status-check, then the
   * conditional-transition + atomic payment recording. Safe to call from
   * callback replays, double-clicks and the stuck-payment endpoint.
   */
  async verify(
    transactionUuid: string,
    redirectPayload?: unknown,
  ): Promise<EsewaVerifyResult> {
    const txn = await this.loadTransaction(transactionUuid);

    if (redirectPayload !== undefined) {
      // Stored for disputes only — never trusted for state transitions.
      await this.tenantPrisma.execute(
        `UPDATE payment_transactions
         SET raw_payload = jsonb_set(raw_payload, '{redirect}', $2::jsonb), updated_at = NOW()
         WHERE id = $1::uuid`,
        txn.id,
        JSON.stringify(redirectPayload),
      );
    }

    if (txn.status === 'VERIFIED') return this.toResult('ALREADY_VERIFIED', txn);
    if (txn.status === 'FAILED') {
      return this.toResult('FAILED', txn, txn.failure_reason ?? undefined);
    }

    this.assertEnabled();
    const check = await this.statusCheck(txn);
    if (!check) return this.toResult('UNVERIFIED', txn, 'status-check unreachable');

    await this.tenantPrisma.execute(
      `UPDATE payment_transactions
       SET raw_payload = jsonb_set(
             raw_payload, '{statusChecks}',
             COALESCE(raw_payload->'statusChecks', '[]'::jsonb) || $2::jsonb),
           updated_at = NOW()
       WHERE id = $1::uuid`,
      txn.id,
      JSON.stringify(check),
    );

    switch (check.status) {
      case 'COMPLETE': {
        const expectedPaisa = toMoney(txn.amount).mul(100).toNumber();
        const confirmedPaisa = Money.fromNumber(parseEsewaAmount(check.total_amount)).mul(100).toNumber();
        if (expectedPaisa !== confirmedPaisa) {
          const reason = `amount-mismatch: expected ${toMoney(txn.amount).toNumber()}, gateway confirmed ${check.total_amount}`;
          this.logger.warn(`eSewa ${transactionUuid}: ${reason} — NOT crediting`);
          return this.failOnce(txn, reason);
        }
        return this.creditOnce(txn, check);
      }
      case 'PENDING':
      case 'AMBIGUOUS':
        return this.toResult('PENDING', txn, check.status);
      case 'NOT_FOUND': {
        const ageMs = Date.now() - new Date(txn.created_at).getTime();
        if (ageMs < EXPIRE_GRACE_MS) {
          // Too fresh — the payer may not have submitted the form yet.
          return this.toResult('PENDING', txn, 'NOT_FOUND (within grace window)');
        }
        await this.tenantPrisma.execute(
          `UPDATE payment_transactions
           SET status = 'EXPIRED', failure_reason = 'gateway NOT_FOUND (session expired)', updated_at = NOW()
           WHERE id = $1::uuid AND status = 'INITIATED'`,
          txn.id,
        );
        return this.toResult('EXPIRED', txn, 'session expired at gateway');
      }
      case 'CANCELED':
      case 'FULL_REFUND':
      case 'PARTIAL_REFUND':
        return this.failOnce(txn, `gateway status ${check.status}`);
      default:
        this.logger.warn(
          `eSewa ${transactionUuid}: unknown status-check status "${check.status}"`,
        );
        return this.toResult('UNVERIFIED', txn, `unknown gateway status ${check.status}`);
    }
  }

  /**
   * The exactly-once credit: conditional claim + payment recording share one
   * DB transaction. A replay's claim matches zero rows and no-ops. EXPIRED is
   * claimable too — a payment that completes late must still be credited once
   * the status-check proves COMPLETE.
   */
  private async creditOnce(
    txn: PaymentTransactionRow,
    check: EsewaStatusCheckResponse,
  ): Promise<EsewaVerifyResult> {
    const [invoiceRow] = await this.tenantPrisma.query<{ student_id: string; academic_year_id: string }>(
      `SELECT student_id, academic_year_id FROM bill_invoices WHERE id = $1::uuid`,
      txn.bill_invoice_id,
    );
    // invoiceRow is guaranteed by the FK — bill_invoice_id was validated at initiate() time.

    const payment = await this.ledgerService.withStudentLock(invoiceRow.student_id, async (tx) => {
      const [claimed] = await tx.$queryRawUnsafe<PaymentTransactionRow[]>(
        `UPDATE payment_transactions
         SET status = 'VERIFIED', gateway_ref = $2, failure_reason = NULL,
             verified_at = NOW(), updated_at = NOW()
         WHERE transaction_uuid = $1 AND status IN ('INITIATED', 'EXPIRED')
         RETURNING *`,
        txn.transaction_uuid,
        check.ref_id ?? null,
      );
      if (!claimed) return null; // lost the race — someone else settled it

      // Race guard: the invoice's outstanding may have shrunk since initiate()
      // (e.g. a cash payment landed on it first). Cap the MANUAL target at
      // whatever's left; anything beyond that becomes advance credit (B5-7),
      // never a rejection of a gateway-confirmed payment.
      const [{ outstanding }] = await tx.$queryRawUnsafe<{ outstanding: string | number }[]>(
        `SELECT bi.total_receivable - COALESCE(SUM(bpa.amount), 0) AS outstanding
         FROM bill_invoices bi
         LEFT JOIN bill_payment_allocations bpa
           ON bpa.bill_invoice_id = bi.id
           AND EXISTS (SELECT 1 FROM bill_payments bp WHERE bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED')
         WHERE bi.id = $1::uuid
         GROUP BY bi.id`,
        claimed.bill_invoice_id,
      );
      const claimedAmount = toMoney(claimed.amount);
      const currentOutstanding = toMoney(outstanding);
      const targetAmount = currentOutstanding.compare(Money.zero()) > 0
        ? (claimedAmount.compare(currentOutstanding) <= 0 ? claimedAmount : currentOutstanding)
        : Money.zero();

      const paymentRow = await this.billPaymentService.recordPaymentInTx(
        tx,
        {
          studentId: invoiceRow.student_id,
          academicYearId: invoiceRow.academic_year_id,
          amount: claimedAmount,
          method: BillPaymentMethod.ESEWA,
          allocationMode: targetAmount.isZero() ? BillPaymentAllocationMode.ADVANCE_ONLY : BillPaymentAllocationMode.MANUAL,
          targets: targetAmount.isZero() ? undefined : [{ billInvoiceId: claimed.bill_invoice_id!, amount: targetAmount.toDb() }],
          reference: check.ref_id ?? claimed.transaction_uuid,
          notes: `eSewa online payment (transaction ${claimed.transaction_uuid})`,
        },
        claimed.initiated_by,
      );

      await tx.$executeRawUnsafe(
        `UPDATE payment_transactions SET bill_payment_id = $1::uuid WHERE id = $2::uuid`,
        paymentRow.id,
        claimed.id,
      );
      return paymentRow;
    });

    const fresh = await this.loadTransaction(txn.transaction_uuid);
    if (!payment) {
      return fresh.status === 'VERIFIED'
        ? this.toResult('ALREADY_VERIFIED', fresh)
        : this.toResult('FAILED', fresh, fresh.failure_reason ?? undefined);
    }

    // No bill_payments-side equivalent of PaymentService.emitPaymentReceived
    // exists yet (Checkpoint A/B never built a payment.received-style event
    // for the new payments rail) — correctly omitted here, not silently dropped.
    this.logger.log(
      `eSewa ${txn.transaction_uuid}: VERIFIED, payment ${payment.receiptNumber} recorded for invoice ${txn.bill_invoice_id}`,
    );
    return this.toResult('VERIFIED', fresh);
  }

  /** Terminal failure, but only from a live state — never clobbers VERIFIED. */
  private async failOnce(
    txn: PaymentTransactionRow,
    reason: string,
  ): Promise<EsewaVerifyResult> {
    await this.tenantPrisma.execute(
      `UPDATE payment_transactions
       SET status = 'FAILED', failure_reason = $2, updated_at = NOW()
       WHERE id = $1::uuid AND status IN ('INITIATED', 'EXPIRED')`,
      txn.id,
      reason,
    );
    const fresh = await this.loadTransaction(txn.transaction_uuid);
    return fresh.status === 'VERIFIED'
      ? this.toResult('ALREADY_VERIFIED', fresh)
      : this.toResult('FAILED', fresh, reason);
  }

  private async statusCheck(
    txn: PaymentTransactionRow,
  ): Promise<EsewaStatusCheckResponse | null> {
    const url =
      `${this.statusUrl}?product_code=${encodeURIComponent(this.productCode)}` +
      `&total_amount=${encodeURIComponent(formatEsewaAmount(toMoney(txn.amount).toNumber()))}` +
      `&transaction_uuid=${encodeURIComponent(txn.transaction_uuid)}`;
    try {
      const resp = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!resp.ok) {
        this.logger.warn(`eSewa status-check HTTP ${resp.status} for ${txn.transaction_uuid}`);
        return null;
      }
      const body = (await resp.json()) as EsewaStatusCheckResponse;
      if (!body || typeof body.status !== 'string') {
        this.logger.warn(`eSewa status-check malformed body for ${txn.transaction_uuid}`);
        return null;
      }
      return body;
    } catch (err) {
      this.logger.warn(
        `eSewa status-check failed for ${txn.transaction_uuid}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  // ─── Reads (status endpoint, pay page, receipt) ────────────────────────────

  /** Authed status/re-verify for stuck INITIATED rows. PARENT is object-scoped. */
  async getStatus(transactionUuid: string, user: AuthUser): Promise<EsewaVerifyResult> {
    const txn = await this.loadTransaction(transactionUuid);
    if (user.role === Role.PARENT) {
      const [invoice] = await this.tenantPrisma.query<{ student_id: string }>(
        `SELECT student_id FROM bill_invoices WHERE id = $1::uuid`,
        txn.bill_invoice_id,
      );
      await this.guardianScope.assertOwnsStudent(user.userId, invoice?.student_id ?? '');
    }
    if (!this.enabled) {
      // Gateway off (e.g. mid-rotation): report recorded state, change nothing.
      return this.toResult(
        txn.status === 'VERIFIED' ? 'ALREADY_VERIFIED' : 'UNVERIFIED',
        txn,
        'gateway disabled',
      );
    }
    return this.verify(transactionUuid);
  }

  /**
   * The pay page for mobile (system browser has no auth headers, so this is
   * public + throttled; it exposes exactly the fields eSewa is about to
   * receive from the payer's own browser anyway). Non-INITIATED rows bounce
   * to the result page instead of re-posting to eSewa.
   *
   * CSP: helmet's global default (`script-src 'self'`, `form-action 'self'`)
   * blocks BOTH an inline auto-submit script AND the form POST to eSewa's
   * origin — so this response carries its own per-route CSP (returned as
   * `csp`), stricter than the default everywhere except two scoped
   * allowances: a per-response script nonce and form-action to the configured
   * eSewa origin. The visible "Continue to eSewa" button is the JS-free
   * baseline; the nonce'd script auto-submits as progressive enhancement.
   * Do NOT weaken the global helmet CSP instead of this.
   */
  async buildPayPage(
    slug: string,
    transactionUuid: string,
  ): Promise<{ html?: string; csp?: string; redirect?: string }> {
    this.assertEnabled();
    const txn = await this.loadTransaction(transactionUuid);
    if (txn.status !== 'INITIATED') {
      return { redirect: this.resultUrl(slug, txn) };
    }
    const fields = this.buildFormFields(slug, transactionUuid, toMoney(txn.amount).toNumber());
    const inputs = Object.entries(fields)
      .map(
        ([name, value]) =>
          `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
      )
      .join('\n      ');

    const nonce = randomBytes(16).toString('base64');
    const esewaOrigin = new URL(this.formUrl).origin;
    const csp = [
      "default-src 'none'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      `form-action ${esewaOrigin}`,
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join('; ');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Continue to eSewa</title>
  <style nonce="${nonce}">
    body { font-family: sans-serif; text-align: center; padding-top: 4rem; }
    p { color: #444; }
    button { font-size: 1rem; padding: 0.9rem 2.2rem; border: 0; border-radius: 8px;
             background: #60bb46; color: #fff; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: default; }
  </style>
</head>
<body>
  <p id="msg">Taking you to eSewa to complete the payment…</p>
  <form action="${escapeHtml(this.formUrl)}" method="POST">
      ${inputs}
    <button id="go" type="submit">Continue to eSewa</button>
  </form>
  <script nonce="${nonce}">
    document.getElementById('go').disabled = true;
    document.getElementById('msg').textContent = 'Redirecting to eSewa…';
    document.forms[0].submit();
  </script>
</body>
</html>`;
    return { html, csp };
  }

  /**
   * Success callback: parse the ?data= hint, then ALWAYS verify server-to-server.
   * Failure callback: no payload exists; verify anyway (a COMPLETE payment must
   * be credited even if the payer somehow landed on failure_url).
   * Returns the web result page URL to redirect the payer's browser to.
   */
  async handleCallback(
    slug: string,
    transactionUuid: string,
    dataParam?: string,
  ): Promise<string> {
    let redirectPayload: unknown;
    if (dataParam) {
      try {
        redirectPayload = JSON.parse(Buffer.from(dataParam, 'base64').toString('utf8'));
      } catch {
        redirectPayload = { unparseable: true };
      }
    }
    try {
      const result = await this.verify(transactionUuid, redirectPayload);
      const txn = await this.loadTransaction(transactionUuid);
      return this.resultUrl(slug, txn, result);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return `${this.webBaseUrl(slug)}/payment/failure?tenant=${slug}&reason=UNKNOWN_TRANSACTION`;
      }
      throw err;
    }
  }

  /** Public, PII-free receipt for the web result pages. */
  async getReceipt(transactionUuid: string) {
    const rows = await this.tenantPrisma.query<
      PaymentTransactionRow & { invoice_number: string }
    >(
      `SELECT pt.*, bi.invoice_number
       FROM payment_transactions pt
       JOIN bill_invoices bi ON bi.id = pt.bill_invoice_id
       WHERE pt.transaction_uuid = $1`,
      transactionUuid,
    );
    const txn = rows[0];
    if (!txn) throw new NotFoundException('Transaction not found');
    return {
      transactionUuid: txn.transaction_uuid,
      status: txn.status,
      amount: toMoney(txn.amount).toNumber(),
      gateway: txn.gateway,
      gatewayRef: txn.gateway_ref,
      invoiceNumber: txn.invoice_number,
      failureReason: txn.failure_reason,
      verifiedAt: txn.verified_at
        ? new Date(txn.verified_at).toISOString()
        : null,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async loadTransaction(transactionUuid: string): Promise<PaymentTransactionRow> {
    const [txn] = await this.tenantPrisma.query<PaymentTransactionRow>(
      `SELECT * FROM payment_transactions WHERE transaction_uuid = $1`,
      transactionUuid,
    );
    if (!txn) throw new NotFoundException(`Transaction ${transactionUuid} not found`);
    return txn;
  }

  private webBaseUrl(slug: string): string {
    const configured = this.config.get<string>('WEB_BASE_URL');
    if (configured) return configured.replace(/\/$/, '');
    if (this.config.get<string>('NODE_ENV') === 'development') {
      return 'http://localhost:3000';
    }
    const domain = this.config.get<string>('APP_DOMAIN') || 'aaramvashikshya.com';
    return `https://${slug}.${domain}`;
  }

  private resultUrl(
    slug: string,
    txn: PaymentTransactionRow,
    result?: EsewaVerifyResult,
  ): string {
    const base = this.webBaseUrl(slug);
    const qs = `txn=${txn.transaction_uuid}&tenant=${slug}`;
    const state = result?.state ?? (txn.status === 'VERIFIED' ? 'ALREADY_VERIFIED' : txn.status);
    if (state === 'VERIFIED' || state === 'ALREADY_VERIFIED') {
      return `${base}/payment/success?${qs}`;
    }
    const reason = encodeURIComponent(result?.reason ?? txn.failure_reason ?? state);
    return `${base}/payment/failure?${qs}&reason=${reason}`;
  }

  private toResult(
    state: EsewaVerifyState,
    txn: PaymentTransactionRow,
    reason?: string,
  ): EsewaVerifyResult {
    return {
      state,
      transactionUuid: txn.transaction_uuid,
      status: state === 'EXPIRED' ? 'EXPIRED' : txn.status,
      amount: toMoney(txn.amount).toNumber(),
      invoiceId: txn.bill_invoice_id ?? '',
      gatewayRef: txn.gateway_ref,
      reason,
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
