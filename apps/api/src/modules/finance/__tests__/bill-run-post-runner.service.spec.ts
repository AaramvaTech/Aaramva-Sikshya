import { Test } from '@nestjs/testing';
import { BillRunPostRunnerService } from '../bill-run-post-runner.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { LedgerService } from '../ledger.service';
import { FeePreviewService } from '../fee-preview.service';

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

const mockPreview = {
  studentId: 'student-1', feeStructureId: 'fs-1', feeStructureName: 'proof structure',
  academicYearId: 'year-1', asOfDate: '2025-07-01',
  heads: [{
    feeHeadId: 'fh-1', feeHeadName: 'Tuition', grossAmount: 3000,
    overrideAmount: null, effectiveBase: 3000, concessions: [], netAmount: 3000,
  }],
  transport: null, wholeBillConcessions: [],
  grossTotal: 3000, concessionTotal: 0, netTotal: 3000,
};

describe('BillRunPostRunnerService', () => {
  let service: BillRunPostRunnerService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let ledgerService: jest.Mocked<LedgerService>;
  let feePreviewService: jest.Mocked<FeePreviewService>;

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
        { provide: FeePreviewService, useValue: { preview: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillRunPostRunnerService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    ledgerService = module.get(LedgerService) as jest.Mocked<LedgerService>;
    feePreviewService = module.get(FeePreviewService) as jest.Mocked<FeePreviewService>;
    jest.clearAllMocks();
  });

  it('drainCurrentTenant() is a no-op when there are no POSTING runs', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
    const result = await service.drainCurrentTenant();
    expect(result).toEqual({ runsProcessed: 0, linesPosted: 0, linesFailed: 0 });
  });

  it('posts a single DRAFT line: invoice + item + ledger entry, one per-student transaction under one lock', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun]) // SELECT bill_runs WHERE status='POSTING'
      .mockResolvedValueOnce([{ id: 'line-1', student_id: 'student-1' }]) // SELECT DRAFT lines
      .mockResolvedValueOnce([{ id: 'fh-1', is_taxable: false, recurrence: 'MONTHLY' }]); // fee_heads metadata

    feePreviewService.preview.mockResolvedValueOnce(mockPreview as any);

    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ outcome: 'DRAFT', gross: '3000.00', concession: '0.00', net: '3000.00' }]) // re-check line
      .mockResolvedValueOnce([{ sum: '5500.00' }]) // previous balance
      .mockResolvedValueOnce([{ value: BigInt(1) }]) // sequence upsert
      .mockResolvedValueOnce([{ id: 'invoice-1' }]); // bill_invoices insert RETURNING id

    ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-1' } as any);

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ runsProcessed: 1, linesPosted: 1, linesFailed: 0 });
    expect(ledgerService.withStudentLock).toHaveBeenCalledWith('student-1', expect.any(Function));

    expect(mockTx.$queryRawUnsafe).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('INSERT INTO bill_invoices'),
      expect.stringMatching(/^BINV-\d{4}-\d{6}$/),
      'student-1', 'year-1', 'run-1', 2082, 4,
      mockRun.issue_date, mockRun.due_date, 3000, 0, 3000,
      3000, 5500, 8500,
      expect.any(String), expect.any(String), 'user-1',
    );

    expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bill_invoice_items'),
      'invoice-1', 'fh-1', 'Tuition', 'MONTHLY', 3000, 0, false, 3000,
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

    feePreviewService.preview.mockRejectedValueOnce(new Error('catalog data corrupted'));

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
      ])
      .mockResolvedValueOnce([{ id: 'fh-1', is_taxable: false, recurrence: 'MONTHLY' }]);

    feePreviewService.preview
      .mockResolvedValueOnce(mockPreview as any)
      .mockRejectedValueOnce(new Error('boom'));

    mockTx.$queryRawUnsafe
      .mockResolvedValueOnce([{ outcome: 'DRAFT', gross: '3000.00', concession: '0.00', net: '3000.00' }])
      .mockResolvedValueOnce([{ sum: '5500.00' }])
      .mockResolvedValueOnce([{ value: BigInt(1) }])
      .mockResolvedValueOnce([{ id: 'invoice-1' }]);
    ledgerService.postEntryInTx.mockResolvedValueOnce({ id: 'ledger-entry-1' } as any);

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ runsProcessed: 1, linesPosted: 1, linesFailed: 1 });
  });

  it('skips a line whose fresh re-check (under the lock) shows it is no longer DRAFT', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockRun])
      .mockResolvedValueOnce([{ id: 'line-1', student_id: 'student-1' }])
      .mockResolvedValueOnce([{ id: 'fh-1', is_taxable: false, recurrence: 'MONTHLY' }]);

    feePreviewService.preview.mockResolvedValueOnce(mockPreview as any);
    mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ outcome: 'POSTED', gross: '3000.00', concession: '0.00', net: '3000.00' }]);

    const result = await service.drainCurrentTenant();

    expect(result).toEqual({ runsProcessed: 1, linesPosted: 1, linesFailed: 0 });
    expect(ledgerService.postEntryInTx).not.toHaveBeenCalled();
    expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1); // only the re-check — nothing else ran
  });
});
