import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { PaymentService } from '../payment.service';
import { PaymentMethod } from '../dto/payment.dto';
import { InitiateKhaltiPaymentDto } from '../dto/khalti.dto';
import { InvoiceRow, toNum } from '../entities/finance.entity';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../auth/auth.types';
import type { PaymentTransactionRow } from '../esewa/esewa.service';
import { toPaisa } from './khalti.util';

// ─── Result shapes (same vocabulary as eSewa's — states are gateway-agnostic) ──

export type KhaltiVerifyState =
  | 'VERIFIED' // this attempt confirmed Completed and recorded the payment
  | 'ALREADY_VERIFIED' // a previous attempt recorded it — idempotent no-op
  | 'PENDING' // lookup says Pending/Initiated — payer may still complete
  | 'FAILED' // terminal: canceled / refunded / amount mismatch / initiate failed
  | 'EXPIRED' // lookup says Expired (late Completed can still credit once)
  | 'UNVERIFIED'; // lookup unreachable/malformed — nothing changed, retry later

export interface KhaltiVerifyResult {
  state: KhaltiVerifyState;
  transactionUuid: string;
  status: string;
  amount: number;
  invoiceId: string;
  gatewayRef: string | null;
  reason?: string;
}

interface KhaltiInitiateResponse {
  pidx?: string;
  payment_url?: string;
  expires_at?: string;
  expires_in?: number;
  [key: string]: unknown;
}

interface KhaltiLookupResponse {
  pidx?: string;
  total_amount?: number | string; // PAISA
  status?: string;
  transaction_id?: string | null;
  fee?: number;
  refunded?: boolean;
  [key: string]: unknown;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Khalti KPG-2 / ePayment gateway (PAY-2). Contract verified against
 * docs.khalti.com on 2026-07-12 — see docs/api-contracts/PAY-2-khalti.md.
 *
 * Same four invariants as eSewa (PAY-1):
 *  1. The return_url redirect is a hint. Money is recognized only after OUR
 *     server calls /epayment/lookup/ and sees status "Completed".
 *  2. Amounts are server-computed from the invoice and sent/compared in PAISA
 *     (integer rupees×100 via khalti.util.ts — never floats, never rupees).
 *  3. The INITIATED→VERIFIED transition is a conditional UPDATE in the same
 *     DB transaction that records the payment (recordPaymentInTx) — exactly
 *     once per row; the row is 1:1 with a Khalti pidx (stored in gateway_ref).
 *  4. KHALTI_SECRET_KEY via optional env — absent disables the gateway with a
 *     boot notice; the key is sent only in the Authorization header, never
 *     logged.
 *
 * Structural difference from eSewa: initiation is a server-to-server POST that
 * returns a hosted payment_url — no signed client form, no CSP carve-out; our
 * public "pay page" is a plain 302 to that URL.
 */
@Injectable()
export class KhaltiService implements OnModuleInit {
  private readonly logger = new Logger(KhaltiService.name);

  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly apiPublicUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly paymentService: PaymentService,
  ) {
    this.secretKey = this.config.get<string>('KHALTI_SECRET_KEY') || '';
    this.baseUrl = (
      this.config.get<string>('KHALTI_BASE_URL') || 'https://dev.khalti.com/api/v2'
    ).replace(/\/$/, '');
    this.apiPublicUrl = (
      this.config.get<string>('API_PUBLIC_URL') ||
      `http://localhost:${this.config.get<string>('PORT') || '3001'}`
    ).replace(/\/$/, '');
  }

  get enabled(): boolean {
    return Boolean(this.secretKey);
  }

  onModuleInit(): void {
    if (this.enabled) {
      this.logger.log(`Khalti gateway enabled (base ${this.baseUrl})`);
    } else {
      this.logger.log(
        'Khalti gateway disabled (set KHALTI_SECRET_KEY to enable) — initiate returns 503',
      );
    }
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException({
        code: 'GATEWAY_DISABLED',
        message: 'Online payment via Khalti is not configured for this server.',
      });
    }
  }

  // ─── Initiate (server-to-server) ────────────────────────────────────────────

  /**
   * Compute the outstanding balance server-side, create the INITIATED row,
   * then POST /epayment/initiate/ to Khalti. The returned payment_url is where
   * the payer's browser goes; pidx (Khalti's transaction id) is stored in
   * gateway_ref and drives every later lookup. PARENT callers are
   * object-scoped to their own children's invoices.
   */
  async initiate(dto: InitiateKhaltiPaymentDto, user: AuthUser) {
    this.assertEnabled();
    const { slug } = this.tenantContext.getOrThrow();

    const [invoice] = await this.tenantPrisma.query<InvoiceRow>(
      `SELECT * FROM invoices WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.invoiceId,
    );
    if (!invoice) throw new NotFoundException(`Invoice ${dto.invoiceId} not found`);

    if (user.role === Role.PARENT) {
      await this.assertParentOwnsStudent(user.userId, invoice.student_id);
    }

    const outstanding = toNum(invoice.balance);
    if (outstanding <= 0) {
      throw new BadRequestException('Invoice has no outstanding balance to pay');
    }

    const transactionUuid = randomUUID(); // becomes Khalti's purchase_order_id

    await this.tenantPrisma.execute(
      `INSERT INTO payment_transactions (invoice_id, gateway, transaction_uuid, amount, initiated_by)
       VALUES ($1::uuid, 'KHALTI', $2, $3, $4::uuid)`,
      dto.invoiceId,
      transactionUuid,
      outstanding,
      user.userId,
    );

    const body = {
      return_url: `${this.apiPublicUrl}/api/v1/finance/payments/khalti/public/callback/${slug}/${transactionUuid}`,
      website_url: this.webBaseUrl(slug),
      amount: toPaisa(outstanding), // PAISA — integer, never rupees (invariant 2)
      purchase_order_id: transactionUuid,
      purchase_order_name: `Invoice ${invoice.invoice_number}`,
    };

    const initiated = await this.khaltiPost<KhaltiInitiateResponse>('/epayment/initiate/', body);
    if (!initiated || !initiated.pidx || !initiated.payment_url) {
      const reason = initiated
        ? `initiate response missing pidx/payment_url: ${JSON.stringify(initiated).slice(0, 300)}`
        : 'initiate request failed';
      await this.tenantPrisma.execute(
        `UPDATE payment_transactions
         SET status = 'FAILED', failure_reason = $2, updated_at = NOW()
         WHERE transaction_uuid = $1 AND status = 'INITIATED'`,
        transactionUuid,
        reason,
      );
      this.logger.warn(`Khalti initiate failed for ${transactionUuid}: ${reason}`);
      throw new BadGatewayException({
        code: 'GATEWAY_INITIATE_FAILED',
        message: 'Khalti did not accept the payment initiation. Please try again.',
      });
    }

    await this.tenantPrisma.execute(
      `UPDATE payment_transactions
       SET gateway_ref = $2,
           raw_payload = jsonb_set(raw_payload, '{initiate}', $3::jsonb),
           updated_at = NOW()
       WHERE transaction_uuid = $1`,
      transactionUuid,
      initiated.pidx,
      JSON.stringify({
        pidx: initiated.pidx,
        payment_url: initiated.payment_url,
        expires_at: initiated.expires_at ?? null,
      }),
    );

    return {
      transactionUuid,
      pidx: initiated.pidx,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      amount: outstanding,
      // Khalti's hosted page — absolute URL, safe for mobile to open directly.
      paymentUrl: initiated.payment_url,
      // Our redirect page (mirrors eSewa's flow; bounces non-INITIATED rows to results).
      paymentPageUrl: `${this.apiPublicUrl}/api/v1/finance/payments/khalti/public/pay/${slug}/${transactionUuid}`,
    };
  }

  // ─── Verify (the only path that recognizes money) ──────────────────────────

  /**
   * Idempotent verification: server-to-server lookup by pidx, then the
   * conditional-transition + atomic payment recording. Safe to call from
   * callback replays, double-clicks and the stuck-payment endpoint.
   */
  async verify(transactionUuid: string, redirectPayload?: unknown): Promise<KhaltiVerifyResult> {
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
    if (!txn.gateway_ref) {
      // Initiate never completed — there is no pidx to look up.
      return this.toResult('UNVERIFIED', txn, 'no pidx recorded for this transaction');
    }

    const lookup = await this.khaltiPost<KhaltiLookupResponse>('/epayment/lookup/', {
      pidx: txn.gateway_ref,
    });
    if (!lookup || typeof lookup.status !== 'string') {
      return this.toResult('UNVERIFIED', txn, 'lookup unreachable or malformed');
    }

    await this.tenantPrisma.execute(
      `UPDATE payment_transactions
       SET raw_payload = jsonb_set(
             raw_payload, '{statusChecks}',
             COALESCE(raw_payload->'statusChecks', '[]'::jsonb) || $2::jsonb),
           updated_at = NOW()
       WHERE id = $1::uuid`,
      txn.id,
      JSON.stringify(lookup),
    );

    switch (lookup.status) {
      case 'Completed': {
        // Khalti confirms in PAISA; our row stores rupees. Compare integers.
        const expectedPaisa = toPaisa(toNum(txn.amount));
        const confirmedPaisa = Math.round(Number(lookup.total_amount));
        if (!Number.isFinite(confirmedPaisa) || expectedPaisa !== confirmedPaisa) {
          const reason = `amount-mismatch: expected ${expectedPaisa} paisa, gateway confirmed ${lookup.total_amount}`;
          this.logger.warn(`Khalti ${transactionUuid}: ${reason} — NOT crediting`);
          return this.failOnce(txn, reason);
        }
        return this.creditOnce(txn, lookup);
      }
      case 'Pending':
      case 'Initiated':
        return this.toResult('PENDING', txn, `gateway status ${lookup.status}`);
      case 'Expired':
        await this.tenantPrisma.execute(
          `UPDATE payment_transactions
           SET status = 'EXPIRED', failure_reason = 'gateway status Expired', updated_at = NOW()
           WHERE id = $1::uuid AND status = 'INITIATED'`,
          txn.id,
        );
        return this.toResult('EXPIRED', txn, 'payment link expired at gateway');
      case 'User canceled':
      case 'Refunded':
      case 'Partially Refunded':
        return this.failOnce(txn, `gateway status ${lookup.status}`);
      default:
        this.logger.warn(`Khalti ${transactionUuid}: unknown lookup status "${lookup.status}"`);
        return this.toResult('UNVERIFIED', txn, `unknown gateway status ${lookup.status}`);
    }
  }

  /**
   * The exactly-once credit: conditional claim + payment recording share one
   * DB transaction (same rail as eSewa — PaymentService.recordPaymentInTx).
   * EXPIRED is claimable too: a payment completed late still credits once the
   * lookup proves Completed.
   */
  private async creditOnce(
    txn: PaymentTransactionRow,
    lookup: KhaltiLookupResponse,
  ): Promise<KhaltiVerifyResult> {
    const reference = lookup.transaction_id || txn.gateway_ref || txn.transaction_uuid;
    const payment = await this.tenantPrisma.run(async (tx) => {
      const [claimed] = await tx.$queryRawUnsafe<PaymentTransactionRow[]>(
        `UPDATE payment_transactions
         SET status = 'VERIFIED', failure_reason = NULL,
             verified_at = NOW(), updated_at = NOW()
         WHERE transaction_uuid = $1 AND status IN ('INITIATED', 'EXPIRED')
         RETURNING *`,
        txn.transaction_uuid,
      );
      if (!claimed) return null; // lost the race — someone else settled it

      const paymentRow = await this.paymentService.recordPaymentInTx(
        tx,
        {
          invoiceId: claimed.invoice_id,
          amount: toNum(claimed.amount),
          method: PaymentMethod.KHALTI,
          reference,
          notes: `Khalti online payment (pidx ${claimed.gateway_ref ?? 'unknown'})`,
        },
        claimed.initiated_by,
      );

      await tx.$executeRawUnsafe(
        `UPDATE payment_transactions SET payment_id = $1::uuid WHERE id = $2::uuid`,
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

    this.paymentService.emitPaymentReceived(payment);
    this.logger.log(
      `Khalti ${txn.transaction_uuid}: VERIFIED, payment ${payment.payment_number} recorded for invoice ${txn.invoice_id}`,
    );
    return this.toResult('VERIFIED', fresh);
  }

  /** Terminal failure, but only from a live state — never clobbers VERIFIED. */
  private async failOnce(
    txn: PaymentTransactionRow,
    reason: string,
  ): Promise<KhaltiVerifyResult> {
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

  // ─── Reads (status endpoint, pay redirect, receipt) ─────────────────────────

  /** Authed status/re-verify for stuck INITIATED rows. PARENT is object-scoped. */
  async getStatus(transactionUuid: string, user: AuthUser): Promise<KhaltiVerifyResult> {
    const txn = await this.loadTransaction(transactionUuid);
    if (user.role === Role.PARENT) {
      const [invoice] = await this.tenantPrisma.query<{ student_id: string }>(
        `SELECT student_id FROM invoices WHERE id = $1::uuid`,
        txn.invoice_id,
      );
      await this.assertParentOwnsStudent(user.userId, invoice?.student_id ?? '');
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
   * Public pay redirect (mobile opens this in the system browser, mirroring
   * eSewa's pay page). Khalti hosts the actual payment UI, so this is a plain
   * 302 to the stored payment_url — no HTML, no CSP carve-out. Non-INITIATED
   * rows bounce to the result page instead.
   */
  async buildPayRedirect(slug: string, transactionUuid: string): Promise<string> {
    this.assertEnabled();
    const txn = await this.loadTransaction(transactionUuid);
    if (txn.status !== 'INITIATED') {
      return this.resultUrl(slug, txn);
    }
    const paymentUrl = this.storedPaymentUrl(txn);
    if (!paymentUrl) {
      return this.resultUrl(slug, txn, this.toResult('UNVERIFIED', txn, 'no payment_url recorded'));
    }
    return paymentUrl;
  }

  /**
   * Khalti redirects the payer to ONE return_url with the outcome in query
   * params — stored as a hint, then ALWAYS verified server-to-server.
   * Returns the web result page URL to redirect the payer's browser to.
   */
  async handleCallback(
    slug: string,
    transactionUuid: string,
    query: Record<string, unknown>,
  ): Promise<string> {
    try {
      const result = await this.verify(transactionUuid, query);
      const txn = await this.loadTransaction(transactionUuid);
      return this.resultUrl(slug, txn, result);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return `${this.webBaseUrl(slug)}/payment/failure?tenant=${slug}&gw=khalti&reason=UNKNOWN_TRANSACTION`;
      }
      throw err;
    }
  }

  /** Public, PII-free receipt for the web result pages. */
  async getReceipt(transactionUuid: string) {
    const rows = await this.tenantPrisma.query<
      PaymentTransactionRow & { invoice_number: string }
    >(
      `SELECT pt.*, i.invoice_number
       FROM payment_transactions pt
       JOIN invoices i ON i.id = pt.invoice_id
       WHERE pt.transaction_uuid = $1 AND pt.gateway = 'KHALTI'`,
      transactionUuid,
    );
    const txn = rows[0];
    if (!txn) throw new NotFoundException('Transaction not found');
    return {
      transactionUuid: txn.transaction_uuid,
      status: txn.status,
      amount: toNum(txn.amount),
      gateway: txn.gateway,
      gatewayRef: txn.gateway_ref,
      invoiceNumber: txn.invoice_number,
      failureReason: txn.failure_reason,
      verifiedAt: txn.verified_at ? new Date(txn.verified_at).toISOString() : null,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * POST to Khalti with the secret key header. Returns the parsed JSON body,
   * or null when the request fails / the response is not JSON. Non-2xx bodies
   * are returned too (Khalti signals e.g. validation errors with 400 + JSON)
   * so callers can log/store the real gateway message.
   */
  private async khaltiPost<T>(path: string, body: unknown): Promise<T | null> {
    try {
      const resp = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
      const parsed = (await resp.json().catch(() => null)) as T | null;
      if (!resp.ok) {
        this.logger.warn(
          `Khalti ${path} HTTP ${resp.status}: ${JSON.stringify(parsed).slice(0, 300)}`,
        );
        return path === '/epayment/lookup/' ? null : parsed;
      }
      return parsed;
    } catch (err) {
      this.logger.warn(`Khalti ${path} request failed: ${(err as Error).message}`);
      return null;
    }
  }

  private storedPaymentUrl(txn: PaymentTransactionRow): string | null {
    const raw = txn.raw_payload as { initiate?: { payment_url?: string } } | null;
    return raw?.initiate?.payment_url ?? null;
  }

  private async loadTransaction(transactionUuid: string): Promise<PaymentTransactionRow> {
    const [txn] = await this.tenantPrisma.query<PaymentTransactionRow>(
      `SELECT * FROM payment_transactions WHERE transaction_uuid = $1 AND gateway = 'KHALTI'`,
      transactionUuid,
    );
    if (!txn) throw new NotFoundException(`Transaction ${transactionUuid} not found`);
    return txn;
  }

  private async assertParentOwnsStudent(callerId: string, studentId: string): Promise<void> {
    const children = await this.tenantPrisma.query<{ student_id: string }>(
      `SELECT student_id FROM guardians WHERE user_id = $1::uuid`,
      callerId,
    );
    if (!children.some((c) => c.student_id === studentId)) {
      throw new ForbiddenException('Access denied');
    }
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
    result?: KhaltiVerifyResult,
  ): string {
    const base = this.webBaseUrl(slug);
    const qs = `txn=${txn.transaction_uuid}&tenant=${slug}&gw=khalti`;
    const state = result?.state ?? (txn.status === 'VERIFIED' ? 'ALREADY_VERIFIED' : txn.status);
    if (state === 'VERIFIED' || state === 'ALREADY_VERIFIED') {
      return `${base}/payment/success?${qs}`;
    }
    const reason = encodeURIComponent(result?.reason ?? txn.failure_reason ?? state);
    return `${base}/payment/failure?${qs}&reason=${reason}`;
  }

  private toResult(
    state: KhaltiVerifyState,
    txn: PaymentTransactionRow,
    reason?: string,
  ): KhaltiVerifyResult {
    return {
      state,
      transactionUuid: txn.transaction_uuid,
      status: state === 'EXPIRED' ? 'EXPIRED' : txn.status,
      amount: toNum(txn.amount),
      invoiceId: txn.invoice_id,
      gatewayRef: txn.gateway_ref,
      reason,
    };
  }
}
