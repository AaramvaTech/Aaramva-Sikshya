import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { LeaveService } from '../leave.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { SmsService } from '../../communication/sms.service';
import { Role } from '../../common/enums/role.enum';
import { GuardianScopeService } from '../../student/guardian-scope.service';

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
  let sms: { send: jest.Mock };
  // Fake transaction client handed to tenantPrisma.run()
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let guardianScope: jest.Mocked<GuardianScopeService>;

  beforeEach(async () => {
    tx = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };
    sms = { send: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        LeaveService,
        {
          provide: TenantPrismaService,
          useValue: {
            query: jest.fn(),
            execute: jest.fn(),
            // run() invokes the caller's fn with the fake tx client
            run: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
          },
        },
        { provide: SmsService, useValue: sms },
        { provide: GuardianScopeService, useValue: { assertOwnsStudent: jest.fn() } },
      ],
    }).compile();

    service = module.get(LeaveService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    guardianScope = module.get(GuardianScopeService) as jest.Mocked<GuardianScopeService>;

    jest.clearAllMocks();
  });

  describe('applyLeave()', () => {
    it('creates a PENDING leave application record for a PARENT caller', async () => {
      guardianScope.assertOwnsStudent.mockResolvedValueOnce(undefined);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockLeaveRow]); // INSERT

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
      guardianScope.assertOwnsStudent.mockResolvedValueOnce(undefined);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockLeaveRow]); // INSERT

      const result = await service.applyLeave(
        { ...leaveDto, studentId: 'student-1' },
        'parent-user-1',
        Role.PARENT,
      );

      expect(result.status).toBe('PENDING');
      expect(guardianScope.assertOwnsStudent).toHaveBeenCalledWith('parent-user-1', 'student-1');
    });

    it('PARENT files leave for non-child studentId → 403 ForbiddenException', async () => {
      guardianScope.assertOwnsStudent.mockRejectedValueOnce(new ForbiddenException());

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
    it('APPROVE: stamps reviewer + note, reflects LEAVE into attendance, and notifies the applicant', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ ...mockLeaveRow, student_section_id: 'section-1' }]) // SELECT existing (PENDING)
        .mockResolvedValueOnce([{
          ...mockLeaveRow,
          status: 'APPROVED',
          reviewed_by: 'principal-1',
          reviewed_at: new Date(),
          review_remarks: 'Enjoy',
        }]); // UPDATE ... RETURNING
      tx.$executeRawUnsafe.mockResolvedValueOnce(3); // generate_series LEAVE upsert
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { phone: '9800000000', student_name: 'Aarav Sharma' },
      ]); // notifyApplicant lookup

      const result = await service.reviewLeave(
        'leave-1',
        { status: 'APPROVED', remarks: 'Enjoy' },
        'principal-1',
      );

      expect(result.status).toBe('APPROVED');
      expect(result.reviewedBy).toBe('principal-1');
      expect(result.reviewRemarks).toBe('Enjoy');
      // attendance reflection ran
      expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      expect(tx.$executeRawUnsafe.mock.calls[0][0]).toContain("'LEAVE'");
      // applicant was notified exactly once
      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(sms.send).toHaveBeenCalledWith('9800000000', expect.stringContaining('APPROVED'), 'LEAVE_DECISION', 'student-1');
    });

    it('REJECT: stamps decision but does NOT touch attendance', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ ...mockLeaveRow, student_section_id: 'section-1' }])
        .mockResolvedValueOnce([{
          ...mockLeaveRow,
          status: 'REJECTED',
          reviewed_by: 'principal-1',
          reviewed_at: new Date(),
          review_remarks: 'Insufficient notice',
        }]);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { phone: '9800000000', student_name: 'Aarav Sharma' },
      ]);

      const result = await service.reviewLeave(
        'leave-1',
        { status: 'REJECTED', remarks: 'Insufficient notice' },
        'principal-1',
      );

      expect(result.status).toBe('REJECTED');
      expect(tx.$executeRawUnsafe).not.toHaveBeenCalled(); // no attendance write on reject
      expect(sms.send).toHaveBeenCalledWith('9800000000', expect.stringContaining('REJECTED'), 'LEAVE_DECISION', 'student-1');
    });

    it('skips notify-back when the applicant has no phone on file (decision still stands)', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ ...mockLeaveRow, student_section_id: null }])
        .mockResolvedValueOnce([{ ...mockLeaveRow, status: 'APPROVED', reviewed_by: 'principal-1', reviewed_at: new Date() }]);
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{ phone: null, student_name: 'Aarav Sharma' }]);

      const result = await service.reviewLeave('leave-1', { status: 'APPROVED' }, 'principal-1');

      expect(result.status).toBe('APPROVED');
      expect(tx.$executeRawUnsafe).not.toHaveBeenCalled(); // null section → no reflection
      expect(sms.send).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if leave is already reviewed', async () => {
      tx.$queryRawUnsafe.mockResolvedValueOnce([
        {
          ...mockLeaveRow,
          status: 'APPROVED',
          reviewed_by: 'principal-1',
          reviewed_at: new Date(),
          student_section_id: 'section-1',
        },
      ]);

      await expect(
        service.reviewLeave('leave-1', { status: 'REJECTED' }, 'principal-2'),
      ).rejects.toThrow(BadRequestException);
      expect(sms.send).not.toHaveBeenCalled();
    });
  });
});
