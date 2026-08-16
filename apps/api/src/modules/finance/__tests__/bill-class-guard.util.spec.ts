import { isClassMismatch, describeScope, mismatchMessage } from '../bill-class-guard.util';

const scope = (
  classId: string | null,
  sectionId: string | null = null,
  className: string | null = null,
  sectionName: string | null = null,
) => ({ classId, sectionId, className, sectionName });

describe('isClassMismatch (FEE-CLASS-GUARD)', () => {
  it('matches when the classes are the same and the structure has no section', () => {
    expect(isClassMismatch(scope('c1'), scope('c1', 'secA'))).toBe(false);
  });

  it('mismatches on a different class', () => {
    expect(isClassMismatch(scope('c1'), scope('c5', 'secA'))).toBe(true);
  });

  // Spec "Section-level strictness": a section-less structure applies to the
  // WHOLE class, so a student's own section is irrelevant — including no section.
  it('ignores the student section entirely when the structure has none', () => {
    expect(isClassMismatch(scope('c1', null), scope('c1', null))).toBe(false);
    expect(isClassMismatch(scope('c1', null), scope('c1', 'secB'))).toBe(false);
  });

  it('requires the exact section when the structure specifies one', () => {
    expect(isClassMismatch(scope('c1', 'secA'), scope('c1', 'secA'))).toBe(false);
    expect(isClassMismatch(scope('c1', 'secA'), scope('c1', 'secB'))).toBe(true);
    expect(isClassMismatch(scope('c1', 'secA'), scope('c1', null))).toBe(true);
  });

  // A student with no class at all can't be confirmed as a match; the guard
  // blocks rather than waves through.
  it('mismatches a student with no class, even against a structure with none either', () => {
    expect(isClassMismatch(scope('c1'), scope(null))).toBe(true);
    expect(isClassMismatch(scope(null), scope(null))).toBe(true);
  });
});

describe('describeScope / mismatchMessage', () => {
  it('names the section only when there is one', () => {
    expect(describeScope(scope('c1', null, 'Grade 1'))).toBe('Grade 1');
    expect(describeScope(scope('c1', 'secA', 'Grade 1', 'A'))).toBe('Grade 1 — A');
    expect(describeScope(scope(null))).toBe('(no class)');
  });

  it('names both sides of the disagreement', () => {
    expect(mismatchMessage(scope('c1', null, 'Grade 1'), scope('c5', 'secA', 'Grade 5', 'A'))).toBe(
      'Fee structure is for Grade 1, but this student is in Grade 5 — A.',
    );
  });
});
