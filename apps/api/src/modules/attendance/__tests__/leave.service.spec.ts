import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LeaveService } from '../leave.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { Role } from '../../common/enums/role.enum';

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

const leaveDto = {
  academicYearId: 'year-1',
  fromDate: '2024-04-15',
  toDate: '2024-04-17',
  reason: 'Sick leave',
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
    it('creates a PENDING leave application record for a PARENT caller', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ student_id: 'student-1' }]) // guardians lookup
        .mockResolvedValueOnce([mockLeaveRow]);                 // INSERT

      const result = await service.applyLeave(
        { ...leaveDto, studentId: 'student-1' },
        'parent-1',
        Role.PARENT,
      );

      expect(result.status).toBe('PENDING');
      expect(result.reviewedBy).toBeNull();
      expect(result.reviewedAt).toBeNull();
    });

    it('derives studentId from token when caller is STUDENT', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'student-1' }]) // user_id → student lookup
        .mockResolvedValueOnce([mockLeaveRow]);         // INSERT

      const result = await service.applyLeave(
        leaveDto,
        'student-user-1',
        Role.STUDENT,
      );

      expect(result.status).toBe('PENDING');
      expect(tenantPrisma.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('user_id'),
        'student-user-1',
      );
    });

    it('throws ForbiddenException when STUDENT caller has no linked student record', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]); // no linked student

      await expect(
        service.applyLeave(leaveDto, 'unlinked-user', Role.STUDENT),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when non-STUDENT/PARENT caller omits studentId', async () => {
      await expect(
        service.applyLeave(leaveDto, 'teacher-1', Role.TEACHER),
      ).rejects.toThrow(BadRequestException);
    });

    // ─── PARENT branch tests ──────────────────────────────────────────────────

    it('PARENT files leave for own child (in guardians) → success', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ student_id: 'student-1' }]) // guardians lookup
        .mockResolvedValueOnce([mockLeaveRow]);                 // INSERT

      const result = await service.applyLeave(
        { ...leaveDto, studentId: 'student-1' },
        'parent-user-1',
        Role.PARENT,
      );

      expect(result.status).toBe('PENDING');
      // Verify guardians query used appliedById
      expect(tenantPrisma.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('guardians'),
        'parent-user-1',
      );
    });

    it('PARENT files leave for non-child studentId → 403 ForbiddenException', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ student_id: 'child-of-parent' }]); // guardians lookup — different child

      await expect(
        service.applyLeave(
          { ...leaveDto, studentId: 'some-other-student' },
          'parent-user-1',
          Role.PARENT,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('PARENT omits studentId → 400 BadRequestException', async () => {
      await expect(
        service.applyLeave(leaveDto, 'parent-user-1', Role.PARENT),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reviewLeave()', () => {
    it('sets status to APPROVED and records reviewedBy + reviewedAt', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([mockLeaveRow]) // findOne (PENDING)
        .mockResolvedValueOnce([{
          ...mockLeaveRow,
          status: 'APPROVED',
          reviewed_by: 'principal-1',
          reviewed_at: new Date(),
        }]);

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
        {
          ...mockLeaveRow,
          status: 'APPROVED',
          reviewed_by: 'principal-1',
          reviewed_at: new Date(),
        },
      ]);

      await expect(
        service.reviewLeave('leave-1', { status: 'REJECTED' }, 'principal-2'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
