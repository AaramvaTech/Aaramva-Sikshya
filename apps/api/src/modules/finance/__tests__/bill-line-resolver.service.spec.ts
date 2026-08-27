import { bsToAd, daysInBsMonth } from 'bs-calendar';
import { Test } from '@nestjs/testing';
import { BillLineResolverService, prorate } from '../bill-line-resolver.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { StudentFeeStructureAssignmentService } from '../student-fee-structure-assignment.service';
import { FeePreviewService } from '../fee-preview.service';
import { formatLocalDate } from '../../common/utils/date.util';
import { Money } from '../../../common/money/money';

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
    // FEE-CLASS-GUARD's override stamp — all-or-nothing, so an ordinary
    // (non-overridden) assignment carries the false/null triple.
    class_mismatch_overridden: false, overridden_by_user_id: null, overridden_at: null,
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

/**
 * D5-PRORATION-PRECISION. Pure-function tests — no mocking, no NestJS
 * module, no BS calendar dependency. `prorate()` takes plain integer day
 * counts, so every case here is a literal, hand-computed expected value,
 * not `toBeCloseTo` — the whole point is that the 2dp result is EXACT, not
 * approximately right within float tolerance.
 */
describe('prorate() — D5-PRORATION-PRECISION', () => {
  it("the ticket's own worked example: 30-day month, 17 billed, Rs 1000.00 -> exactly 566.67, not 566.66 or 566.68", () => {
    const result = prorate(Money.fromDb('1000.00'), 17, 30);
    expect(result.toDb()).toBe('566.67');
    expect(result.toDb()).not.toBe('566.66');
    expect(result.toDb()).not.toBe('566.68');
  });

  it('full month (daysBilled === daysInMonth): the identity — untouched, not merely close', () => {
    const amount = Money.fromDb('1234.56');
    const result = prorate(amount, 31, 31);
    expect(result.toDb()).toBe('1234.56');
    // Genuinely the same value, not a coincidentally-equal recomputation —
    // confirms the identity short-circuit actually returns `amount` itself.
    expect(result).toBe(amount);
  });

  it('last day of the month only (daysBilled=1, an assignment joining on the final day): exact, not rounded twice', () => {
    // 1000/31 = 32.258064516... -> 32.26 (third decimal 8, rounds up)
    const result = prorate(Money.fromDb('1000.00'), 1, 31);
    expect(result.toDb()).toBe('32.26');
  });

  it('all but one day billed (daysBilled = daysInMonth - 1): the other edge from single-day', () => {
    // 1000 * 30/31 = 967.741935... -> 967.74
    const result = prorate(Money.fromDb('1000.00'), 30, 31);
    expect(result.toDb()).toBe('967.74');
  });

  it('a fraction exactly representable in binary (15/30 = 0.5): unchanged from what the old float path already gave', () => {
    const amount = Money.fromDb('1999.99');
    const result = prorate(amount, 15, 30);
    // What the OLD code computed: amount.mul(daysBilled / daysInMonth) with
    // the precomputed JS double. 0.5 is exact in binary, so this old-style
    // computation is ALSO exact here -- the fix must not perturb this case.
    const oldStyle = amount.mul(15 / 30);
    expect(result.toDb()).toBe(oldStyle.toDb());
    // 1999.99 * 0.5 = 999.995 exactly (a genuine tie) -> half-up -> 1000.00.
    expect(result.toDb()).toBe('1000.00');
  });

  it('the two ratios actually present in dev data (1/31 and 16/29) pin exact values, not just "close"', () => {
    // BINV-2083-000001..006 in tenant_motherland_school, base 100.00, 1/31 days.
    expect(prorate(Money.fromDb('100.00'), 1, 31).toDb()).toBe('3.23');
    // BINV-2083-000048 in tenant_motherland_school, base 100.00, 16/29 days.
    expect(prorate(Money.fromDb('100.00'), 16, 29).toDb()).toBe('55.17');
  });
});

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

  // FEE-CLASS-GUARD indifference. An overridden cross-class assignment is
  // DELIBERATE and legitimate — Transport and Hostel are routinely assigned
  // across classes — so it must bill exactly like a matched one.
  //
  // This asserts BEHAVIOUR, not the columns. The resolver never reads the
  // override stamp (grep it: nothing), so asserting `class_mismatch_overridden`
  // on a fixture would only check the fixture. What is worth pinning is the
  // invariant that rests on the ABSENCE of code, and which would break silently
  // the day someone adds a `WHERE class_mismatch_overridden = false` or a
  // "skip overridden assignments" branch.
  it('an OVERRIDDEN cross-class assignment bills byte-identically to a matched one', async () => {
    const heads = [
      { feeHeadId: 'fh-1', feeHeadName: 'Transport Levy', grossAmount: 3000, overrideAmount: null, effectiveBase: 3000, concessions: [], netAmount: 3000 },
    ];
    const headMeta = [{ id: 'fh-1', is_taxable: true, recurrence: 'MONTHLY', proration_policy: 'MONTHLY' }];
    const taxRate = [{ id: 'tax-1', rate: 13, applies_to: 'ALL' }];

    // Run 1 — an ordinary, class-matching assignment.
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(
      makeAssignment(MID_EFFECTIVE_FROM),
    );
    feePreviewService.preview.mockResolvedValueOnce(makePreview(heads) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce(headMeta)
      .mockResolvedValueOnce(taxRate);
    const matched = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);

    jest.clearAllMocks();

    // Run 2 — same everything, except the assignment carries the full override
    // stamp: a Grade 1 structure deliberately assigned to a Grade 5 student.
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce({
      ...makeAssignment(MID_EFFECTIVE_FROM),
      class_mismatch_overridden: true,
      overridden_by_user_id: 'user-9',
      overridden_at: new Date('2026-08-21T00:00:00.000Z'),
    });
    feePreviewService.preview.mockResolvedValueOnce(makePreview(heads) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce(headMeta)
      .mockResolvedValueOnce(taxRate);
    const overridden = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);

    // Byte-identical: outcome, money, tax, proration and every line item.
    expect(overridden).toEqual(matched);
    // Proved against a case that actually computes something — a prorated,
    // taxed line — so an accidental pass on two empty results is impossible.
    expect(matched.outcome).toBe('DRAFT');
    expect(matched.taxAmount).toBeGreaterThan(0);
    expect(matched.items[0].prorationNote).not.toBeNull();
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

  // D5-PRORATION-PRECISION. The test above uses DAYS_IN_MONTH*100 as the
  // gross, which divides out cleanly regardless of arithmetic precision —
  // it cannot tell an exact result from a merely-close one. This uses an
  // amount that does NOT divide evenly, and asserts an EXACT value (not
  // toBeCloseTo), proving daysBilled/daysInMonth actually reach prorate()
  // through the real resolve() pipeline — the pure-function tests above
  // already prove prorate() itself is exact; this proves the wiring is.
  it('D5-PRORATION-PRECISION: mid-period proration through the real pipeline is exact, not merely close', async () => {
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment(MID_EFFECTIVE_FROM));
    feePreviewService.preview.mockResolvedValueOnce(makePreview([
      { feeHeadId: 'fh-monthly', feeHeadName: 'Tuition', grossAmount: 1000, overrideAmount: null, effectiveBase: 1000, concessions: [], netAmount: 1000 },
    ]) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'fh-monthly', is_taxable: false, recurrence: 'MONTHLY', proration_policy: 'MONTHLY' }])
      .mockResolvedValueOnce([]); // no active tax rate

    const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);

    const expected = prorate(Money.fromDb('1000.00'), EXPECTED_DAYS_BILLED, DAYS_IN_MONTH).toNumber();
    expect(result.items[0].grossAmount).toBe(expected);
    expect(result.gross).toBe(expected);
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

  it('mid-period join: a whole-bill concession is prorated by the same day fraction as MONTHLY heads (not applied at full, unprorated strength)', async () => {
    assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment(MID_EFFECTIVE_FROM));
    feePreviewService.preview.mockResolvedValueOnce(makePreview(
      [{ feeHeadId: 'fh-monthly', feeHeadName: 'Tuition', grossAmount: DAYS_IN_MONTH * 100, overrideAmount: null, effectiveBase: DAYS_IN_MONTH * 100, concessions: [], netAmount: DAYS_IN_MONTH * 100 }],
      null,
      [{ amount: DAYS_IN_MONTH * 10 }], // FeePreviewService's own unprorated whole-bill concession amount
    ) as any);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ id: 'fh-monthly', is_taxable: false, recurrence: 'MONTHLY', proration_policy: 'MONTHLY' }])
      .mockResolvedValueOnce([]); // no active tax rate

    const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);

    const expectedProratedGross = (DAYS_IN_MONTH * 100 * EXPECTED_DAYS_BILLED) / DAYS_IN_MONTH;
    const expectedProratedConcession = (DAYS_IN_MONTH * 10 * EXPECTED_DAYS_BILLED) / DAYS_IN_MONTH;

    expect(result.gross).toBeCloseTo(expectedProratedGross, 2);
    expect(result.concession).toBeCloseTo(expectedProratedConcession, 2);
    // The bug this pins: an UNPRORATED concession (fixed at DAYS_IN_MONTH*10, e.g. far
    // larger than a heavily-prorated gross near the period's end) must never be applied
    // at full strength against a prorated gross — net must reflect the SAME fraction on
    // both sides, not swing to (wrongly) clamped-zero.
    expect(result.net).toBeCloseTo(expectedProratedGross - expectedProratedConcession, 2);
  });

  it('D13-CLUSTER-FOOTING (was MUST-RESOLVE-BEFORE-BILL-8): whole-bill concession + transport together — items now foot the header exactly, apportioned by gross share', async () => {
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
    expect(result.net).toBe(1100); // header is correct: 1300 - 200, unchanged by this fix

    // 200 apportioned by gross share (1000:300): tuition 153.85, transport
    // 46.15 — sums to 200.00 exactly, no remainder left over (this is
    // apportionWholeBillConcession's own already-tested exact-remainder
    // guarantee, reused rather than reimplemented).
    const tuitionItem = result.items.find((i) => i.feeHeadId === 'fh-1')!;
    const transportItem = result.items.find((i) => i.transportRouteId === 'route-1')!;
    expect(tuitionItem.concessionAmount).toBe(153.85);
    expect(tuitionItem.netAmount).toBe(846.15);
    expect(transportItem.concessionAmount).toBe(46.15);
    expect(transportItem.netAmount).toBe(253.85); // previously 300, unapportioned — the D13 defect

    const itemNetSum = result.items.reduce((s, i) => s + i.netAmount, 0);
    expect(itemNetSum).toBeCloseTo(result.net, 2); // items now foot the header — the fix
  });

  describe('D13-CLUSTER-FOOTING — footing invariant on new invoices', () => {
    it('a plain invoice with no whole-bill concession still foots (the common case, unaffected by the fix)', async () => {
      assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment('2025-04-13'));
      feePreviewService.preview.mockResolvedValueOnce(makePreview(
        [{ feeHeadId: 'fh-1', feeHeadName: 'Tuition', grossAmount: 1000, overrideAmount: null, effectiveBase: 1000, concessions: [], netAmount: 1000 }],
        null,
        [],
      ) as any);
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'fh-1', is_taxable: false, recurrence: 'MONTHLY', proration_policy: 'NONE' }])
        .mockResolvedValueOnce([]);

      const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);
      const itemNetSum = result.items.reduce((s, i) => s + i.netAmount, 0);
      expect(itemNetSum).toBe(result.net);
    });

    it('D8 overshoot reaching the header (a whole-bill concession bigger than the entire bill) still foots exactly, clamped at net=0 — does NOT throw', async () => {
      // A single 50-gross item against a 200 whole-bill concession: the
      // HEADER's own pre-existing clamp (unchanged by this ticket) floors
      // net at 0 rather than going negative, and reconciliation only ever
      // has to foot items to THAT already-safe target — it can always do so
      // exactly, because a single item's own [≤gross] ceiling gives it
      // exactly enough room to absorb whatever the header already reduced
      // the target to. FOOTING_MISMATCH is a real assertion (see
      // bill-footing.util.spec.ts for a case where it genuinely fires) but
      // this — the scenario it looks like it exists for — is not it.
      assignmentService.findAssignmentOverlappingPeriod.mockResolvedValueOnce(makeAssignment('2025-04-13'));
      feePreviewService.preview.mockResolvedValueOnce(makePreview(
        [{ feeHeadId: 'fh-1', feeHeadName: 'Tuition', grossAmount: 50, overrideAmount: null, effectiveBase: 50, concessions: [], netAmount: 50 }],
        null,
        [{ amount: 200 }],
      ) as any);
      (tenantPrisma.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 'fh-1', is_taxable: false, recurrence: 'MONTHLY', proration_policy: 'NONE' }])
        .mockResolvedValueOnce([]);

      const result = await service.resolve('student-1', 'year-1', BS_YEAR, BS_MONTH);
      expect(result.net).toBe(0); // header's own pre-existing clamp, unrelated to this ticket
      expect(result.items[0].netAmount).toBe(0);
      expect(result.items[0].concessionAmount).toBe(50); // capped at this item's own gross, not 200
    });
  });
});
