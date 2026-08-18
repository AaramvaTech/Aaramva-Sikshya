import { describe, it, expect } from 'vitest';
import { normalizeJobFailures, skippedLabel, successLabel } from '@/lib/job-progress';

/**
 * BILL-8-UI Phase 2 — `GET /finance/jobs/:id` serves two job families whose
 * failure rows are keyed differently. <BulkJobProgress> was generalised rather
 * than forked, so this pins BOTH shapes, and pins that FEE-CLASS-GUARD's
 * optional `reason` survives the generalisation.
 */
describe('normalizeJobFailures', () => {
  it('keys a bulk-assign failure by studentId', () => {
    expect(normalizeJobFailures([
      { studentId: 'stu-9', error: 'Student not found or inactive' },
    ])).toEqual([{ id: 'stu-9', error: 'Student not found or inactive' }]);
  });

  it('keys a bill-print failure by invoiceId', () => {
    expect(normalizeJobFailures([
      { invoiceId: 'inv-3', error: 'Render failed' },
    ])).toEqual([{ id: 'inv-3', error: 'Render failed' }]);
  });

  // FEE-CLASS-GUARD must survive Phase 2's generalisation — this is the
  // regression that would silently drop the "Class mismatch" label.
  it('carries CLASS_MISMATCH through', () => {
    expect(normalizeJobFailures([
      { studentId: 'stu-5', error: 'Class mismatch. …', reason: 'CLASS_MISMATCH' },
    ])).toEqual([{ id: 'stu-5', error: 'Class mismatch. …', reason: 'CLASS_MISMATCH' }]);
  });

  it('omits reason entirely when absent, never inventing one', () => {
    const [row] = normalizeJobFailures([{ studentId: 'stu-9', error: 'boom' }]);
    expect('reason' in row).toBe(false);
  });

  it('normalises a mixed list without dropping either family', () => {
    expect(normalizeJobFailures([
      { studentId: 'stu-1', error: 'a', reason: 'STUDENT_INVALID' },
      { invoiceId: 'inv-1', error: 'b' },
    ])).toEqual([
      { id: 'stu-1', error: 'a', reason: 'STUDENT_INVALID' },
      { id: 'inv-1', error: 'b' },
    ]);
  });

  it('prefers studentId when both are somehow present', () => {
    expect(normalizeJobFailures([{ studentId: 's', invoiceId: 'i', error: 'x' }])[0].id).toBe('s');
  });

  // Losing a failure silently is worse than showing one without a name: the
  // count beside the list would then disagree with the list itself.
  it('keeps a row that has neither id rather than dropping it', () => {
    const rows = normalizeJobFailures([{ error: 'orphan' } as never]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: '', error: 'orphan' });
  });

  it('treats null/undefined failures as empty', () => {
    expect(normalizeJobFailures(undefined)).toEqual([]);
    expect(normalizeJobFailures(null)).toEqual([]);
  });
});

describe('wording', () => {
  it('keeps the exact bulk-assign wording that shipped before Phase 2', () => {
    expect(skippedLabel(1, 'student')).toBe('1 student skipped');
    expect(skippedLabel(3, 'student')).toBe('3 students skipped');
    expect(successLabel(1, 'student')).toBe('All 1 student assigned successfully.');
    expect(successLabel(12, 'student')).toBe('All 12 students assigned successfully.');
  });

  it('says "printed" for invoices, not "assigned"', () => {
    expect(skippedLabel(2, 'invoice')).toBe('2 invoices skipped');
    expect(successLabel(40, 'invoice')).toBe('All 40 invoices printed successfully.');
    expect(successLabel(1, 'invoice')).toBe('All 1 invoice printed successfully.');
  });
});
