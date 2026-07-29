import { bsToAd, daysInBsMonth } from 'bs-calendar';
import { Test } from '@nestjs/testing';
import { BillLineResolverService } from '../bill-line-resolver.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { StudentFeeStructureAssignmentService } from '../student-fee-structure-assignment.service';
import { FeePreviewService } from '../fee-preview.service';
import { formatLocalDate } from '../../common/utils/date.util';

const BS_YEAR = 2083;
const BS_MONTH = 4; // Shrawan
const DAYS_IN_MONTH = daysInBsMonth(BS_YEAR, BS_MONTH);
const PERIOD_START = formatLocalDate(bsToAd({ year: BS_YEAR, month: BS_MONTH, day: 1 }));
const PERIOD_END = formatLocalDate(bsToAd({ year: BS_YEAR, month: BS_MONTH, day: DAYS_IN_MONTH }));
const MID_DAY = Math.min(15, DAYS_IN_MONTH);
const MID_EFFECTIVE_FROM = formatLocalDate(bsToAd({ year: BS_YEAR, month: BS_MONTH, day: MID_DAY }));
const EXPECTED_DAYS_BILLED = DAYS_IN_MONTH - MID_DAY + 1;

function makeAssignment(effectiveFromAd: string) {
  return {
    id: 'sfsa-1', student_id: 'student-1', fee_structure_id: 'bfs-1', academic_year_id: 'year-1',
    effective_from: new Date(`${effectiveFromAd}T00:00:00.000Z`), effective_to: null,
    assigned_by: 'user-1', created_at: new Date(), updated_at: new Date(), deleted_at: null,
  };
}

function makePreview(heads: any[], transport: any = null, wholeBillConcessions: any[] = []) {
  const grossTotal = heads.reduce((s, h) => s + h.grossAmount, 0) + (transport?.amount ?? 0);
  const netTotal = heads.reduce((s, h) => s + h.netAmount, 0) + (transport?.amount ?? 0);
  return {
    studentId: 'student-1', feeStructureId: 'fs-1', feeStructureName: 'proof', academicYearId: 'year-1',
    asOfDate: PERIOD_END, heads, transport, wholeBillConcessions,
    grossTotal, concessionTotal: 0, netTotal,
  };
}

describe('BillLineResolverService', () => {
  let service: BillLineResolverService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;
  let assignmentService: jest.Mocked<StudentFeeStructureAssignmentService>;
  let feePreviewService: jest.Mocked<FeePreviewService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BillLineResolverService,
        { provide: TenantPrismaService, useValue: { query: jest.fn() } },
        { provide: StudentFeeStructureAssignmentService, useValue: { findAssignmentOverlappingPeriod: jest.fn() } },
        { provide: FeePreviewService, useValue: { preview: jest.fn() } },
      ],
    }).compile();

    service = module.get(BillLineResolverService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
    assignmentService = module.get(StudentFeeStructureAssignmentService) as jest.Mocked<StudentFeeStructureAssignmentService>;
    feePreviewService = module.get(FeePreviewService) as jest.Mocked<FeePreviewService>;
    jest.clearAllMocks();
  });

  it('SKIPPED_NO_ASSIGNMENT when nothing overlaps the period — never calls preview', async () => {
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(null);
    const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);
    expect(result.outcome).toBe('SKIPPED_NO_ASSIGNMENT');
    expect(result.gross).toBe(0);
    expect(feePreviewService.preview).not.toHaveBeenCalled();
  });

  it('full month (effective_from before the period): no proration, full amounts', async () => {
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment('2025-04-13'));
    feePreviewService.preview.mockResolvedValueOnce(makePreview([
      { feeHeadId: 'fh-1', feeHeadName: 'Tuition', grossAmount: 3000, overrideAmount: null, effectiveBase: 3000, concessions: [], netAmount: 3000 },
    ]) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'fh-1', is_taxable: false, recurrence: 'MONTHLY', proration_policy: 'MONTHLY' }]) // fee_heads meta
      .mockResolvedValueOnce([]); // no active tax rate

    const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);

    expect(feePreviewService.preview).toHaveBeenCalledWith('student-1', { academicYearId: 'year-1', asOfDate: PERIOD_END });
    expect(result.outcome).toBe('DRAFT');
    expect(result.gross).toBe(3000);
    expect(result.net).toBe(3000);
    expect(result.taxRate).toBeNull();
    expect(result.taxAmount).toBe(0);
    expect(result.items[0].prorationNote).toBeNull();
  });

  it('mid-period join: MONTHLY head is prorated by the day fraction; a NONE head in the same invoice is not', async () => {
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment(MID_EFFECTIVE_FROM));
    feePreviewService.preview.mockResolvedValueOnce(makePreview([
      { feeHeadId: 'fh-monthly', feeHeadName: 'Tuition', grossAmount: DAYS_IN_MONTH * 100, overrideAmount: null, effectiveBase: DAYS_IN_MONTH * 100, concessions: [], netAmount: DAYS_IN_MONTH * 100 },
      { feeHeadId: 'fh-none', feeHeadName: 'Admission', grossAmount: 500, overrideAmount: null, effectiveBase: 500, concessions: [], netAmount: 500 },
    ]) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([
        { id: 'fh-monthly', is_taxable: false, recurrence: 'MONTHLY', proration_policy: 'MONTHLY' },
        { id: 'fh-none', is_taxable: false, recurrence: 'ONE_TIME', proration_policy: 'NONE' },
      ])
      .mockResolvedValueOnce([]); // no active tax rate

    const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);

    const monthlyItem = result.items.find((i) => i.feeHeadId === 'fh-monthly')!;
    const noneItem = result.items.find((i) => i.feeHeadId === 'fh-none')!;

    expect(monthlyItem.prorationNote).toBe(`${EXPECTED_DAYS_BILLED}/${DAYS_IN_MONTH} days`);
    expect(monthlyItem.grossAmount).toBeCloseTo((DAYS_IN_MONTH * 100 * EXPECTED_DAYS_BILLED) / DAYS_IN_MONTH, 2);
    expect(noneItem.prorationNote).toBeNull();
    expect(noneItem.grossAmount).toBe(500); // NONE-policy head bills in full even mid-period
  });

  it('no active tax rate: taxRate null, taxAmount 0', async () => {
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment('2025-04-13'));
    feePreviewService.preview.mockResolvedValueOnce(makePreview([
      { feeHeadId: 'fh-1', feeHeadName: 'Tuition', grossAmount: 1000, overrideAmount: null, effectiveBase: 1000, concessions: [], netAmount: 1000 },
    ]) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'fh-1', is_taxable: true, recurrence: 'MONTHLY', proration_policy: 'NONE' }])
      .mockResolvedValueOnce([]); // no active tax rate

    const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);
    expect(result.taxRate).toBeNull();
    expect(result.taxAmount).toBe(0);
    expect(result.net).toBe(1000);
  });

  it('active tax rate applies_to=ALL: every head counts toward taxable base', async () => {
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment('2025-04-13'));
    feePreviewService.preview.mockResolvedValueOnce(makePreview([
      { feeHeadId: 'fh-1', feeHeadName: 'Tuition', grossAmount: 1000, overrideAmount: null, effectiveBase: 1000, concessions: [], netAmount: 1000 },
    ]) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'fh-1', is_taxable: false, recurrence: 'MONTHLY', proration_policy: 'NONE' }])
      .mockResolvedValueOnce([{ rate: '13.000', applies_to: 'ALL' }]);

    const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);
    expect(result.taxRate).toBe(13);
    expect(result.taxableBase).toBe(1000);
    expect(result.taxAmount).toBe(130);
    expect(result.net).toBe(1130);
  });

  it('active tax rate applies_to=TAXABLE_HEADS: only is_taxable heads count', async () => {
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment('2025-04-13'));
    feePreviewService.preview.mockResolvedValueOnce(makePreview([
      { feeHeadId: 'fh-taxable', feeHeadName: 'Tuition', grossAmount: 1000, overrideAmount: null, effectiveBase: 1000, concessions: [], netAmount: 1000 },
      { feeHeadId: 'fh-exempt', feeHeadName: 'Admission', grossAmount: 500, overrideAmount: null, effectiveBase: 500, concessions: [], netAmount: 500 },
    ]) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([
        { id: 'fh-taxable', is_taxable: true, recurrence: 'MONTHLY', proration_policy: 'NONE' },
        { id: 'fh-exempt', is_taxable: false, recurrence: 'ONE_TIME', proration_policy: 'NONE' },
      ])
      .mockResolvedValueOnce([{ rate: '13.000', applies_to: 'TAXABLE_HEADS' }]);

    const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);
    expect(result.taxableBase).toBe(1000); // exempt head's 500 excluded
    expect(result.taxAmount).toBe(130);
    expect(result.net).toBe(1500 + 130);
  });

  it('TRANSPORT-ITEM: transport becomes its own line item, zero concession, alongside fee-head items', async () => {
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment('2025-04-13'));
    feePreviewService.preview.mockResolvedValueOnce(makePreview(
      [{ feeHeadId: 'fh-1', feeHeadName: 'Tuition', grossAmount: 1000, overrideAmount: null, effectiveBase: 1000, concessions: [], netAmount: 1000 }],
      { transportRouteId: 'route-1', transportRouteName: 'Route A', amount: 300 },
    ) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'fh-1', is_taxable: false, recurrence: 'MONTHLY', proration_policy: 'NONE' }])
      .mockResolvedValueOnce([]);

    const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);
    expect(result.gross).toBe(1300);
    expect(result.net).toBe(1300);
    expect(result.items).toHaveLength(2);

    const transportItem = result.items.find((i) => i.transportRouteId === 'route-1')!;
    expect(transportItem).toBeDefined();
    expect(transportItem.feeHeadId).toBeNull();
    expect(transportItem.itemName).toBe('Route A');
    expect(transportItem.grossAmount).toBe(300);
    expect(transportItem.concessionAmount).toBe(0);
    expect(transportItem.netAmount).toBe(300);
    expect(transportItem.prorationNote).toBeNull();

    const feeHeadItem = result.items.find((i) => i.feeHeadId === 'fh-1')!;
    expect(feeHeadItem.transportRouteId).toBeNull();
    expect(feeHeadItem.itemName).toBe('Tuition');
  });

  it('no transport assignment: items array has no transport row', async () => {
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment('2025-04-13'));
    feePreviewService.preview.mockResolvedValueOnce(makePreview(
      [{ feeHeadId: 'fh-1', feeHeadName: 'Tuition', grossAmount: 1000, overrideAmount: null, effectiveBase: 1000, concessions: [], netAmount: 1000 }],
    ) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'fh-1', is_taxable: false, recurrence: 'MONTHLY', proration_policy: 'NONE' }])
      .mockResolvedValueOnce([]);

    const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);
    expect(result.items).toHaveLength(1);
    expect(result.items.every((i) => i.transportRouteId === null)).toBe(true);
  });

  it('MUST-RESOLVE-BEFORE-BILL-8: whole-bill concession + transport together — header net is correct, but item nets do not sum to it (simple version, not apportioned)', async () => {
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment('2025-04-13'));
    feePreviewService.preview.mockResolvedValueOnce(makePreview(
      [{ feeHeadId: 'fh-1', feeHeadName: 'Tuition', grossAmount: 1000, overrideAmount: null, effectiveBase: 1000, concessions: [], netAmount: 1000 }],
      { transportRouteId: 'route-1', transportRouteName: 'Route A', amount: 300 },
      [{ amount: 200 }],
    ) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'fh-1', is_taxable: false, recurrence: 'MONTHLY', proration_policy: 'NONE' }])
      .mockResolvedValueOnce([]);

    const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);
    expect(result.gross).toBe(1300);
    expect(result.concession).toBe(200);
    expect(result.net).toBe(1100); // header is correct: 1300 - 200

    const transportItem = result.items.find((i) => i.transportRouteId === 'route-1')!;
    expect(transportItem.concessionAmount).toBe(0);
    expect(transportItem.netAmount).toBe(300); // not apportioned a share of the 200

    const itemNetSum = result.items.reduce((s, i) => s + i.netAmount, 0);
    expect(itemNetSum).toBe(1300); // documented: does NOT equal result.net (1100) when a whole-bill concession is active
    expect(itemNetSum).not.toBe(result.net);
  });
});
