import { describe, it, expect } from 'vitest';
import { canSubmitBillRunDraft, billRunScopeLabel } from '../bill-run-form';

// UI-3-SPEC.md §5.2/§7 — pure gating function for the create-draft dialog's
// submit button, mirroring how bulk-assign-dialog.tsx's own canSubmit is
// inline-computed but kept small enough to reason about; pulled into its own
// tested function here since it has a real branch (CLASS requires classId,
// WHOLE_SCHOOL doesn't).

const base = {
  academicYearId: 'year-1',
  scope: 'WHOLE_SCHOOL' as const,
  classId: '',
  bsYear: 2083,
  bsMonth: 3,
};

describe('canSubmitBillRunDraft', () => {
  it('allows WHOLE_SCHOOL with no classId', () => {
    expect(canSubmitBillRunDraft(base)).toBe(true);
  });

  it('rejects CLASS scope without a classId', () => {
    expect(canSubmitBillRunDraft({ ...base, scope: 'CLASS', classId: '' })).toBe(false);
  });

  it('allows CLASS scope once classId is set', () => {
    expect(canSubmitBillRunDraft({ ...base, scope: 'CLASS', classId: 'class-1' })).toBe(true);
  });

  it('rejects a missing academicYearId', () => {
    expect(canSubmitBillRunDraft({ ...base, academicYearId: '' })).toBe(false);
  });

  it('rejects a missing bsMonth', () => {
    expect(canSubmitBillRunDraft({ ...base, bsMonth: 0 })).toBe(false);
  });
});

describe('billRunScopeLabel', () => {
  const classes = [{ id: 'c1', name: 'Grade 9', sections: [{ id: 's1', name: 'B' }] }];
  it('labels whole school', () => {
    expect(billRunScopeLabel({ scope: 'WHOLE_SCHOOL', classId: null }, classes)).toBe('Whole School');
  });
  it('labels a whole class', () => {
    expect(billRunScopeLabel({ scope: 'CLASS', classId: 'c1', sectionId: null }, classes)).toBe('Grade 9');
  });
  it('labels a class + section', () => {
    expect(billRunScopeLabel({ scope: 'CLASS', classId: 'c1', sectionId: 's1' }, classes)).toBe('Grade 9 · B');
  });
  it('falls back to "Class" while classes load', () => {
    expect(billRunScopeLabel({ scope: 'CLASS', classId: 'c1', sectionId: 's1' }, undefined)).toBe('Class');
  });
});

describe('canSubmitBillRunDraft with a section', () => {
  it('does not require a section', () => {
    expect(canSubmitBillRunDraft({ academicYearId: 'y', scope: 'CLASS', classId: 'c1', sectionId: '', bsYear: 2083, bsMonth: 3 })).toBe(true);
  });
});
