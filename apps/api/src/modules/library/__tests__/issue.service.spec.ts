import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IssueService } from '../issue.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockTx = {
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
};

const availableCopy = {
  id: 'copy-1',
  book_id: 'book-1',
  copy_number: '001',
  is_available: true,
  condition: 'GOOD',
  deleted_at: null,
};

const activeMember = {
  id: 'member-1',
  member_number: 'LIB-2083-0001',
  max_books: 2,
  is_active: true,
  user_id: null,
  student_id: 'student-1',
  deleted_at: null,
};

const baseIssueRow = {
  id: 'issue-1',
  book_copy_id: 'copy-1',
  member_id: 'member-1',
  issued_by: 'librarian-1',
  issued_at: new Date('2024-01-01'),
  due_date: new Date('2024-02-01'),
  returned_at: null,
  returned_to: null,
  fine_per_day: '5.00',
  fine_days: 0,
  fine_amount: '0.00',
  fine_paid: false,
  status: 'ISSUED',
  notes: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

describe('IssueService', () => {
  let service: IssueService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        IssueService,
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

    service = module.get(IssueService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
    mockTx.$queryRawUnsafe.mockReset();
    mockTx.$executeRawUnsafe.mockReset();
    (tenantPrisma.run as jest.Mock).mockImplementation(
      (fn: (tx: typeof mockTx) => unknown) => fn(mockTx),
    );
  });

  const issueDto = {
    bookCopyId: 'copy-1',
    memberId: 'member-1',
    dueDate: '2025-12-31',
  };

  describe('issueBook()', () => {
    it('throws BadRequestException if copy is not available', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      await expect(service.issueBook(issueDto, 'librarian-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if member is inactive', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([availableCopy])
        .mockResolvedValueOnce([]);

      await expect(service.issueBook(issueDto, 'librarian-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if member has reached borrowing limit', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([availableCopy])
        .mockResolvedValueOnce([activeMember])
        .mockResolvedValueOnce([{ count: '2' }])
        .mockResolvedValueOnce([]);

      await expect(service.issueBook(issueDto, 'librarian-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if member has unpaid fines', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([availableCopy])
        .mockResolvedValueOnce([activeMember])
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([{ id: 'old-issue' }]);

      await expect(service.issueBook(issueDto, 'librarian-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('sets is_available=false on copy in the same transaction', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([availableCopy])
        .mockResolvedValueOnce([activeMember])
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      mockTx.$queryRawUnsafe.mockResolvedValueOnce([baseIssueRow]);
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1);

      const result = await service.issueBook(issueDto, 'librarian-1');

      expect(result.status).toBe('ISSUED');
      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('is_available = false'),
        'copy-1',
      );
    });
  });

  describe('returnBook()', () => {
    it('calculates fine correctly for an overdue return', async () => {
      // 5 days ago as a date-only string (local calendar date). A Date object
      // here carries a time-of-day that the service truncates via toISOString()
      // (UTC), shifting the day count by ±1 depending on the clock/timezone at
      // run time. A date-only string has no time component, so the fine is
      // exactly 5 days regardless of when this test runs.
      const d = new Date();
      d.setDate(d.getDate() - 5);
      const pastDueStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const overdueIssue = { ...baseIssueRow, due_date: pastDueStr };

      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([overdueIssue]);

      const updatedIssue = { ...overdueIssue, status: 'RETURNED', fine_days: 5, fine_amount: '25.00' };
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([updatedIssue]);
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1);

      await service.returnBook('issue-1', {}, 'librarian-1');

      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE book_issues'),
        expect.any(String), // returned_at
        'librarian-1',      // returned_to
        5,                  // fine_days
        25,                 // fine_amount
        'issue-1',          // id
      );
    });

    it('sets fine_days=0 when returned on or before due date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const notOverdueIssue = { ...baseIssueRow, due_date: futureDate };

      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([notOverdueIssue]);

      const updatedIssue = { ...notOverdueIssue, status: 'RETURNED', fine_days: 0, fine_amount: '0.00' };
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([updatedIssue]);
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1);

      await service.returnBook('issue-1', {}, 'librarian-1');

      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE book_issues'),
        expect.any(String),
        'librarian-1',
        0,
        0,
        'issue-1',
      );
    });

    // QA-1 OBS-E-4: returned_at + overdue day-count use Nepal's calendar today.
    // At 2026-07-14 00:30 +05:45 (= 2026-07-13 18:45Z), Nepal is on the 14th but
    // UTC is still the 13th. due 2026-07-10 → 4 days late, fine 4×5=20; and
    // returned_at must be 2026-07-14 (the old code stamped UTC 2026-07-13).
    it('stamps returned_at + fine_days against Nepal-today at the midnight boundary', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 6, 13, 18, 45, 0));
      const overdueIssue = { ...baseIssueRow, due_date: '2026-07-10', fine_per_day: '5.00' };
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([overdueIssue]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ ...overdueIssue, status: 'RETURNED' }]);
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1);

      await service.returnBook('issue-1', {}, 'librarian-1');

      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE book_issues'),
        '2026-07-14', // returned_at = Nepal-today, NOT UTC 2026-07-13
        'librarian-1',
        4,            // fine_days = 2026-07-14 − 2026-07-10
        20,           // fine_amount = 4 × 5
        'issue-1',
      );
      jest.restoreAllMocks();
    });

    it('MON-1: fine_amount (fine_per_day x days) computed via Money, not float multiply', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 6, 13, 18, 45, 0));
      // fine_per_day 12.50 x 3 days late = 37.50 exactly.
      const overdueIssue = { ...baseIssueRow, due_date: '2026-07-11', fine_per_day: '12.50' };
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([overdueIssue]);
      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ ...overdueIssue, status: 'RETURNED' }]);
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1);

      await service.returnBook('issue-1', {}, 'librarian-1');

      expect(mockTx.$queryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE book_issues'),
        '2026-07-14',
        'librarian-1',
        3,     // fine_days
        37.5,  // fine_amount = 3 x 12.50
        'issue-1',
      );
      jest.restoreAllMocks();
    });

    it('sets is_available=true on the copy in the same transaction', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const notOverdueIssue = { ...baseIssueRow, due_date: futureDate };

      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([notOverdueIssue]);

      mockTx.$queryRawUnsafe.mockResolvedValueOnce([{ ...notOverdueIssue, status: 'RETURNED' }]);
      mockTx.$executeRawUnsafe.mockResolvedValueOnce(1);

      await service.returnBook('issue-1', {}, 'librarian-1');

      expect(mockTx.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('is_available = true'),
        'copy-1',
      );
    });
  });

  describe('getOverdueIssues()', () => {
    it('returns only ISSUED records past their due_date', async () => {
      const overdueRow = {
        ...baseIssueRow,
        status: 'ISSUED',
        overdue_days: 3,
        member_number: 'LIB-2083-0001',
        total_count: '1',
      };

      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([overdueRow]);

      const result = await service.getOverdueIssues({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('ISSUED');
    });
  });
});
