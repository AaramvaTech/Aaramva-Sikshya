import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FeePreviewService } from '../fee-preview.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { StudentFeeStructureAssignmentService } from '../student-fee-structure-assignment.service';
import { StudentFeeOverrideService } from '../student-fee-override.service';
import { StudentConcessionService } from '../student-concession.service';
import { StudentTransportAssignmentService } from '../student-transport-assignment.service';
import { Role } from '../../common/enums/role.enum';
import { GuardianScopeService } from '../../student/guardian-scope.service';

const mockAssignment = {
  id: 'sfsa-1',
  student_id: 'student-1',
  fee_structure_id: 'bfs-1',
  academic_year_id: 'year-1',
  effective_from: new Date('2026-04-14'),
  effective_to: null,
  assigned_by: 'user-1',
  created_at: new Date('2026-04-14'),
  updated_at: new Date('2026-04-14'),
  deleted_at: null,
};

function makeItem(feeHeadId: string, feeHeadName: string, amount: string) {
  return { fee_head_id: feeHeadId, fee_head_name: feeHeadName, amount };
}

function makeConcession(overrides: Partial<{
  id: string; fee_head_id: string | null; type: string; value: string; cap_amount: string | null;
  discount_reason_id: string;
}>) {
  return {
    id: 'con-1',
    student_id: 'student-1',
    fee_head_id: null,
    academic_year_id: 'year-1',
    type: 'PERCENT',
    value: '10.00',
    cap_amount: null,
    discount_reason_id: 'reason-1',
    effective_from: new Date('2026-04-14'),
    effective_to: null,
    notes: null,
    created_by: 'user-1',
    created_at: new Date('2026-04-14'),
    updated_at: new Date('2026-04-14'),
    deleted_at: null,
    ...overrides,
  };
}

describe('FeePreviewService', () => {
  let service: FeePreviewService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let assignmentService: jest.Mocked<StudentFeeStructureAssignmentService>;
  let overrideService: jest.Mocked<StudentFeeOverrideService>;
  let concessionService: jest.Mocked<StudentConcessionService>;
  let transportService: jest.Mocked<StudentTransportAssignmentService>;
  let guardianScope: jest.Mocked<GuardianScopeService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        FeePreviewService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn(), run: jest.fn() } },
        { provide: GuardianScopeService, useValue: { assertOwnsStudent: jest.fn() } },
        { provide: StudentFeeStructureAssignmentService, useValue: { findActiveAssignment: jest.fn() } },
        { provide: StudentFeeOverrideService, useValue: { findActiveForStudent: jest.fn() } },
        { provide: StudentConcessionService, useValue: { findActiveForStudent: jest.fn() } },
        { provide: StudentTransportAssignmentService, useValue: { findActiveForStudent: jest.fn() } },
      ],
    }).compile();

    service = module.get(FeePreviewService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    assignmentService = module.get(StudentFeeStructureAssignmentService) as jest.Mocked<StudentFeeStructureAssignmentService>;
    overrideService = module.get(StudentFeeOverrideService) as jest.Mocked<StudentFeeOverrideService>;
    concessionService = module.get(StudentConcessionService) as jest.Mocked<StudentConcessionService>;
    transportService = module.get(StudentTransportAssignmentService) as jest.Mocked<StudentTransportAssignmentService>;
    guardianScope = module.get(GuardianScopeService) as jest.Mocked<GuardianScopeService>;
    jest.clearAllMocks();

    (transportService.findActiveForStudent as jest.Mock).mockResolvedValue(null);
  });

  it('404s when the student has no active fee structure assignment', async () => {
    (assignmentService.findActiveAssignment as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      service.preview('student-1', { academicYearId: 'year-1' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('resolution order: override replaces the structure amount, concession applies to the result, cap is respected', async () => {
    (assignmentService.findActiveAssignment as jest.Mock).mockResolvedValueOnce(mockAssignment);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ name: 'Grade 5 — Day scholar' }]) // structure name
      .mockResolvedValueOnce([makeItem('head-1', 'Tuition', '10000.00')]); // items
    (overrideService.findActiveForStudent as jest.Mock).mockResolvedValueOnce([
      { id: 'ov-1', fee_head_id: 'head-1', override_amount: '8000.00' },
    ]);
    (concessionService.findActiveForStudent as jest.Mock).mockResolvedValueOnce([
      makeConcession({ fee_head_id: 'head-1', type: 'PERCENT', value: '30.00', cap_amount: '2000.00' }),
    ]);

    const result = await service.preview('student-1', { academicYearId: 'year-1', asOfDate: '2026-04-20' });

    const head = result.heads[0];
    expect(head.grossAmount).toBe(10000); // structure gross, unaffected by the override
    expect(head.overrideAmount).toBe(8000); // override replaces, doesn't discount, the base
    expect(head.effectiveBase).toBe(8000);
    // 30% of 8000 = 2400, capped at 2000
    expect(head.concessions[0].amount).toBe(2000);
    expect(head.netAmount).toBe(6000); // 8000 - 2000
    expect(result.netTotal).toBe(6000);
  });

  it('a percent concession with fee_head_id NULL applies across all heads (the whole-bill total)', async () => {
    (assignmentService.findActiveAssignment as jest.Mock).mockResolvedValueOnce(mockAssignment);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ name: 'Grade 5 — Day scholar' }])
      .mockResolvedValueOnce([
        makeItem('head-1', 'Tuition', '5000.00'),
        makeItem('head-2', 'Exam fee', '3000.00'),
      ]);
    (overrideService.findActiveForStudent as jest.Mock).mockResolvedValueOnce([]);
    (concessionService.findActiveForStudent as jest.Mock).mockResolvedValueOnce([
      makeConcession({ fee_head_id: null, type: 'PERCENT', value: '10.00', cap_amount: null }),
    ]);

    const result = await service.preview('student-1', { academicYearId: 'year-1', asOfDate: '2026-04-20' });

    expect(result.grossTotal).toBe(8000);
    // Whole-bill concession is NOT attributed to any single head line...
    expect(result.heads.every((h) => h.concessions.length === 0)).toBe(true);
    // ...it applies once, against the sum of every head (10% of 8000 = 800).
    expect(result.wholeBillConcessions).toHaveLength(1);
    expect(result.wholeBillConcessions[0].amount).toBe(800);
    expect(result.concessionTotal).toBe(800);
    expect(result.netTotal).toBe(7200);
  });

  it('includes the active transport assignment in the gross and whole-bill-concession base', async () => {
    (assignmentService.findActiveAssignment as jest.Mock).mockResolvedValueOnce(mockAssignment);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ name: 'Grade 5 — Day scholar' }])
      .mockResolvedValueOnce([makeItem('head-1', 'Tuition', '5000.00')])
      .mockResolvedValueOnce([{ name: 'Route A', monthly_amount: '1000.00' }]); // transport route lookup
    (overrideService.findActiveForStudent as jest.Mock).mockResolvedValueOnce([]);
    (concessionService.findActiveForStudent as jest.Mock).mockResolvedValueOnce([]);
    (transportService.findActiveForStudent as jest.Mock).mockResolvedValueOnce({
      student_id: 'student-1',
      transport_route_id: 'route-1',
    });

    const result = await service.preview('student-1', { academicYearId: 'year-1', asOfDate: '2026-04-20' });

    expect(result.transport).toEqual({ transportRouteId: 'route-1', transportRouteName: 'Route A', amount: 1000 });
    expect(result.grossTotal).toBe(6000);
    expect(result.netTotal).toBe(6000);
  });

  it('is idempotent: two identical calls return identical output and never write', async () => {
    const runTwice = async () => {
      (assignmentService.findActiveAssignment as jest.Mock).mockResolvedValueOnce(mockAssignment);
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ name: 'Grade 5 — Day scholar' }])
        .mockResolvedValueOnce([makeItem('head-1', 'Tuition', '5000.00')]);
      (overrideService.findActiveForStudent as jest.Mock).mockResolvedValueOnce([]);
      (concessionService.findActiveForStudent as jest.Mock).mockResolvedValueOnce([]);
      return service.preview('student-1', { academicYearId: 'year-1', asOfDate: '2026-04-20' });
    };

    const first = await runTwice();
    const second = await runTwice();

    expect(second).toEqual(first);
    expect(tenantPrisma.execute).not.toHaveBeenCalled();
    expect(tenantPrisma.run).not.toHaveBeenCalled();
  });

  it('PARENT caller who does not own the student is rejected', async () => {
    guardianScope.assertOwnsStudent.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      service.preview('student-1', { academicYearId: 'year-1' }, 'parent-user-1', Role.PARENT),
    ).rejects.toThrow(ForbiddenException);
    expect(assignmentService.findActiveAssignment).not.toHaveBeenCalled();
  });

  it('PARENT caller who owns the student can preview', async () => {
    guardianScope.assertOwnsStudent.mockResolvedValueOnce(undefined);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ name: 'Grade 5 — Day scholar' }])
      .mockResolvedValueOnce([makeItem('head-1', 'Tuition', '5000.00')]);
    (assignmentService.findActiveAssignment as jest.Mock).mockResolvedValueOnce(mockAssignment);
    (overrideService.findActiveForStudent as jest.Mock).mockResolvedValueOnce([]);
    (concessionService.findActiveForStudent as jest.Mock).mockResolvedValueOnce([]);

    const result = await service.preview(
      'student-1',
      { academicYearId: 'year-1', asOfDate: '2026-04-20' },
      'parent-user-1',
      Role.PARENT,
    );
    expect(result.netTotal).toBe(5000);
  });
});
