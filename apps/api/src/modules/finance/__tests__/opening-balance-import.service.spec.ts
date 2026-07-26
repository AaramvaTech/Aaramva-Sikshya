import { Test } from '@nestjs/testing';
import { OpeningBalanceImportService } from '../opening-balance-import.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { LedgerService } from '../ledger.service';

describe('OpeningBalanceImportService', () => {
  let service: OpeningBalanceImportService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let ledgerService: jest.Mocked<LedgerService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OpeningBalanceImportService,
        { provide: TenantPrismaService, useValue: { query: jest.fn() } },
        { provide: LedgerService, useValue: { openingBalance: jest.fn() } },
      ],
    }).compile();

    service = module.get(OpeningBalanceImportService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    ledgerService = module.get(LedgerService) as jest.Mocked<LedgerService>;
    jest.clearAllMocks();
  });

  describe('preview', () => {
    it('marks a row valid when the student and year exist, the amount is non-zero, and no opening balance exists yet', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }]) // student exists
        .mockResolvedValueOnce([{ id: 'year-1' }])    // year exists
        .mockResolvedValueOnce([]);                    // no existing opening balance

      const result = await service.preview({
        rows: [{ studentId: 'student-1', academicYearId: 'year-1', amount: '1000.00', direction: 'DEBIT' }],
      });

      expect(result.rows[0].status).toBe('valid');
      expect(result.summary).toEqual({ total: 1, valid: 1, invalid: 0, duplicate: 0 });
    });

    it('marks a row invalid when the student does not exist', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([]) // student not found
        .mockResolvedValueOnce([{ id: 'year-1' }]);

      const result = await service.preview({
        rows: [{ studentId: 'missing', academicYearId: 'year-1', amount: '1000.00', direction: 'DEBIT' }],
      });

      expect(result.rows[0].status).toBe('invalid');
      expect(result.rows[0].errors).toContain('Student not found');
      expect(result.summary.invalid).toBe(1);
    });

    it('marks a row invalid when the amount is zero', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([{ id: 'year-1' }]);

      const result = await service.preview({
        rows: [{ studentId: 'student-1', academicYearId: 'year-1', amount: '0.00', direction: 'DEBIT' }],
      });

      expect(result.rows[0].status).toBe('invalid');
      expect(result.rows[0].errors).toContain('Amount must be greater than zero');
    });

    it('marks a row duplicate when an opening balance already exists for that student/year', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([{ id: 'existing-entry' }]);

      const result = await service.preview({
        rows: [{ studentId: 'student-1', academicYearId: 'year-1', amount: '1000.00', direction: 'DEBIT' }],
      });

      expect(result.rows[0].status).toBe('duplicate');
      expect(result.summary.duplicate).toBe(1);
    });

    it('creates zero rows — every check is a SELECT, never a write (invariant 6)', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([]);

      await service.preview({
        rows: [{ studentId: 'student-1', academicYearId: 'year-1', amount: '1000.00', direction: 'DEBIT' }],
      });

      expect(ledgerService.openingBalance).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    it('posts only the valid rows and skips invalid/duplicate ones with a reason', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }]) // row 1: student ok
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([])                     // row 1: no existing opening balance -> valid
        .mockResolvedValueOnce([])                     // row 2: student not found -> invalid
        .mockResolvedValueOnce([{ id: 'year-1' }]);
      (ledgerService.openingBalance as jest.Mock).mockResolvedValueOnce({ id: 'entry-1' });

      const result = await service.confirm(
        {
          rows: [
            { studentId: 'student-1', academicYearId: 'year-1', amount: '1000.00', direction: 'DEBIT' },
            { studentId: 'missing', academicYearId: 'year-1', amount: '500.00', direction: 'CREDIT' },
          ],
        },
        'user-1',
      );

      expect(result.summary).toEqual({ created: 1, skipped: 1 });
      expect(result.created[0]).toMatchObject({ rowNumber: 1, entryId: 'entry-1', studentId: 'student-1' });
      expect(result.skipped[0]).toMatchObject({ rowNumber: 2 });
      expect(ledgerService.openingBalance).toHaveBeenCalledTimes(1);
    });

    it('re-validates fresh rather than trusting a client-supplied prior preview', async () => {
      // A row that would have been valid a moment ago now collides (someone else imported it first).
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }])
        .mockResolvedValueOnce([{ id: 'year-1' }])
        .mockResolvedValueOnce([{ id: 'now-existing-entry' }]); // duplicate on re-check

      const result = await service.confirm(
        { rows: [{ studentId: 'student-1', academicYearId: 'year-1', amount: '1000.00', direction: 'DEBIT' }] },
        'user-1',
      );

      expect(result.summary).toEqual({ created: 0, skipped: 1 });
      expect(ledgerService.openingBalance).not.toHaveBeenCalled();
    });
  });
});
