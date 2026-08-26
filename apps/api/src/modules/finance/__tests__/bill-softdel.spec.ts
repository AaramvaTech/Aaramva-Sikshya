import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FeePreviewService } from '../fee-preview.service';
import { BillLineResolverService } from '../bill-line-resolver.service';
import { BulkAssignRunnerService } from '../bulk-assign-runner.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { StudentFeeStructureAssignmentService } from '../student-fee-structure-assignment.service';
import { StudentFeeOverrideService } from '../student-fee-override.service';
import { StudentConcessionService } from '../student-concession.service';
import { StudentTransportAssignmentService } from '../student-transport-assignment.service';
import { GuardianScopeService } from '../../student/guardian-scope.service';
import { assertNoneRetired } from '../soft-delete-guard.util';

/**
 * BILL-SOFTDEL-1 — the read path must HALT on a retired parent, not drop the
 * line (ruling 2, FEE-CLASS-GUARD-2-phase0.md §7).
 *
 * Every test here builds its own fixture on purpose. The dev forensic came back
 * zero on every backward query across all 9 tenant schemas and §6's forward
 * exposure is idle, so there is no found data to assert against and a suite that
 * is green against demo proves nothing either way (BILL-SOFTDEL-1.md §2).
 *
 * The assertion that matters most is not "it throws" — it is that the LIVE
 * sibling head on the same structure never comes back as a smaller bill. A
 * filter-shaped fix would pass a bare "it throws" check while shipping exactly
 * the defect this ticket exists to remove, so the control case is asserted too.
 */

const RETIRED = new Date('2026-08-01T00:00:00.000Z');

const assignment = {
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
  class_mismatch_overridden: false,
  overridden_by_user_id: null,
  overridden_at: null,
};

/** A structure item row as the D2 query now returns it. */
function item(id: string, name: string, amount: string, deletedAt: Date | null = null) {
  return { fee_head_id: id, fee_head_name: name, amount, fee_head_deleted_at: deletedAt };
}

/** ERR-1 envelope body out of a thrown HttpException. */
function bodyOf(err: any) {
  const res = err.getResponse();
  return res.error ?? res;
}

describe('BILL-SOFTDEL-1 — retired parents halt the billing read path', () => {
  describe('FeePreviewService (D1/D2/D3) — the choke point the bill run also passes through', () => {
    let service: FeePreviewService;
    let tenantPrisma: jest.Mocked<TenantPrismaService>;
    let assignmentService: jest.Mocked<StudentFeeStructureAssignmentService>;
    let transportService: jest.Mocked<StudentTransportAssignmentService>;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          FeePreviewService,
          {
            provide: TenantPrismaService,
            useValue: { query: jest.fn(), execute: jest.fn(), run: jest.fn() },
          },
          { provide: GuardianScopeService, useValue: { assertOwnsStudent: jest.fn() } },
          {
            provide: StudentFeeStructureAssignmentService,
            useValue: { findActiveAssignment: jest.fn() },
          },
          { provide: StudentFeeOverrideService, useValue: { findActiveForStudent: jest.fn() } },
          { provide: StudentConcessionService, useValue: { findActiveForStudent: jest.fn() } },
          {
            provide: StudentTransportAssignmentService,
            useValue: { findActiveForStudent: jest.fn() },
          },
        ],
      }).compile();

      service = module.get(FeePreviewService);
      tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
      assignmentService = module.get(
        StudentFeeStructureAssignmentService,
      ) as jest.Mocked<StudentFeeStructureAssignmentService>;
      transportService = module.get(
        StudentTransportAssignmentService,
      ) as jest.Mocked<StudentTransportAssignmentService>;
      jest.clearAllMocks();

      (assignmentService.findActiveAssignment as jest.Mock).mockResolvedValue(assignment);
      (module.get(StudentFeeOverrideService).findActiveForStudent as jest.Mock).mockResolvedValue([]);
      (module.get(StudentConcessionService).findActiveForStudent as jest.Mock).mockResolvedValue([]);
      (transportService.findActiveForStudent as jest.Mock).mockResolvedValue(null);
    });

    const liveStructure = [{ name: 'Grade 9 A Fees', deleted_at: null }];
    const query = { academicYearId: 'year-1', asOfDate: '2026-08-20' };

    it('D2: a retired fee head halts the run — the live head on the SAME structure is not billed either', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce(liveStructure)
        .mockResolvedValueOnce([
          item('head-1', 'Tuition', '5000.00'),
          item('head-2', 'Lab Fee', '1200.00', RETIRED),
        ]);

      await expect(service.preview('student-1', query)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('D2: the error names the retired head and carries it in details', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce(liveStructure)
        .mockResolvedValueOnce([
          item('head-1', 'Tuition', '5000.00'),
          item('head-2', 'Lab Fee', '1200.00', RETIRED),
        ]);

      const body = bodyOf(await service.preview('student-1', query).catch((e) => e));

      expect(body.code).toBe('FEE_HEAD_UNAVAILABLE');
      expect(body.message).toContain('Lab Fee');
      expect(body.details.retired).toEqual(['Lab Fee']);
      expect(body.details.retired).not.toContain('Tuition');
    });

    it('CONTROL: the same structure with both heads live bills normally', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce(liveStructure)
        .mockResolvedValueOnce([
          item('head-1', 'Tuition', '5000.00'),
          item('head-2', 'Lab Fee', '1200.00'),
        ]);

      const result = await service.preview('student-1', query);

      expect(result.heads.map((h) => h.feeHeadName)).toEqual(['Tuition', 'Lab Fee']);
      expect(result.netTotal).toBe(6200);
    });

    it('D2 is fail-not-filter: a retired head never comes back as a smaller bill', async () => {
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce(liveStructure)
        .mockResolvedValueOnce([
          item('head-1', 'Tuition', '5000.00'),
          item('head-2', 'Lab Fee', '1200.00', RETIRED),
        ]);

      const result = await service.preview('student-1', query).catch(() => null);

      // The filter-shaped bug returns a 5000 preview here instead of throwing.
      expect(result).toBeNull();
    });

    it('D3: a retired STRUCTURE halts before any line is priced', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
        { name: 'Grade 9 A Fees (old)', deleted_at: RETIRED },
      ]);

      const err = await service.preview('student-1', query).catch((e) => e);

      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect(bodyOf(err).code).toBe('BILL_FEE_STRUCTURE_UNAVAILABLE');
      // Halted at the structure — the items query was never reached.
      expect(tenantPrisma.query as jest.Mock).toHaveBeenCalledTimes(1);
    });

    it('D3: a structure that has vanished entirely is still a 404, not a retired-parent 422', async () => {
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);
      await expect(service.preview('student-1', query)).rejects.toThrow(NotFoundException);
    });

    it('D1: a retired transport route halts the run', async () => {
      (transportService.findActiveForStudent as jest.Mock).mockResolvedValue({
        transport_route_id: 'route-1',
      });
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce(liveStructure)
        .mockResolvedValueOnce([item('head-1', 'Tuition', '5000.00')])
        .mockResolvedValueOnce([{ name: 'Route A', monthly_amount: '450.00', deleted_at: RETIRED }]);

      const err = await service.preview('student-1', query).catch((e) => e);

      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect(bodyOf(err).code).toBe('TRANSPORT_ROUTE_UNAVAILABLE');
      expect(bodyOf(err).message).toContain('Route A');
    });

    it('CONTROL: a live transport route on the same student bills normally', async () => {
      (transportService.findActiveForStudent as jest.Mock).mockResolvedValue({
        transport_route_id: 'route-1',
      });
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce(liveStructure)
        .mockResolvedValueOnce([item('head-1', 'Tuition', '5000.00')])
        .mockResolvedValueOnce([{ name: 'Route A', monthly_amount: '450.00', deleted_at: null }]);

      const result = await service.preview('student-1', query);

      expect(result.transport?.transportRouteName).toBe('Route A');
      expect(result.netTotal).toBe(5450);
    });
  });

  describe('BillLineResolverService (D4) — bill generation inherits the halt', () => {
    let service: BillLineResolverService;
    let tenantPrisma: jest.Mocked<TenantPrismaService>;
    let feePreview: jest.Mocked<FeePreviewService>;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          BillLineResolverService,
          { provide: TenantPrismaService, useValue: { query: jest.fn() } },
          {
            provide: StudentFeeStructureAssignmentService,
            useValue: { findAssignmentOverlappingPeriod: jest.fn() },
          },
          { provide: FeePreviewService, useValue: { preview: jest.fn() } },
        ],
      }).compile();

      service = module.get(BillLineResolverService);
      tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
      feePreview = module.get(FeePreviewService) as jest.Mocked<FeePreviewService>;
      jest.clearAllMocks();
      (
        module.get(StudentFeeStructureAssignmentService)
          .findAssignmentOverlappingPeriod as jest.Mock
      ).mockResolvedValue(assignment);
    });

    it('a preview that halts halts the bill run — nothing is resolved', async () => {
      (feePreview.preview as jest.Mock).mockRejectedValue(
        new UnprocessableEntityException({ code: 'FEE_HEAD_UNAVAILABLE' }),
      );
      await expect(service.resolve('student-1', 'year-1', 2083, 4)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('D4: a head retired BETWEEN preview and the metadata read fails instead of billing untaxed', async () => {
      (feePreview.preview as jest.Mock).mockResolvedValue({
        studentId: 'student-1',
        feeStructureId: 'bfs-1',
        feeStructureName: 'Grade 9 A Fees',
        academicYearId: 'year-1',
        asOfDate: '2026-08-16',
        transport: null,
        wholeBillConcessions: [],
        grossTotal: 5000,
        concessionTotal: 0,
        netTotal: 5000,
        heads: [
          {
            feeHeadId: 'head-1',
            feeHeadName: 'Tuition',
            grossAmount: 5000,
            overrideAmount: null,
            effectiveBase: 5000,
            concessions: [],
            netAmount: 5000,
          },
        ],
      });
      // The head is gone by the time the metadata query runs.
      (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([]);

      const err = await service.resolve('student-1', 'year-1', 2083, 4).catch((e) => e);

      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect(bodyOf(err).code).toBe('FEE_HEAD_UNAVAILABLE');
      expect(bodyOf(err).details.feeHeadIds).toEqual(['head-1']);
    });
  });

  describe('BulkAssignRunnerService (D8) — a retired structure fails the job', () => {
    let runner: BulkAssignRunnerService;
    let tenantPrisma: jest.Mocked<TenantPrismaService>;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          BulkAssignRunnerService,
          {
            provide: TenantPrismaService,
            useValue: { query: jest.fn(), execute: jest.fn(), run: jest.fn() },
          },
        ],
      }).compile();
      runner = module.get(BulkAssignRunnerService);
      tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
      jest.clearAllMocks();
    });

    it('marks the job FAILED and assigns nobody, instead of an empty scope that matches everyone', async () => {
      const job = {
        id: 'job-1',
        status: 'PENDING',
        fee_structure_id: 'bfs-1',
        scope_student_ids: ['student-1', 'student-2'],
        processed: 0,
        allow_cross_class: false,
        failures: [],
      };
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([job]) // the PENDING job list
        .mockResolvedValueOnce([]); // loadStructureScope: retired, filtered out
      (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

      const result = await runner.drainCurrentTenant();

      expect(result.studentsProcessed).toBe(0);
      // No chunk transaction ever opened, so nobody was assigned.
      expect(tenantPrisma.run).not.toHaveBeenCalled();
      const statements = (tenantPrisma.execute as jest.Mock).mock.calls.map((c) => c[0] as string);
      expect(statements.some((sql) => sql.includes("status = 'FAILED'"))).toBe(true);
      expect(statements.some((sql) => sql.includes("status = 'COMPLETED'"))).toBe(false);
    });
  });
  describe('StudentFeeOverrideService (D9) — the display flag agrees with the invoice', () => {
    let service: StudentFeeOverrideService;
    let tenantPrisma: jest.Mocked<TenantPrismaService>;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          StudentFeeOverrideService,
          { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        ],
      }).compile();
      service = module.get(StudentFeeOverrideService);
      tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
      jest.clearAllMocks();
    });

    /**
     * The mocks here return rows, so the only observable difference the fix
     * makes at unit level is the SQL itself — a structure whose deleted_at is
     * set must be excluded by the database, which is what the added JOIN does.
     * Behaviour against real rows is covered by the live proof.
     */
    it('reachability excludes assignments whose structure has been retired', async () => {
      (tenantPrisma.query as jest.Mock)
        // One row on the page, so reachablePairs actually runs — it
        // short-circuits without querying when the page is empty.
        .mockResolvedValueOnce([
          {
            id: 'ov-1',
            student_id: 'student-1',
            fee_head_id: 'head-1',
            fee_head_name: 'Tuition',
            academic_year_id: 'year-1',
            override_amount: '8000.00',
            reason: null,
            effective_from: new Date('2026-04-14'),
            effective_to: null,
            created_by: 'user-1',
            created_at: new Date('2026-04-14'),
            total_count: '1',
          },
        ])
        .mockResolvedValueOnce([]); // reachability: no match once retired structures are excluded

      const page = await service.findAll({} as never);
      expect(page.data[0].appliesToAssignedStructure).toBe(false);

      const reachabilitySql = (tenantPrisma.query as jest.Mock).mock.calls[1][0] as string;
      expect(reachabilitySql).toContain('JOIN bill_fee_structures');
      expect(reachabilitySql).toContain('s.deleted_at IS NULL');
    });
  });

  describe('assertNoneRetired — the shared rule', () => {
    it('passes a set with no retired row', () => {
      expect(() =>
        assertNoneRetired('fee_heads', [
          { name: 'Tuition', deleted_at: null },
          { name: 'Exam fee', deleted_at: null },
        ]),
      ).not.toThrow();
    });

    it('names every retired row, not just the first', () => {
      const err = (() => {
        try {
          assertNoneRetired('fee_heads', [
            { name: 'Tuition', deleted_at: null },
            { name: 'Lab Fee', deleted_at: RETIRED },
            { name: 'Bus Fee', deleted_at: RETIRED },
          ]);
          return null;
        } catch (e) {
          return e;
        }
      })();

      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect(bodyOf(err).details.retired).toEqual(['Lab Fee', 'Bus Fee']);
      expect(bodyOf(err).message).toContain('fee heads');
    });

    it('an empty set is not an error — a structure with no items is a different problem', () => {
      expect(() => assertNoneRetired('bill_fee_structures', [])).not.toThrow();
    });

    // A shared remedy told transport users to "remove it from the fee structure",
    // where a route does not live. Each entity names the action that actually
    // fixes it, and nothing may fall back to the fee-structure wording.
    it.each([
      ['fee_heads', 'Remove it from the fee structure'],
      ['transport_routes', "Remove the student's transport assignment"],
      ['bill_fee_structures', 'Assign a current fee structure'],
    ] as const)('%s names its own remedy', (entity, remedy) => {
      const err = (() => {
        try {
          assertNoneRetired(entity, [{ name: 'X', deleted_at: RETIRED }]);
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(bodyOf(err).message).toContain(remedy);
    });

    it('a retired route never mentions the fee structure', () => {
      const err = (() => {
        try {
          assertNoneRetired('transport_routes', [{ name: 'Route A', deleted_at: RETIRED }]);
          return null;
        } catch (e) {
          return e;
        }
      })();
      expect(bodyOf(err).message).not.toContain('fee structure');
    });
  });
});
