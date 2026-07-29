import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LedgerService } from '../ledger.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { Role } from '../../common/enums/role.enum';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

function makeEntryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    student_id: 'student-1',
    academic_year_id: 'year-1',
    entry_date: new Date('2026-04-14'),
    entry_bs_year: 2083,
    entry_bs_month: 1,
    entry_bs_day: 1,
    entry_type: 'ADJUSTMENT',
    debit: '500.00',
    credit: '0.00',
    ref_doc_type: null,
    ref_doc_id: null,
    narration: 'test',
    reverses_entry_id: null,
    created_by: 'user-1',
    created_at: new Date('2026-04-14'),
    ...overrides,
  };
}

describe('LedgerService', () => {
  let service: LedgerService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LedgerService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn().mockImplementation((fn: (tx: typeof mockTx) => unknown) => fn(mockTx)),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(LedgerService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  describe('postEntry', () => {
    it('takes the advisory lock before inserting, then updates the balance cache in the same transaction', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([makeEntryRow()]); // insert RETURNING
      const result = await service.postEntry({
        studentId: 'student-1', academicYearId: 'year-1', entryType: 'ADJUSTMENT',
        debit: '500.00', credit: '0', createdById: 'user-1',
      });

      expect(mockTx.$executeRawUnsafe.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_ledger_entries'),
        expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(),
        'ADJUSTMENT', '500.00', '0', null, null, null, null, 'user-1',
      );
      // balance bump happens after the insert, in the same lock/transaction
      expect(mockTx.$executeRawUnsafe.mock.calls[1][0]).toContain('student_account_balances');
      expect(result.debit).toBe(500);
      expect(result.credit).toBe(0);
    });
  });

  describe('postEntryInTx', () => {
    it('inserts the entry and bumps the balance without acquiring its own lock (caller already holds one)', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([makeEntryRow()]); // insert RETURNING

      const result = await service.postEntryInTx(mockTx as any, {
        studentId: 'student-1', academicYearId: 'year-1', entryType: 'INVOICE',
        debit: '3000.00', credit: '0', createdById: 'user-1',
      });

      // no pg_advisory_xact_lock call — postEntryInTx trusts the caller's own lock
      expect(mockTx.$executeRawUnsafe).not.toHaveBeenCalledWith(
        expect.stringContaining('pg_advisory_xact_lock'),
        expect.anything(),
      );
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_ledger_entries'),
        expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(),
        'INVOICE', '3000.00', '0', null, null, null, null, 'user-1',
      );
      expect(mockTx.$executeRawUnsafe.mock.calls[0][0]).toContain('student_account_balances');
      expect(result.debit).toBe(500); // makeEntryRow's fixed row value, not asserting on debit param
    });
  });

  describe('withStudentLock', () => {
    it('is exposed publicly so other services can compose a bigger transaction under the same per-student lock', () => {
      expect(typeof service.withStudentLock).toBe('function');
    });
  });

  describe('openingBalance', () => {
    it('rejects a second opening balance for the same student/year (duplicate guard under the lock)', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'existing-entry' }]); // duplicate check finds one
      await expect(
        service.openingBalance('student-1', 'year-1', '1000.00', 'DEBIT', undefined, 'user-1'),
      ).rejects.toThrow(ConflictException);
      // no insert attempted after the duplicate is found
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('posts a DEBIT opening balance when none exists yet', async () => {
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([]) // no existing opening balance
        .mockResolvedValueOnce([makeEntryRow({ entry_type: 'OPENING_BALANCE', debit: '1000.00', credit: '0' })]);
      const result = await service.openingBalance('student-1', 'year-1', '1000.00', 'DEBIT', 'Carried forward', 'user-1');
      expect(result.entryType).toBe('OPENING_BALANCE');
      expect(result.debit).toBe(1000);
    });
  });

  describe('adjustment', () => {
    it('combines reason and narration into the single narration column', async () => {
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([
        makeEntryRow({ narration: '[Fee waiver] Approved by principal' }),
      ]);
      await service.adjustment(
        { studentId: 'student-1', academicYearId: 'year-1', amount: '500', direction: 'CREDIT', reason: 'Fee waiver', narration: 'Approved by principal' },
        'user-1',
      );
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_ledger_entries'),
        expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything(),
        'ADJUSTMENT', '0', '500', null, null, '[Fee waiver] Approved by principal', null, 'user-1',
      );
    });
  });

  describe('reverse', () => {
    it('404s when the original entry does not exist', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.reverse('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('409s when the entry has already been reversed', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([makeEntryRow()]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'existing-reversal' }]);
      await expect(service.reverse('entry-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('mirrors the original with debit/credit swapped, leaving the net balance unchanged (invariant 4)', async () => {
      const original = makeEntryRow({ debit: '500.00', credit: '0.00' });
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([original]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([]) // not already reversed
        .mockResolvedValueOnce([
          makeEntryRow({ id: 'entry-2', debit: '0.00', credit: '500.00', reverses_entry_id: 'entry-1' }),
        ]);

      const mirror = await service.reverse('entry-1', 'user-1');

      expect(mirror.debit).toBe(0);
      expect(mirror.credit).toBe(500);
      expect(mirror.reversesEntryId).toBe('entry-1');
      // original's net effect was +500 (debit); the mirror's net effect must be exactly -500.
      expect(mirror.debit - mirror.credit).toBe(-500);
    });
  });

  describe('reverseInTx', () => {
    it('takes the already-fetched original row (no re-fetch) and mirrors it, composed into the caller-owned tx, no separate lock', async () => {
      const original = makeEntryRow({ debit: '500.00', credit: '0.00' });
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([]) // not already reversed
        .mockResolvedValueOnce([
          makeEntryRow({ id: 'entry-2', debit: '0.00', credit: '500.00', reverses_entry_id: 'entry-1' }),
        ]);

      const result = await service.reverseInTx(mockTx as any, original as any, 'user-2');

      expect(result.debit).toBe(0);
      expect(result.credit).toBe(500);
      expect(result.reversesEntryId).toBe('entry-1');
      // no fresh SELECT of the original entry — reverseInTx trusts the caller's row
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(2); // already-reversed check + insert RETURNING
    });

    it('409s when the entry has already been reversed, without ever inserting', async () => {
      const original = makeEntryRow({ debit: '500.00', credit: '0.00' });
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ id: 'existing-reversal' }]);

      await expect(service.reverseInTx(mockTx as any, original as any, 'user-2')).rejects.toThrow(ConflictException);
      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStudentLedger', () => {
    it('rejects a PARENT who does not own the student', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ student_id: 'someone-else' }]);
      await expect(
        service.getStudentLedger('student-1', {}, 'parent-1', Role.PARENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns a paginated statement with running balance for an owning PARENT', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ student_id: 'student-1' }]) // ownership check
        .mockResolvedValueOnce([{ ...makeEntryRow(), running_balance: '500.00', total_count: '1' }]);
      const result = await service.getStudentLedger('student-1', { page: 1, limit: 20 }, 'parent-1', Role.PARENT);
      expect(result.data[0].runningBalance).toBe(500);
      expect(result.meta.total).toBe(1);
    });

    it('ACCOUNTANT_AND_ABOVE callers skip the ownership check entirely', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ ...makeEntryRow(), total_count: '1' }]);
      await service.getStudentLedger('student-1', {}, 'accountant-1', Role.ACCOUNTANT);
      expect(tenantPrisma.query).toHaveBeenCalledTimes(1); // only the statement query, no ownership SELECT
    });
  });

  describe('getBalance', () => {
    it.each([
      ['500.00', 'OWES'],
      ['-500.00', 'ADVANCE'],
      ['0.00', 'ZERO'],
    ])('sum=%s -> sign=%s', async (sum, expectedSign) => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ sum }]);
      const result = await service.getBalance('student-1');
      expect(result.sign).toBe(expectedSign);
    });
  });

  describe('reconcile', () => {
    it('corrects and reports drift when the cache disagrees with the SQL sum', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ student_id: 'student-1' }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ sum: '1000.00' }]) // ledger truth
        .mockResolvedValueOnce([{ balance: '800.00' }]) // stale cache
        .mockResolvedValueOnce([{ academic_year_id: 'year-1', id: 'entry-9' }]); // latest entry for the correction

      const result = await service.reconcile();

      expect(result.checked).toBe(1);
      expect(result.drifted).toEqual(['student-1']);
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('student_account_balances'),
        'student-1', 'year-1', '1000.00', 'entry-9',
      );
    });

    it('does not touch the cache when it already matches the SQL sum', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ student_id: 'student-1' }]);
      mockTx.$queryRawUnsafe
        .mockResolvedValueOnce([{ sum: '1000.00' }])
        .mockResolvedValueOnce([{ balance: '1000.00' }]);

      const result = await service.reconcile();

      expect(result.drifted).toEqual([]);
      // The advisory lock still fires ($executeRawUnsafe call #1), but no
      // correction UPDATE against student_account_balances follows it.
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      expect(mockTx.$executeRawUnsafe.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    });
  });
});
