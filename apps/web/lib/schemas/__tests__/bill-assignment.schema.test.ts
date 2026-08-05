import { describe, it, expect } from 'vitest';
import {
  assignFeeStructureSchema,
  studentFeeOverrideSchema,
  studentConcessionSchema,
  studentTransportAssignmentSchema,
} from '../bill-assignment.schema';

describe('assignFeeStructureSchema', () => {
  it('accepts a valid assignment', () => {
    expect(assignFeeStructureSchema.safeParse({ feeStructureId: 'bfs-1', effectiveFrom: '2026-04-14' }).success).toBe(true);
  });
  it('rejects a missing feeStructureId', () => {
    expect(assignFeeStructureSchema.safeParse({ feeStructureId: '', effectiveFrom: '2026-04-14' }).success).toBe(false);
  });
});

describe('studentFeeOverrideSchema', () => {
  const valid = { feeHeadId: 'head-1', overrideAmount: 5000, effectiveFrom: '2026-04-14' };
  it('accepts a valid override', () => {
    expect(studentFeeOverrideSchema.safeParse(valid).success).toBe(true);
  });
  it('rejects a negative overrideAmount', () => {
    expect(studentFeeOverrideSchema.safeParse({ ...valid, overrideAmount: -1 }).success).toBe(false);
  });
  it('accepts overrideAmount of exactly 0 (a full waiver via override)', () => {
    expect(studentFeeOverrideSchema.safeParse({ ...valid, overrideAmount: 0 }).success).toBe(true);
  });
  it('requires a fee head', () => {
    expect(studentFeeOverrideSchema.safeParse({ ...valid, feeHeadId: '' }).success).toBe(false);
  });
});

describe('studentConcessionSchema', () => {
  const valid = { type: 'PERCENT' as const, value: 10, discountReasonId: 'reason-1', effectiveFrom: '2026-04-14' };
  it('accepts a whole-bill concession (no feeHeadId)', () => {
    expect(studentConcessionSchema.safeParse(valid).success).toBe(true);
  });
  it('accepts a head-scoped concession', () => {
    expect(studentConcessionSchema.safeParse({ ...valid, feeHeadId: 'head-1' }).success).toBe(true);
  });
  it('rejects value <= 0', () => {
    expect(studentConcessionSchema.safeParse({ ...valid, value: 0 }).success).toBe(false);
  });
  it('rejects a type outside PERCENT/AMOUNT', () => {
    expect(studentConcessionSchema.safeParse({ ...valid, type: 'FLAT' }).success).toBe(false);
  });
  it('requires a discount reason', () => {
    expect(studentConcessionSchema.safeParse({ ...valid, discountReasonId: '' }).success).toBe(false);
  });
  it('accepts an optional capAmount', () => {
    expect(studentConcessionSchema.safeParse({ ...valid, capAmount: 2000 }).success).toBe(true);
  });
});

describe('studentTransportAssignmentSchema', () => {
  it('accepts a valid assignment', () => {
    expect(studentTransportAssignmentSchema.safeParse({ transportRouteId: 'route-1', effectiveFrom: '2026-04-14' }).success).toBe(true);
  });
  it('requires a route', () => {
    expect(studentTransportAssignmentSchema.safeParse({ transportRouteId: '', effectiveFrom: '2026-04-14' }).success).toBe(false);
  });
});
