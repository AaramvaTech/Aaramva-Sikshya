import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KhaltiService } from '../khalti/khalti.service';
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

const PIDX = 'GxLrhgLBFVKKn9EJ2wNprE';

const baseTxnRow = {
  id: 'txn-row-1',
  invoice_id: 'inv-1',
  gateway: 'KHALTI',
  transaction_uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  amount: '600.00',
  status: 'INITIATED',
  gateway_ref: PIDX,
  failure_reason: null,
  raw_payload: { initiate: { pidx: PIDX, payment_url: 'https://test-pay.khalti.com/?pidx=' + PIDX } },
  payment_id: null,
  initiated_by: 'parent-1',
  verified_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const basePaymentRow = {
  id: 'pay-1',
  payment_number: 'PAY-2081-000002',
  invoice_id: 'inv-1',
  student_id: 'student-1',
  amount: '600.00',
  method: 'KHALTI',
  reference: 'khalti-txn-001',
  notes: 'Khalti online payment',
  received_by: 'parent-1',
  created_at: new Date(),
  deleted_at: null,
};

const ENABLED_ENV: Record<string, string> = {
  KHALTI_SECRET_KEY: 'test-khalti-secret',
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
      KhaltiService,
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
    service: module.get(KhaltiService),
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

describe('KhaltiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    global.fetch = jest.fn();
  });

  // ─── Disabled gateway (invariant 4) ─────────────────────────────────────────

  describe('disabled gateway', () => {
    it('initiate throws 503 when KHALTI_SECRET_KEY is absent', async () => {
      const { service } = await makeService({ NODE_ENV: 'development' });
      await expect(
        service.initiate({ invoiceId: 'inv-1' }, accountantUser),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('getStatus reports recorded state without calling the gateway', async () => {
      const { service, tenantPrisma } = await makeService({ NODE_ENV: 'development' });
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      const result = await service.getStatus(baseTxnRow.transaction_uuid, accountantUser);
      expect(result.state).toBe('UNVERIFIED');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── Initiate: server-computed amount, in PAISA (invariant 2) ───────────────

  describe('initiate', () => {
    it('POSTs the outstanding balance in integer paisa with the Key auth header', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseInvoiceRow }]);
      mockFetchOnce({ pidx: PIDX, payment_url: `https://test-pay.khalti.com/?pidx=${PIDX}`, expires_at: '2026-07-12T10:00:00+05:45' });

      const result = await service.initiate({ invoiceId: 'inv-1' }, accountantUser);

      // INSERT stores the server-computed RUPEE outstanding (600), never total (1000)
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payment_transactions'),
        'inv-1',
        result.transactionUuid,
        600,
        accountantUser.userId,
      );

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://dev.khalti.com/api/v2/epayment/initiate/');
      expect((init.headers as Record<string, string>).Authorization).toBe('Key test-khalti-secret');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.amount).toBe(60000); // PAISA — rupees × 100, integer
      expect(body.purchase_order_id).toBe(result.transactionUuid);
      expect(body.purchase_order_name).toBe('Invoice INV-2081-000001');
      expect(body.return_url).toContain(
        `/finance/payments/khalti/public/callback/demo/${result.transactionUuid}`,
      );

      // pidx recorded on the row; payment_url returned for the client
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('gateway_ref'),
        result.transactionUuid,
        PIDX,
        expect.stringContaining('payment_url'),
      );
      expect(result.pidx).toBe(PIDX);
      expect(result.paymentUrl).toContain('test-pay.khalti.com');
      expect(result.paymentPageUrl).toContain(
        `/finance/payments/khalti/public/pay/demo/${result.transactionUuid}`,
      );
      expect(result.amount).toBe(600);
    });

    it('marks the row FAILED and throws 502 when Khalti rejects the initiation', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseInvoiceRow }]);
      mockFetchOnce({ error_key: 'validation_error', amount: ['Amount should be greater than Rs. 1'] }, false, 400);

      await expect(
        service.initiate({ invoiceId: 'inv-1' }, accountantUser),
      ).rejects.toBeInstanceOf(BadGatewayException);

      const failCall = tenantPrisma.execute.mock.calls.find(([sql]) =>
        (sql as string).includes("status = 'FAILED'"),
      );
      expect(failCall).toBeDefined();
    });

    it('rejects an invoice with no outstanding balance', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseInvoiceRow, status: 'PAID', paid_amount: '1000.00', balance: '0.00' },
      ]);
      await expect(
        service.initiate({ invoiceId: 'inv-1' }, accountantUser),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(global.fetch).not.toHaveBeenCalled();
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
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── Verify: lookup is the only source of truth (invariants 1 + 3) ──────────

  describe('verify', () => {
    it('Completed lookup with matching paisa credits exactly once via recordPaymentInTx', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query
        .mockResolvedValueOnce([{ ...baseTxnRow }]) // loadTransaction
        .mockResolvedValueOnce([{ ...baseTxnRow, status: 'VERIFIED', payment_id: 'pay-1' }]); // fresh
      mockFetchOnce({ pidx: PIDX, total_amount: 60000, status: 'Completed', transaction_id: 'khalti-txn-001' });
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ ...baseTxnRow, status: 'VERIFIED' }]); // claim wins

      const result = await service.verify(baseTxnRow.transaction_uuid);

      expect(result.state).toBe('VERIFIED');
      // Lookup hit the real endpoint shape
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://dev.khalti.com/api/v2/epayment/lookup/');
      expect(JSON.parse(init.body as string)).toEqual({ pidx: PIDX });
      // Conditional claim — only INITIATED/EXPIRED rows transition
      const [claimSql] = mockTx.$queryRawUnsafe.mock.calls[0] as [string];
      expect(claimSql).toContain("status IN ('INITIATED', 'EXPIRED')");
      // Payment recorded inside the SAME tx, in rupees, method KHALTI
      expect(paymentService.recordPaymentInTx).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          invoiceId: 'inv-1',
          amount: 600,
          method: 'KHALTI',
          reference: 'khalti-txn-001',
        }),
        'parent-1',
      );
      expect(paymentService.emitPaymentReceived).toHaveBeenCalledTimes(1);
    });

    it('replayed callback on a VERIFIED row is an idempotent no-op (no lookup, no credit)', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow, status: 'VERIFIED' }]);

      const result = await service.verify(baseTxnRow.transaction_uuid);

      expect(result.state).toBe('ALREADY_VERIFIED');
      expect(global.fetch).not.toHaveBeenCalled();
      expect(paymentService.recordPaymentInTx).not.toHaveBeenCalled();
    });

    it('lost claim race resolves as ALREADY_VERIFIED without a second payment', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query
        .mockResolvedValueOnce([{ ...baseTxnRow }])
        .mockResolvedValueOnce([{ ...baseTxnRow, status: 'VERIFIED', payment_id: 'pay-1' }]);
      mockFetchOnce({ pidx: PIDX, total_amount: 60000, status: 'Completed', transaction_id: 'khalti-txn-001' });
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([]); // claim matched zero rows

      const result = await service.verify(baseTxnRow.transaction_uuid);

      expect(result.state).toBe('ALREADY_VERIFIED');
      expect(paymentService.recordPaymentInTx).not.toHaveBeenCalled();
      expect(paymentService.emitPaymentReceived).not.toHaveBeenCalled();
    });

    it('Completed with a paisa mismatch FAILS and never credits (off-by-100 guard)', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query
        .mockResolvedValueOnce([{ ...baseTxnRow }])
        .mockResolvedValueOnce([{ ...baseTxnRow, status: 'FAILED', failure_reason: 'amount-mismatch' }]);
      // Gateway confirms 600 PAISA (Rs 6) — a rupee value smuggled into a paisa field
      mockFetchOnce({ pidx: PIDX, total_amount: 600, status: 'Completed', transaction_id: 'khalti-txn-001' });

      const result = await service.verify(baseTxnRow.transaction_uuid);

      expect(result.state).toBe('FAILED');
      expect(paymentService.recordPaymentInTx).not.toHaveBeenCalled();
      const failCall = tenantPrisma.execute.mock.calls.find(([sql]) =>
        (sql as string).includes("status = 'FAILED'"),
      );
      expect(failCall).toBeDefined();
    });

    it('Pending / Initiated lookups keep the row INITIATED (payer may still finish)', async () => {
      for (const gatewayStatus of ['Pending', 'Initiated']) {
        const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
        tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
        mockFetchOnce({ pidx: PIDX, total_amount: 60000, status: gatewayStatus });

        const result = await service.verify(baseTxnRow.transaction_uuid);

        expect(result.state).toBe('PENDING');
        expect(paymentService.recordPaymentInTx).not.toHaveBeenCalled();
        const terminal = tenantPrisma.execute.mock.calls.find(([sql]) =>
          (sql as string).includes("status = 'FAILED'") || (sql as string).includes("status = 'EXPIRED'"),
        );
        expect(terminal).toBeUndefined();
      }
    });

    it('Expired lookup marks the row EXPIRED (late Completed can still claim it)', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      mockFetchOnce({ pidx: PIDX, total_amount: 60000, status: 'Expired' });

      const result = await service.verify(baseTxnRow.transaction_uuid);

      expect(result.state).toBe('EXPIRED');
      const expireCall = tenantPrisma.execute.mock.calls.find(([sql]) =>
        (sql as string).includes("status = 'EXPIRED'"),
      );
      expect(expireCall).toBeDefined();
      expect((expireCall![0] as string)).toContain("status = 'INITIATED'"); // conditional
    });

    it('User canceled fails terminally', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query
        .mockResolvedValueOnce([{ ...baseTxnRow }])
        .mockResolvedValueOnce([{ ...baseTxnRow, status: 'FAILED', failure_reason: 'gateway status User canceled' }]);
      mockFetchOnce({ pidx: PIDX, total_amount: 60000, status: 'User canceled' });

      const result = await service.verify(baseTxnRow.transaction_uuid);

      expect(result.state).toBe('FAILED');
      expect(paymentService.recordPaymentInTx).not.toHaveBeenCalled();
    });

    it('unknown lookup status leaves the row untouched (UNVERIFIED)', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      mockFetchOnce({ pidx: PIDX, total_amount: 60000, status: 'SomethingNew' });

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('UNVERIFIED');
    });

    it('unreachable lookup is UNVERIFIED — nothing changes, retry later', async () => {
      const { service, tenantPrisma, paymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await service.verify(baseTxnRow.transaction_uuid);

      expect(result.state).toBe('UNVERIFIED');
      expect(paymentService.recordPaymentInTx).not.toHaveBeenCalled();
    });

    it('row without a recorded pidx cannot be looked up (UNVERIFIED, no fetch)', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow, gateway_ref: null }]);

      const result = await service.verify(baseTxnRow.transaction_uuid);

      expect(result.state).toBe('UNVERIFIED');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  // ─── Pay redirect + result URLs ─────────────────────────────────────────────

  describe('buildPayRedirect', () => {
    it('302s an INITIATED row to the stored Khalti payment_url', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      const target = await service.buildPayRedirect('demo', baseTxnRow.transaction_uuid);
      expect(target).toBe(`https://test-pay.khalti.com/?pidx=${PIDX}`);
    });

    it('bounces a settled row to the result page instead of re-paying', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow, status: 'VERIFIED' }]);
      const target = await service.buildPayRedirect('demo', baseTxnRow.transaction_uuid);
      expect(target).toContain('/payment/success?');
      expect(target).toContain('gw=khalti');
    });
  });
});
