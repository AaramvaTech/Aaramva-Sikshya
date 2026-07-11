import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EsewaService } from '../esewa/esewa.service';
import { PaymentService } from '../payment.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../auth/auth.types';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const parentUser: AuthUser = {
  userId: 'parent-1',
  email: 'parent@example.com',
  role: Role.PARENT,
  tenantId: 't-1',
  tenantSlug: 'demo',
};

const accountantUser: AuthUser = {
  userId: 'acct-1',
  email: 'acct@example.com',
  role: Role.ACCOUNTANT,
  tenantId: 't-1',
  tenantSlug: 'demo',
};

const baseInvoiceRow = {
  id: 'inv-1',
  invoice_number: 'INV-2081-000001',
  student_id: 'student-1',
  academic_year_id: 'year-1',
  due_date: new Date('2025-07-15'),
  status: 'PARTIAL',
  subtotal: '1000.00',
  discount_amount: '0.00',
  fine_amount: '0.00',
  total_amount: '1000.00',
  paid_amount: '400.00',
  balance: '600.00', // outstanding — the ONLY amount the gateway may charge
  created_by: 'user-1',
  created_at: new Date('2025-07-01'),
  updated_at: new Date('2025-07-01'),
  deleted_at: null,
};

const baseTxnRow = {
  id: 'txn-row-1',
  invoice_id: 'inv-1',
  gateway: 'ESEWA',
  transaction_uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  amount: '600.00',
  status: 'INITIATED',
  gateway_ref: null,
  failure_reason: null,
  raw_payload: {},
  payment_id: null,
  initiated_by: 'parent-1',
  verified_at: null,
  created_at: new Date(), // fresh by default; tests override for expiry
  updated_at: new Date(),
};

const basePaymentRow = {
  id: 'pay-1',
  payment_number: 'PAY-2081-000001',
  invoice_id: 'inv-1',
  student_id: 'student-1',
  amount: '600.00',
  method: 'ESEWA',
  reference: '0007G36',
  notes: 'eSewa online payment',
  received_by: 'parent-1',
  created_at: new Date(),
  deleted_at: null,
};

const ENABLED_ENV: Record<string, string> = {
  ESEWA_PRODUCT_CODE: 'EPAYTEST',
  ESEWA_SECRET_KEY: '8gBm/:&EnhH.1/q',
  PORT: '3001',
  NODE_ENV: 'development',
};

async function makeService(env: Record<string, string>) {
  const tenantPrisma = {
    run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
    query: jest.fn(),
    execute: jest.fn().mockResolvedValue(1),
  };
  const paymentService = {
    recordPaymentInTx: jest.fn().mockResolvedValue(basePaymentRow),
    emitPaymentReceived: jest.fn(),
  };
  const module = await Test.createTestingModule({
    providers: [
      EsewaService,
      { provide: TenantPrismaService, useValue: tenantPrisma },
      {
        provide: TenantContextService,
        useValue: {
          getOrThrow: jest
            .fn()
            .mockReturnValue({ tenantId: 't-1', slug: 'demo', schemaName: 'tenant_demo' }),
        },
      },
      { provide: PaymentService, useValue: paymentService },
      {
        provide: ConfigService,
        useValue: { get: jest.fn((key: string) => env[key]) },
      },
    ],
  }).compile();

  return {
    service: module.get(EsewaService),
    tenantPrisma,
    paymentService,
  };
}

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok,
    status,
    json: async () => body,
  });
}

describe('EsewaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  // ─── Disabled gateway ───────────────────────────────────────────────────────

  describe('disabled gateway', () => {
    it('initiate throws 503 when ESEWA_* env is absent', async () => {
      const { service } = await makeService({ NODE_ENV: 'development' });
      await expect(
        service.initiate({ invoiceId: 'inv-1' }, accountantUser),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('getStatus reports recorded state without calling the gateway', async () => {
      const { service, tenantPrisma } = await makeService({ NODE_ENV: 'development' });
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      const result = await service.getStatus(baseTxnRow.transaction_uuid, accountantUser);
      expect(result.state).toBe('UNVERIFIED');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── Initiate: amounts come from the server ─────────────────────────────────

  describe('initiate', () => {
    it('charges the invoice outstanding balance, never a client amount', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseInvoiceRow }]);

      const result = await service.initiate({ invoiceId: 'inv-1' }, accountantUser);

      // INSERT got the server-computed outstanding (600), not total (1000)
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payment_transactions'),
        'inv-1',
        result.transactionUuid,
        600,
        accountantUser.userId,
      );
      expect(result.amount).toBe(600);
      expect(result.fields.total_amount).toBe('600');
      expect(result.fields.amount).toBe('600');
      expect(result.fields.product_code).toBe('EPAYTEST');
      expect(result.fields.signed_field_names).toBe(
        'total_amount,transaction_uuid,product_code',
      );
      expect(result.fields.signature).toBeTruthy();
      expect(result.fields.success_url).toContain(
        `/finance/payments/esewa/public/callback/success/demo/${result.transactionUuid}`,
      );
      expect(result.paymentPageUrl).toContain(
        `/finance/payments/esewa/public/pay/demo/${result.transactionUuid}`,
      );
    });

    it('rejects an invoice with no outstanding balance', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseInvoiceRow, status: 'PAID', paid_amount: '1000.00', balance: '0.00' },
      ]);
      await expect(
        service.initiate({ invoiceId: 'inv-1' }, accountantUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PARENT can only initiate for own children (guardians linkage)', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query
        .mockResolvedValueOnce([{ ...baseInvoiceRow }]) // invoice
        .mockResolvedValueOnce([{ student_id: 'someone-elses-child' }]); // guardians
      await expect(
        service.initiate({ invoiceId: 'inv-1' }, parentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tenantPrisma.execute).not.toHaveBeenCalled();
    });

    it('PARENT with matching guardian row initiates fine', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query
        .mockResolvedValueOnce([{ ...baseInvoiceRow }])
        .mockResolvedValueOnce([{ student_id: 'student-1' }]);
      const result = await service.initiate({ invoiceId: 'inv-1' }, parentUser);
      expect(result.transactionUuid).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  // ─── Verify: exactly-once credit ────────────────────────────────────────────

  describe('verify', () => {
    it('COMPLETE status-check credits the invoice exactly once (double callback)', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);

      // First callback: INITIATED row, gateway confirms COMPLETE
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      mockFetchOnce({
        product_code: 'EPAYTEST',
        transaction_uuid: baseTxnRow.transaction_uuid,
        total_amount: 600.0,
        status: 'COMPLETE',
        ref_id: '0007G36',
      });
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' },
      ]); // conditional claim wins
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' },
      ]); // fresh re-read

      const first = await service.verify(baseTxnRow.transaction_uuid, { hint: true });
      expect(first.state).toBe('VERIFIED');
      expect(paymentService.recordPaymentInTx).toHaveBeenCalledTimes(1);
      expect(paymentService.recordPaymentInTx).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({ invoiceId: 'inv-1', amount: 600, method: 'ESEWA' }),
        'parent-1',
      );
      expect(paymentService.emitPaymentReceived).toHaveBeenCalledTimes(1);

      // Replayed callback: row is already VERIFIED — no status-check, no credit
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' },
      ]);
      const second = await service.verify(baseTxnRow.transaction_uuid, { hint: true });
      expect(second.state).toBe('ALREADY_VERIFIED');
      expect(global.fetch).toHaveBeenCalledTimes(1); // still just the first check
      expect(paymentService.recordPaymentInTx).toHaveBeenCalledTimes(1); // unchanged
    });

    it('concurrent race: losing claim records no payment', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      mockFetchOnce({ total_amount: 600, status: 'COMPLETE', ref_id: '0007G36' });
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([]); // claim lost the race
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow, status: 'VERIFIED' }]);

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('ALREADY_VERIFIED');
      expect(paymentService.recordPaymentInTx).not.toHaveBeenCalled();
      expect(paymentService.emitPaymentReceived).not.toHaveBeenCalled();
    });

    it('COMPLETE with a mismatched amount fails the transaction and never credits', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      mockFetchOnce({ total_amount: 599, status: 'COMPLETE', ref_id: '0007G36' });
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseTxnRow, status: 'FAILED', failure_reason: 'amount-mismatch' },
      ]);

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('FAILED');
      expect(paymentService.recordPaymentInTx).not.toHaveBeenCalled();
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining(`SET status = 'FAILED'`),
        baseTxnRow.id,
        expect.stringContaining('amount-mismatch'),
      );
    });

    it('PENDING leaves the row INITIATED', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      mockFetchOnce({ total_amount: 600, status: 'PENDING', ref_id: null });

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('PENDING');
      expect(result.status).toBe('INITIATED');
      expect(paymentService.recordPaymentInTx).not.toHaveBeenCalled();
    });

    it('NOT_FOUND within the grace window stays PENDING (payer may still be typing)', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseTxnRow, created_at: new Date(Date.now() - 60_000) },
      ]);
      mockFetchOnce({ total_amount: 600, status: 'NOT_FOUND', ref_id: null });

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('PENDING');
    });

    it('NOT_FOUND past the grace window expires the transaction', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseTxnRow, created_at: new Date(Date.now() - 20 * 60_000) },
      ]);
      mockFetchOnce({ total_amount: 600, status: 'NOT_FOUND', ref_id: null });

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('EXPIRED');
      expect(paymentService.recordPaymentInTx).not.toHaveBeenCalled();
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining(`SET status = 'EXPIRED'`),
        baseTxnRow.id,
      );
    });

    it('CANCELED marks FAILED with the gateway status as reason', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      mockFetchOnce({ total_amount: 600, status: 'CANCELED', ref_id: null });
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseTxnRow, status: 'FAILED', failure_reason: 'gateway status CANCELED' },
      ]);

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('FAILED');
      expect(result.reason).toContain('CANCELED');
    });

    it('unreachable status-check changes nothing (UNVERIFIED, retryable)', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('UNVERIFIED');
      expect(result.status).toBe('INITIATED');
      expect(paymentService.recordPaymentInTx).not.toHaveBeenCalled();
    });
  });

  // ─── Pay page: CSP must permit exactly what the page executes ─────────────

  describe('buildPayPage', () => {
    it('serves a JS-free submit button, a nonce´d auto-submit script, and a CSP that permits both', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);

      const page = await service.buildPayPage('demo', baseTxnRow.transaction_uuid);
      expect(page.redirect).toBeUndefined();
      expect(page.html).toBeTruthy();
      expect(page.csp).toBeTruthy();

      // Baseline works without JS: a visible submit button, no inline handlers.
      expect(page.html).toContain('type="submit"');
      expect(page.html).not.toContain('onload=');

      // The script and style carry a nonce, and the SAME nonce is allowed by the CSP.
      const nonce = /<script nonce="([^"]+)">/.exec(page.html!)?.[1];
      expect(nonce).toBeTruthy();
      expect(page.html).toContain(`<style nonce="${nonce}">`);
      expect(page.csp).toContain(`script-src 'nonce-${nonce}'`);
      expect(page.csp).toContain(`style-src 'nonce-${nonce}'`);

      // The form POST target origin is allowed (helmet's default form-action
      // 'self' would block leaving for eSewa).
      expect(page.csp).toContain('form-action https://rc-epay.esewa.com.np');
      // Everything else stays locked down.
      expect(page.csp).toContain(`default-src 'none'`);
    });

    it('bounces non-INITIATED transactions to the result page instead of re-posting', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' },
      ]);
      const page = await service.buildPayPage('demo', baseTxnRow.transaction_uuid);
      expect(page.html).toBeUndefined();
      expect(page.redirect).toContain('/payment/success');
    });
  });

  // ─── Callback → web result URL mapping ─────────────────────────────────────

  describe('handleCallback', () => {
    it('verified payment redirects to the web success page', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      const verified = { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' };
      tenantPrisma.query.mockResolvedValue([verified]);

      const url = await service.handleCallback('demo', baseTxnRow.transaction_uuid, undefined);
      expect(url).toBe(
        `http://localhost:3000/payment/success?txn=${baseTxnRow.transaction_uuid}&tenant=demo`,
      );
    });

    it('unknown transaction redirects to failure with UNKNOWN_TRANSACTION', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValue([]);
      const url = await service.handleCallback('demo', 'no-such-uuid', undefined);
      expect(url).toContain('/payment/failure');
      expect(url).toContain('reason=UNKNOWN_TRANSACTION');
    });

    it('stores the base64 redirect payload as a hint without trusting it', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      const failed = { ...baseTxnRow, status: 'FAILED', failure_reason: 'gateway status CANCELED' };
      tenantPrisma.query.mockResolvedValue([failed]);

      const payload = Buffer.from(
        JSON.stringify({ status: 'COMPLETE', total_amount: 600 }),
      ).toString('base64');
      // Row is terminally FAILED — a forged "COMPLETE" redirect payload must NOT resurrect it
      const url = await service.handleCallback('demo', baseTxnRow.transaction_uuid, payload);
      expect(url).toContain('/payment/failure');
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining(`'{redirect}'`),
        baseTxnRow.id,
        expect.stringContaining('COMPLETE'),
      );
      expect(global.fetch).not.toHaveBeenCalled(); // terminal state — no re-check needed
    });
  });
});
