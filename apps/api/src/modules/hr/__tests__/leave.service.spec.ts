import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LeaveService } from '../leave.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

const baseLeaveTypeRow = {
  id: 'lt-1',
  name: 'Casual Leave',
  days_per_year: 12,
  is_paid: true,
  created_at: new Date('2024-01-01'),
  deleted_at: null,
};

const basePendingLeaveRow = {
  id: 'leave-1',
  user_id: 'user-1',
  leave_type_id: 'lt-1',
  from_date: new Date('2024-02-01'),
  to_date: new Date('2024-02-03'),
  total_days: 3,
  reason: 'Personal',
  status: 'PENDING',
  applied_at: new Date('2024-01-28'),
  reviewed_by: null,
  reviewed_at: null,
  reviewer_note: null,
  created_at: new Date('2024-01-28'),
  updated_at: new Date('2024-01-28'),
  deleted_at: null,
  leave_type_name: 'Casual Leave',
};

describe('LeaveService', () => {
  let service: LeaveService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LeaveService,
        {
          provide: TenantPrismaService,
          useValue: {
            run: jest.fn(),
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue({
              tenantId: 'tenant-1',
              slug: 'test-school',
              schemaName: 'tenant_test',
            }),
          },
        },
      ],
    }).compile();

    service = module.get(LeaveService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    jest.clearAllMocks();
  });

  describe('applyLeave()', () => {
    it('throws ConflictException on overlapping dates', async () => {
      // Overlap check returns count = 1
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ count: '1' }]);

      await expect(
        service.applyLeave(
          { leaveTypeId: 'lt-1', fromDate: '2024-02-02', toDate: '2024-02-04' },
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('inserts leave request when no overlap exists', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ count: '0' }])      // overlap check
        .mockResolvedValueOnce([basePendingLeaveRow]); // insert RETURNING

      const result = await service.applyLeave(
        { leaveTypeId: 'lt-1', fromDate: '2024-02-01', toDate: '2024-02-03' },
        'user-1',
      );

      expect(result.status).toBe('PENDING');
      expect(result.totalDays).toBe(3);
    });
  });

  describe('reviewLeave()', () => {
    it('sets status, reviewedBy, and reviewedAt when request is PENDING', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([basePendingLeaveRow]);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...basePendingLeaveRow,
        status: 'APPROVED',
        reviewed_by: 'reviewer-1',
        reviewed_at: new Date(),
      }]);

      const result = await service.reviewLeave(
        'leave-1',
        { status: 'APPROVED', reviewerNote: 'Approved' },
        'reviewer-1',
      );

      expect(result.status).toBe('APPROVED');
      expect(result.reviewedBy).toBe('reviewer-1');
    });

    it('throws BadRequestException when request is not PENDING', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...basePendingLeaveRow,
        status: 'APPROVED',
      }]);

      await expect(
        service.reviewLeave('leave-1', { status: 'REJECTED' }, 'reviewer-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancelLeave()', () => {
    it('throws BadRequestException when request status is not PENDING', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...basePendingLeaveRow,
        status: 'APPROVED',
        user_id: 'user-1',
      }]);

      await expect(service.cancelLeave('leave-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when cancelling another user\'s request', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
        ...basePendingLeaveRow,
        user_id: 'other-user',
      }]);

      await expect(service.cancelLeave('leave-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('cancels own PENDING request successfully', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([basePendingLeaveRow]);
      (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

      await expect(service.cancelLeave('leave-1', 'user-1')).resolves.not.toThrow();
    });
  });

  describe('getLeaveBalance()', () => {
    it('returns correct remaining days per leave type', async () => {
      // All leave types
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([baseLeaveTypeRow]);
      // Approved days used for this leave type
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ used_days: '5' }]);

      const result = await service.getLeaveBalance('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].leaveTypeId).toBe('lt-1');
      expect(result[0].entitlement).toBe(12);
      expect(result[0].used).toBe(5);
      expect(result[0].balance).toBe(7);
    });
  });
});
