import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EsewaService } from '../esewa/esewa.service';
import { BillPaymentService } from '../bill-payment.service';
import { LedgerService } from '../ledger.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { Role } from '../../common/enums/role.enum';
import { GuardianScopeService } from '../../student/guardian-scope.service';
import type { AuthUser } from '../../auth/auth.types';
import { guardSurvivingMocks } from '../../../testing/mock-leak-guard';

const mockTx = guardSurvivingMocks({
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
});

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

// bill_invoices row + the join-computed `own_balance` column (CLEARED-only
// allocation sum subtracted from NET_AMOUNT — BILL-CHECKOUT-1 repointed this
// off total_receivable, which carried every earlier unpaid month into the
// figure the gateway signs (BILLING-CALC-AUDIT-1 D32).
const baseBillInvoiceRow = {
  id: 'inv-1',
  invoice_number: 'BINV-2081-000001',
  student_id: 'student-1',
  academic_year_id: 'year-1',
  due_date: new Date('2025-07-15'),
  status: 'PARTIALLY_PAID',
  // The D32 shape: this invoice's own charge is 800, but it restates 200 of
  // arrears, so total_receivable is 1000. Only the 800 is ever chargeable.
  net_amount: '800.00',
  previous_balance: '200.00',
  total_receivable: '1000.00',
  own_balance: '600.00', // net_amount 800 less 200 already allocated — the ONLY chargeable figure
  created_by: 'user-1',
  created_at: new Date('2025-07-01'),
  updated_at: new Date('2025-07-01'),
  deleted_at: null,
};

const baseTxnRow = {
  id: 'txn-row-1',
  invoice_id: null,
  bill_invoice_id: 'inv-1',
  gateway: 'ESEWA',
  transaction_uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  amount: '600.00',
  status: 'INITIATED',
  gateway_ref: null,
  failure_reason: null,
  raw_payload: {},
  payment_id: null,
  bill_payment_id: null,
  initiated_by: 'parent-1',
  verified_at: null,
  created_at: new Date(), // fresh by default; tests override for expiry
  updated_at: new Date(),
};

const baseBillPaymentResult = {
  id: 'bp-1',
  receiptNumber: 'RCPT-2081-000001',
  studentId: 'student-1',
  academicYearId: 'year-1',
  amount: 600,
  method: 'ESEWA',
  status: 'CLEARED',
  receivedDate: '2025-07-01',
  receivedBs: null,
  reference: '0007G36',
  chequeBank: null,
  chequeDate: null,
  allocationMode: 'MANUAL',
  ledgerEntryId: 'ledger-1',
  gatewayTxnRef: null,
  notes: 'eSewa online payment',
  receivedBy: 'parent-1',
  createdAt: new Date().toISOString(),
  clearedAt: new Date().toISOString(),
  clearedBy: 'parent-1',
  bouncedAt: null,
  bouncedBy: null,
  bounceReason: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
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
  const billPaymentService = {
    recordPaymentInTx: jest.fn().mockResolvedValue(baseBillPaymentResult),
  };
  const ledgerService = {
    withStudentLock: jest.fn().mockImplementation((_studentId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
  };
  const guardianScope = { assertOwnsStudent: jest.fn() };
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
      { provide: BillPaymentService, useValue: billPaymentService },
      { provide: LedgerService, useValue: ledgerService },
      { provide: GuardianScopeService, useValue: guardianScope },
      {
        provide: ConfigService,
        useValue: { get: jest.fn((key: string) => env[key]) },
      },
    ],
  }).compile();

  return {
    service: module.get(EsewaService),
    tenantPrisma,
    billPaymentService,
    ledgerService,
    guardianScope,
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

  // ─── Initiate: amounts come from the server, invoices come from bill_invoices ──

  describe('initiate', () => {
    it('charges the bill_invoice outstanding balance, never a client amount', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseBillInvoiceRow }]);

      const result = await service.initiate({ invoiceId: 'inv-1' }, accountantUser);

      expect(tenantPrisma.query.mock.calls[0][0]).toContain('FROM bill_invoices');

      // INSERT got the server-computed outstanding (600), not total_receivable (1000),
      // and set bill_invoice_id (not invoice_id).
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payment_transactions'),
        'inv-1',
        result.transactionUuid,
        600,
        accountantUser.userId,
      );
      const insertSql = tenantPrisma.execute.mock.calls[0][0] as string;
      expect(insertSql).toContain('bill_invoice_id');
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

    it('rejects a bill_invoice with no outstanding balance', async () => {
      const { service, tenantPrisma } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseBillInvoiceRow, status: 'SETTLED', own_balance: '0.00' },
      ]);
      await expect(
        service.initiate({ invoiceId: 'inv-1' }, accountantUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('PARENT can only initiate for own children (guardians linkage)', async () => {
      const { service, tenantPrisma, guardianScope } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseBillInvoiceRow }]); // bill_invoice
      guardianScope.assertOwnsStudent.mockRejectedValueOnce(new ForbiddenException());
      await expect(
        service.initiate({ invoiceId: 'inv-1' }, parentUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tenantPrisma.execute).not.toHaveBeenCalled();
    });

    it('PARENT with matching guardian row initiates fine', async () => {
      const { service, tenantPrisma, guardianScope } = await makeService(ENABLED_ENV);
      guardianScope.assertOwnsStudent.mockResolvedValueOnce(undefined);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseBillInvoiceRow }]);
      const result = await service.initiate({ invoiceId: 'inv-1' }, parentUser);
      expect(result.transactionUuid).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  // ─── Verify: exactly-once credit into bill_payments ────────────────────────

  describe('verify', () => {
    it('COMPLETE status-check credits the bill_invoice exactly once (double callback)', async () => {
      const { service, tenantPrisma, billPaymentService, ledgerService } = await makeService(ENABLED_ENV);

      // First callback: INITIATED row, gateway confirms COMPLETE
      tenantPrisma.query
        .mockResolvedValueOnce([{ ...baseTxnRow }]) // loadTransaction
        .mockResolvedValueOnce([{ student_id: 'student-1', academic_year_id: 'year-1' }]) // bill_invoices lookup (creditOnce)
        .mockResolvedValueOnce([
          { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' },
        ]); // fresh re-read
      mockFetchOnce({
        product_code: 'EPAYTEST',
        transaction_uuid: baseTxnRow.transaction_uuid,
        total_amount: 600.0,
        status: 'COMPLETE',
        ref_id: '0007G36',
      });
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([
          { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' },
        ]) // conditional claim wins
        .mockResolvedValueOnce([{ own_balance: '600.00' }]); // outstanding unchanged since initiate

      const first = await service.verify(baseTxnRow.transaction_uuid, { hint: true });
      expect(first.state).toBe('VERIFIED');
      expect(ledgerService.withStudentLock).toHaveBeenCalledTimes(1);
      expect(ledgerService.withStudentLock).toHaveBeenCalledWith('student-1', expect.any(Function));
      expect(billPaymentService.recordPaymentInTx).toHaveBeenCalledTimes(1);
      expect(billPaymentService.recordPaymentInTx).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          studentId: 'student-1',
          academicYearId: 'year-1',
          method: 'ESEWA',
          allocationMode: 'MANUAL',
          targets: [{ billInvoiceId: 'inv-1', amount: '600.00' }],
        }),
        'parent-1',
      );
      expect(billPaymentService.recordPaymentInTx.mock.calls[0][1].amount.toDb()).toBe('600.00');

      // Replayed callback: row is already VERIFIED — no status-check, no credit
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' },
      ]);
      const second = await service.verify(baseTxnRow.transaction_uuid, { hint: true });
      expect(second.state).toBe('ALREADY_VERIFIED');
      expect(global.fetch).toHaveBeenCalledTimes(1); // still just the first check
      expect(billPaymentService.recordPaymentInTx).toHaveBeenCalledTimes(1); // unchanged
    });

    it('outstanding shrank since initiate (e.g. a cash payment landed first): caps the MANUAL target, remainder becomes advance', async () => {
      const { service, tenantPrisma, billPaymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query
        .mockResolvedValueOnce([{ ...baseTxnRow }]) // loadTransaction
        .mockResolvedValueOnce([{ student_id: 'student-1', academic_year_id: 'year-1' }]) // bill_invoices lookup
        .mockResolvedValueOnce([
          { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' },
        ]); // fresh re-read
      mockFetchOnce({ total_amount: 600, status: 'COMPLETE', ref_id: '0007G36' });
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([
          { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' },
        ]) // claim
        .mockResolvedValueOnce([{ own_balance: '200.00' }]); // shrank: a cash payment already covered 400

      const result = await service.verify(baseTxnRow.transaction_uuid);

      expect(result.state).toBe('VERIFIED');
      expect(billPaymentService.recordPaymentInTx).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          allocationMode: 'MANUAL',
          targets: [{ billInvoiceId: 'inv-1', amount: '200.00' }],
        }),
        'parent-1',
      );
      // The full claimed amount (600) is still recorded on the payment — only
      // 200 is allocated to the invoice; the remaining 400 lands as advance
      // credit (B5-7: overpayment becomes advance, never rejected).
      expect(billPaymentService.recordPaymentInTx.mock.calls[0][1].amount.toDb()).toBe('600.00');
    });

    it('invoice already fully settled by another channel by the time of credit: falls back to ADVANCE_ONLY for the full amount', async () => {
      const { service, tenantPrisma, billPaymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query
        .mockResolvedValueOnce([{ ...baseTxnRow }])
        .mockResolvedValueOnce([{ student_id: 'student-1', academic_year_id: 'year-1' }])
        .mockResolvedValueOnce([
          { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' },
        ]);
      mockFetchOnce({ total_amount: 600, status: 'COMPLETE', ref_id: '0007G36' });
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([
          { ...baseTxnRow, status: 'VERIFIED', gateway_ref: '0007G36' },
        ])
        .mockResolvedValueOnce([{ own_balance: '0.00' }]); // fully settled already

      const result = await service.verify(baseTxnRow.transaction_uuid);

      expect(result.state).toBe('VERIFIED');
      expect(billPaymentService.recordPaymentInTx).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({ allocationMode: 'ADVANCE_ONLY', targets: undefined }),
        'parent-1',
      );
      expect(billPaymentService.recordPaymentInTx.mock.calls[0][1].amount.toDb()).toBe('600.00');
    });

    it('concurrent race: losing claim records no payment', async () => {
      const { service, tenantPrisma, billPaymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query
        .mockResolvedValueOnce([{ ...baseTxnRow }])
        .mockResolvedValueOnce([{ student_id: 'student-1', academic_year_id: 'year-1' }])
        .mockResolvedValueOnce([{ ...baseTxnRow, status: 'VERIFIED' }]);
      mockFetchOnce({ total_amount: 600, status: 'COMPLETE', ref_id: '0007G36' });
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([]); // claim lost the race

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('ALREADY_VERIFIED');
      expect(billPaymentService.recordPaymentInTx).not.toHaveBeenCalled();
    });

    it('COMPLETE with a mismatched amount fails the transaction and never credits', async () => {
      const { service, tenantPrisma, billPaymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      mockFetchOnce({ total_amount: 599, status: 'COMPLETE', ref_id: '0007G36' });
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseTxnRow, status: 'FAILED', failure_reason: 'amount-mismatch' },
      ]);

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('FAILED');
      expect(billPaymentService.recordPaymentInTx).not.toHaveBeenCalled();
      expect(tenantPrisma.execute).toHaveBeenCalledWith(
        expect.stringContaining(`SET status = 'FAILED'`),
        baseTxnRow.id,
        expect.stringContaining('amount-mismatch'),
      );
    });

    it('PENDING leaves the row INITIATED', async () => {
      const { service, tenantPrisma, billPaymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      mockFetchOnce({ total_amount: 600, status: 'PENDING', ref_id: null });

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('PENDING');
      expect(result.status).toBe('INITIATED');
      expect(billPaymentService.recordPaymentInTx).not.toHaveBeenCalled();
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
      const { service, tenantPrisma, billPaymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([
        { ...baseTxnRow, created_at: new Date(Date.now() - 20 * 60_000) },
      ]);
      mockFetchOnce({ total_amount: 600, status: 'NOT_FOUND', ref_id: null });

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('EXPIRED');
      expect(billPaymentService.recordPaymentInTx).not.toHaveBeenCalled();
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
      const { service, tenantPrisma, billPaymentService } = await makeService(ENABLED_ENV);
      tenantPrisma.query.mockResolvedValueOnce([{ ...baseTxnRow }]);
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await service.verify(baseTxnRow.transaction_uuid);
      expect(result.state).toBe('UNVERIFIED');
      expect(result.status).toBe('INITIATED');
      expect(billPaymentService.recordPaymentInTx).not.toHaveBeenCalled();
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

// ─── BILL-CHECKOUT-1 ─────────────────────────────────────────────────────────

describe('EsewaService — the charged figure is the invoice\'s OWN balance (D32)', () => {
  it('initiate reads net_amount and never total_receivable', async () => {
    const { service, tenantPrisma } = await makeService(ENABLED_ENV);
    tenantPrisma.query.mockResolvedValueOnce([{ ...baseBillInvoiceRow }]);

    const result = await service.initiate({ invoiceId: 'inv-1' }, accountantUser);

    const sql = tenantPrisma.query.mock.calls[0][0] as string;
    expect(sql).toContain('bi.net_amount');
    expect(sql).not.toContain('total_receivable');
    // 600 = net_amount 800 - 200 allocated. NOT 1000 (total_receivable), and
    // NOT 800 (own charge before allocations).
    expect(result.amount).toBe(600);
  });

  // Lexical guard over BOTH gateway files, covering all four call sites —
  // the two initiates AND the two claim-path race guards. The mocked-service
  // tests above can only reach initiate; a revert inside verify()'s locked
  // transaction would sail past them. Same shape as no-float-coercion.spec.ts:
  // a rule this codebase cares about, enforced by reading the source.
  //
  // If initiate and the claim guard ever disagreed on which figure to use,
  // the allocation would over-book the invoice all over again — which is
  // exactly how BINV-2083-000004 ended up with 4,260 booked against a 2,260
  // charge (BILLING-CALC-AUDIT-1 Ruling 3).
  it.each([
    ['esewa/esewa.service.ts'],
    ['khalti/khalti.service.ts'],
  ])('%s reads total_receivable nowhere in its executable code', (relPath) => {
    const src = readFileSync(join(__dirname, '..', relPath), 'utf8');
    // Comments are stripped first: both files deliberately NAME
    // total_receivable in prose to explain why they must not read it, and a
    // guard that banned the word outright would ban its own rationale.
    // no-float-coercion.spec.ts hits the same self-reference problem and
    // solves it by excluding itself by filename.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[^\n]*?\/\/.*$/gm, '');
    expect(code).not.toContain('total_receivable');
    // ...and does reach for the shared rule rather than re-spelling the SQL.
    expect(code).toContain('OWN_BALANCE_SELECT');
    expect(code).toContain('clampOwnBalance');
  });

  it('the comment-stripper does not neuter the guard', () => {
    // Without this, a bug in the regex above would silently turn the real
    // assertion into a no-op — the exact "assertion that cannot fail" shape
    // BILLING-CALC-AUDIT-1 catalogued (D14/D18/D36).
    const src = readFileSync(join(__dirname, '..', 'esewa/esewa.service.ts'), 'utf8');
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n]*?\/\/.*$/gm, '');
    expect(strip(`${src}\nconst x = bi.total_receivable;`)).toContain('total_receivable');
  });
});
