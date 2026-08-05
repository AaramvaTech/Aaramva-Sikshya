import { describe, it, expect } from 'vitest';
import { billFeeStructureSchema } from '../bill-fee-structure.schema';

const validItem = { feeHeadId: 'head-1', amount: 1500, effectiveFrom: '2026-04-14' };

describe('billFeeStructureSchema', () => {
  it('accepts a valid structure with one item', () => {
    const result = billFeeStructureSchema.safeParse({
      classId: 'class-1', academicYearId: 'year-1', name: 'Grade 9 Fees', items: [validItem],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty items array', () => {
    const result = billFeeStructureSchema.safeParse({
      classId: 'class-1', academicYearId: 'year-1', name: 'Grade 9 Fees', items: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an item with amount <= 0', () => {
    const result = billFeeStructureSchema.safeParse({
      classId: 'class-1', academicYearId: 'year-1', name: 'Grade 9 Fees',
      items: [{ ...validItem, amount: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an item missing feeHeadId', () => {
    const result = billFeeStructureSchema.safeParse({
      classId: 'class-1', academicYearId: 'year-1', name: 'Grade 9 Fees',
      items: [{ ...validItem, feeHeadId: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('requires classId and academicYearId', () => {
    const result = billFeeStructureSchema.safeParse({ classId: '', academicYearId: '', name: 'X', items: [validItem] });
    expect(result.success).toBe(false);
  });

  it('accepts an optional sectionId, recurrenceOverride, and effectiveTo', () => {
    const result = billFeeStructureSchema.safeParse({
      classId: 'class-1', academicYearId: 'year-1', sectionId: 'section-1', name: 'Grade 9 Fees',
      items: [{ ...validItem, recurrenceOverride: 'QUARTERLY', effectiveTo: '2027-03-31' }],
    });
    expect(result.success).toBe(true);
  });
});
