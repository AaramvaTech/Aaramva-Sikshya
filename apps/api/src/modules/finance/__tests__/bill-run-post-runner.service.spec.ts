import { Test } from '@nestjs/testing';
import { BillRunPostRunnerService } from '../bill-run-post-runner.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { LedgerService } from '../ledger.service';
import { BillLineResolverService } from '../bill-line-resolver.service';
import { FinanceSettingsService } from '../finance-settings.service';
import { amountInWords } from '../../../common/money/amount-in-words';
import { Money } from '../../../common/money/money';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const mockRun = {
  id: 'run-1',
  academic_year_id: 'year-1',
  bs_year: 2082,
  bs_month: 4,
  scope: 'CLASS',
  class_id: 'class-1',
  status: 'POSTING',
  issue_date: new Date('2026-07-26'),
  due_date: new Date('2026-08-10'),
  total_students: 1,
  total_gross: '3000.00',
  total_concession: '0.00',
  total_tax: '0.00',
  total_net: '3000.00',
  idempotency_key: 'demo:year-1:4:CLASS:class-1',
  created_by: 'user-1',
  posted_by: 'user-1',
  posted_at: null,
  created_at: new Date('2026-07-26'),
  updated_at: new Date('2026-07-26'),
  deleted_at: null,
};

const mockResolved = {
  outcome: 'DRAFT' as const, skipReason: null,
  gross: 3000, concession: 0, taxableBase: 0, taxRate: null, taxAmount: 0, net: 3000,
  items: [{
    feeHeadId: 'fh-1', transportRouteId: null, itemName: 'Tuition', recurrence: 'MONTHLY', isTaxable: false,
    grossAmount: 3000, concessionAmount: 0, netAmount: 3000, prorationNote: null,
  }],
};

describe('BillRunPostRunnerService', () => {
  let service: BillRunPostRunnerService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let ledgerService: jest.Mocked<LedgerService>;
  let billLineResolverService: jest.Mocked<BillLineResolverService>;
  let financeSettingsService: jest.Mocked<FinanceSettingsService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillRunPostRunnerService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        { provide: TenantContextService, useValue: { getOrThrow: () => ({ tenantId: 't-1', slug: 'demo', schemaName: 'tenant_demo' }) } },
        {
          provide: LedgerService,
          useValue: {
            withStudentLock: jest.fn().mockImplementation((_studentId: string, fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            postEntryInTx: jest.fn(),
          },
        },
        { provide: BillLineResolverService, useValue: { resolve: jest.fn() } },
        { provide: FinanceSettingsService, useValue: { getInvoiceNumberingReset: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillRunPostRunnerService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    ledgerService = module.get(LedgerService) as jest.Mocked<LedgerService>;
    billLineResolverService = module.get(BillLineResolverService) as jest.Mocked<BillLineResolverService>;
    financeSettingsService = module.get(FinanceSettingsService) as jest.Mocked<FinanceSettingsService>;
    jest.clearAllMocks();
    financeSettingsService.getInvoiceNumberingReset.mockResolvedValue({ invoiceNumberingReset: false });
  });

  it('drainCurrentTenant() is a no-op when there are no POSTING runs', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    const result = await service.drainCurrentTenant();
    expect(result).toEqual({ runsProcessed: 0, linesPosted: 0, linesFailed: 0 });
  });

  it('posts a single DRAFT line: invoice + item + ledger entry, one per-student transaction under one lock', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun]) // SELECT bill_runs WHERE status='POSTING'
      .mockResolvedValueOnce([{ id: 'line-1', student_id: 'student-1' }]); // SELECT DRAFT lines

    billLineResolverService.resolve.mockResolvedValueOnce(mockResolved as any);

    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ outcome: 'DRAFT', gross: '3000.00', concession: '0.00', tax: '0.00', net: '3000.00' }]) // re-check line
      .mockResolvedValueOnce([{ sum: '5500.00' }]) // previous balance
      .mockResolvedValueOnce([{ value: BigInt(1) }]) // sequence upsert
      .mockResolvedValueOnce([{ id: 'invoice-1' }]) // bill_invoices insert RETURNING id
      .mockResolvedValueOnce([]); // B5-4 advance-consumption candidates: none

    ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-1' } as any);

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ runsProcessed: 1, linesPosted: 1, linesFailed: 0 });
    expect(financeSettingsService.getInvoiceNumberingReset).toHaveBeenCalledTimes(1);
    expect(ledgerService.withStudentLock).toHaveBeenCalledWith('student-1', expect.any(Function));

    expect(mockTx.$queryRawUnsafe).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO bill_invoices'),
      expect.stringMatching(/^BINV-\d{4}-\d{6}$/),
      'student-1', 'year-1', 'run-1', 2082, 4,
      mockRun.issue_date, mockRun.due_date, 3000, 0, 0,
      null, 0, 3000, 5500, 8500,
      expect.any(String), expect.any(String), 'user-1',
    );

    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bill_invoice_items'),
      'invoice-1', 'fh-1', null, 'Tuition', 'MONTHLY', 3000, 0, false, 3000, null,
    );

    expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({
      studentId: 'student-1', academicYearId: 'year-1', entryType: 'INVOICE',
      debit: '3000.00', credit: '0', refDocType: 'bill_invoice', refDocId: 'invoice-1', createdById: 'user-1',
    }));

    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE bill_invoices SET ledger_entry_id'),
      'ledger-entry-1', 'invoice-1',
    );
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("outcome = 'POSTED'"),
      'line-1', 'invoice-1',
    );

    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'POSTED'"),
      'run-1',
    );
  });

  it('a per-student failure marks that line FAILED and does not abort the run', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([{ id: 'line-1', student_id: 'student-1' }]);

    billLineResolverService.resolve.mockRejectedValueOnce(new Error('catalog data corrupted'));

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ runsProcessed: 1, linesPosted: 0, linesFailed: 1 });
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("outcome = 'FAILED'"),
      'line-1', 'catalog data corrupted',
    );
    // the run still gets marked POSTED — a FAILED line doesn't block completion
    // (retrying FAILED lines is out of this checkpoint's scope, see BILL-BUGS.md)
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'POSTED'"),
      'run-1',
    );
  });

  it('processes two lines independently: one posts, one fails, run still completes', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([
        { id: 'line-1', student_id: 'student-1' },
        { id: 'line-2', student_id: 'student-2' },
      ]);

    billLineResolverService.resolve
      .mockResolvedValueOnce(mockResolved as any)
      .mockRejectedValueOnce(new Error('boom'));

    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ outcome: 'DRAFT', gross: '3000.00', concession: '0.00', tax: '0.00', net: '3000.00' }])
      .mockResolvedValueOnce([{ sum: '5500.00' }])
      .mockResolvedValueOnce([{ value: BigInt(1) }])
      .mockResolvedValueOnce([{ id: 'invoice-1' }])
      .mockResolvedValueOnce([]); // B5-4 advance-consumption candidates: none
    ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-1' } as any);

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ runsProcessed: 1, linesPosted: 1, linesFailed: 1 });
  });

  it('skips a line whose fresh re-check (under the lock) shows it is no longer DRAFT', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([{ id: 'line-1', student_id: 'student-1' }]);

    billLineResolverService.resolve.mockResolvedValueOnce(mockResolved as any);
    mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ outcome: 'POSTED', gross: '3000.00', concession: '0.00', tax: '0.00', net: '3000.00' }]);

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ runsProcessed: 1, linesPosted: 1, linesFailed: 0 });
    expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1); // only the re-check — nothing else ran
  });

  it('marks FAILED (not a silent zero-value invoice) when the fresh resolve() no longer returns DRAFT at post time', async () => {
    // e.g. the assignment was deleted/corrected between draft-generation and posting.
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([{ id: 'line-1', student_id: 'student-1' }]);

    billLineResolverService.resolve.mockResolvedValueOnce({
      outcome: 'SKIPPED_NO_ASSIGNMENT',
      skipReason: 'No active fee structure assignment for this student in the given academic year',
      gross: 0, concession: 0, taxableBase: 0, taxRate: null, taxAmount: 0, net: 0, items: [],
    } as any);

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ runsProcessed: 1, linesPosted: 0, linesFailed: 1 });
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining("outcome = 'FAILED'"),
      'line-1', 'No active fee structure assignment for this student in the given academic year',
    );
    // never reached the lock — no invoice/ledger write was attempted
    expect(ledgerService.withStudentLock).not.toHaveBeenCalled();
  });

  it('uses the RESET-mode fiscal-year key when the tenant setting is enabled', async () => {
    financeSettingsService.getInvoiceNumberingReset.mockResolvedValue({ invoiceNumberingReset: true });
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([{ id: 'line-1', student_id: 'student-1' }]);

    billLineResolverService.resolve.mockResolvedValueOnce(mockResolved as any);
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ outcome: 'DRAFT', gross: '3000.00', concession: '0.00', tax: '0.00', net: '3000.00' }])
      .mockResolvedValueOnce([{ sum: '5500.00' }])
      .mockResolvedValueOnce([{ value: BigInt(1) }])
      .mockResolvedValueOnce([{ id: 'invoice-1' }])
      .mockResolvedValueOnce([]); // B5-4 advance-consumption candidates: none
    ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-1' } as any);

    await service.drainCurrentTenant();

    expect(mockTx.$queryRawUnsafe).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO sequences'),
      expect.stringMatching(/^bill_invoice:demo:\d{4}$/),
    );

    // FIX-RESET-COLLISION: the visible invoice_number must carry the R
    // marker in RESET mode — this is what stops it from ever colliding with
    // a CONTINUOUS-mode number that reached the same underlying seq value.
    const [insertSql, invoiceNumberArg] = mockTx.$queryRawUnsafe.mock.calls[3];
    expect(insertSql).toEqual(expect.stringContaining('INSERT INTO bill_invoices'));
    expect(invoiceNumberArg).toMatch(/^BINV-R\d{4}-\d{6}$/);
  });

  it('BILL-8 finding: amount_in_words reflects total_receivable, not just net — the figure a payer actually owes including any carried-forward balance', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([{ id: 'line-1', student_id: 'student-1' }]);

    billLineResolverService.resolve.mockResolvedValueOnce(mockResolved as any);
    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ outcome: 'DRAFT', gross: '1350.00', concession: '0.00', tax: '0.00', net: '1350.00' }])
      .mockResolvedValueOnce([{ sum: '450.00' }]) // previous balance: student owed 450 before this invoice (Dr)
      .mockResolvedValueOnce([{ value: BigInt(5) }])
      .mockResolvedValueOnce([{ id: 'invoice-5' }])
      .mockResolvedValueOnce([]); // no unconsumed advance payments
    ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-5' } as any);

    await service.drainCurrentTenant();

    const insertArgs = mockTx.$queryRawUnsafe.mock.calls[3];
    const [amountEnArg, amountNeArg] = insertArgs.slice(-3, -1); // amount_in_words_en, amount_in_words_ne ($17, $18)
    // total_receivable = net(1350) + previousBalance(450) = 1800 — the words
    // must say "One Thousand Eight Hundred", never the net-only "One
    // Thousand Three Hundred Fifty" (which a payer clearing the invoice at
    // that figure would still leave 450 outstanding).
    expect(amountEnArg).toBe(amountInWords(Money.fromDb('1800.00'), 'en'));
    expect(amountEnArg).not.toBe(amountInWords(Money.fromDb('1350.00'), 'en'));
    expect(amountNeArg).toBe(amountInWords(Money.fromDb('1800.00'), 'ne'));
  });

  it('posts a DRAFT line for a student holding advance credit: exactly one INVOICE entry (BILL-4 invariant unchanged), advance consumed via a new allocation row (capped at the invoice net, not the full advance), zero new ledger entries for the consumption itself', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([{ id: 'line-1', student_id: 'student-1' }]);

    billLineResolverService.resolve.mockResolvedValueOnce(mockResolved as any);

    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ outcome: 'DRAFT', gross: '3000.00', concession: '0.00', tax: '0.00', net: '3000.00' }]) // re-check line
      .mockResolvedValueOnce([{ sum: '-2000.00' }]) // previous balance: student has 2000 advance credit
      .mockResolvedValueOnce([{ value: BigInt(2) }]) // sequence upsert
      .mockResolvedValueOnce([{ id: 'invoice-2' }]) // bill_invoices insert
      .mockResolvedValueOnce([{ id: 'pay-advance-1', remaining: '2000.00' }]); // unconsumed CLEARED payments, oldest-first

    ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-2' } as any);

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ runsProcessed: 1, linesPosted: 1, linesFailed: 0 });
    // BILL-4's own invariant: exactly one postEntryInTx call (the INVOICE entry) — advance consumption posts NONE.
    expect(ledgerService.postEntryInTx).toHaveBeenCalledTimes(1);
    expect(ledgerService.postEntryInTx).toHaveBeenCalledWith(mockTx, expect.objectContaining({ entryType: 'INVOICE' }));
    // totalReceivable = net(3000) + previousBalance(-2000) = 1000 — only 1000
    // of the 2000 available advance gets consumed, correctly leaving 1000 of
    // the original advance payment unconsumed for a future invoice.
    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bill_payment_allocations'),
      'pay-advance-1', 'invoice-2', '1000.00',
    );
  });

  it('consumes nothing when total_receivable is already <= 0 (pre-existing advance exceeds this invoice charge) — no negative allocation attempted', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([{ id: 'line-1', student_id: 'student-1' }]);

    billLineResolverService.resolve.mockResolvedValueOnce(mockResolved as any);

    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ outcome: 'DRAFT', gross: '3000.00', concession: '0.00', tax: '0.00', net: '3000.00' }])
      .mockResolvedValueOnce([{ sum: '-5000.00' }]) // previous balance: 5000 advance, more than this 3000 charge
      .mockResolvedValueOnce([{ value: BigInt(3) }])
      .mockResolvedValueOnce([{ id: 'invoice-3' }])
      .mockResolvedValueOnce([{ id: 'pay-advance-2', remaining: '5000.00' }]); // candidates ARE found...

    ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-3' } as any);

    const result = await service.drainCurrentTenant();

    // total_receivable = 3000 + (-5000) = -2000 <= 0 -> guarded, zero consumption attempted
    expect(result).toEqual({ runsProcessed: 1, linesPosted: 1, linesFailed: 0 });
    expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bill_payment_allocations'),
      expect.anything(), expect.anything(), expect.anything(),
    );
  });
});
