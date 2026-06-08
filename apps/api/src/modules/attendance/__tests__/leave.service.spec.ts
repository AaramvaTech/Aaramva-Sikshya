import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LeaveService } from '../leave.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockLeaveRow = {
  id: 'leave-1',
  student_id: 'student-1',
  academic_year_id: 'year-1',
  from_date: new Date('2024-04-15'),
  to_date: new Date('2024-04-17'),
  reason: 'Sick leave',
  status: 'PENDING',
  applied_by: 'parent-1',
  reviewed_by: null,
  reviewed_at: null,
  created_at: new Date('2024-04-14T00:00:00Z'),
  updated_at: new Date('2024-04-14T00:00:00Z'),
  deleted_at: null,
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
            query: jest.fn(),
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(LeaveService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;

    jest.clearAllMocks();
  });

  describe('applyLeave()', () => {
    it('creates a PENDING leave application record', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockLeaveRow]);

      const result = await service.applyLeave(
        {
          studentId: 'student-1',
          academicYearId: 'year-1',
          fromDate: '2024-04-15',
          toDate: '2024-04-17',
          reason: 'Sick leave',
        },
        'parent-1',
      );

      expect(result.status).toBe('PENDING');
      expect(result.reviewedBy).toBeNull();
      expect(result.reviewedAt).toBeNull();
    });
  });

  describe('reviewLeave()', () => {
    it('sets status to APPROVED and records reviewedBy + reviewedAt', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockLeaveRow]) // findOne (PENDING)
        .mockResolvedValueOnce([{ ...mockLeaveRow, status: 'APPROVED', reviewed_by: 'principal-1', reviewed_at: new Date() }]);

      const result = await service.reviewLeave(
        'leave-1',
        { status: 'APPROVED' },
        'principal-1',
      );

      expect(result.status).toBe('APPROVED');
      expect(result.reviewedBy).toBe('principal-1');
      expect(result.reviewedAt).not.toBeNull();
    });

    it('throws BadRequestException if leave is already reviewed', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { ...mockLeaveRow, status: 'APPROVED', reviewed_by: 'principal-1', reviewed_at: new Date() },
      ]);

      await expect(
        service.reviewLeave('leave-1', { status: 'REJECTED' }, 'principal-2'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
