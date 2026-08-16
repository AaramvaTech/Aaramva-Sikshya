import { describe, it, expect } from 'vitest';
import { isClassMismatch, describeScope, overrideFlag, resolveStructureScope } from '@/lib/class-guard';
import type { ClassWithSections } from '@/types/api.types';

const scope = (className: string | null, sectionName: string | null = null) => ({ className, sectionName });

const classes: ClassWithSections[] = [
  {
    id: 'c1', name: 'Grade 1', alias: null, orderIndex: 1,
    sections: [
      { id: 'secA', name: 'A', capacity: 40 },
      { id: 'secB', name: 'B', capacity: 40 },
    ],
  },
  { id: 'c5', name: 'Grade 5', alias: null, orderIndex: 5, sections: [{ id: 'sec5A', name: 'A', capacity: 40 }] },
];

// Mirrors apps/api/src/modules/finance/__tests__/bill-class-guard.util.spec.ts —
// the two rules must stay in step or the UI will warn where the server allows
// (or, worse, stay quiet where the server blocks).
describe('isClassMismatch', () => {
  it('matches on the same class when the structure has no section', () => {
    expect(isClassMismatch(scope('Grade 1'), scope('Grade 1', 'A'))).toBe(false);
  });

  it('mismatches on a different class', () => {
    expect(isClassMismatch(scope('Grade 1'), scope('Grade 5', 'A'))).toBe(true);
  });

  it('ignores the student section entirely when the structure has none', () => {
    expect(isClassMismatch(scope('Grade 1'), scope('Grade 1', null))).toBe(false);
    expect(isClassMismatch(scope('Grade 1'), scope('Grade 1', 'B'))).toBe(false);
  });

  it('requires the exact section when the structure specifies one', () => {
    expect(isClassMismatch(scope('Grade 1', 'A'), scope('Grade 1', 'A'))).toBe(false);
    expect(isClassMismatch(scope('Grade 1', 'A'), scope('Grade 1', 'B'))).toBe(true);
    expect(isClassMismatch(scope('Grade 1', 'A'), scope('Grade 1', null))).toBe(true);
  });

  // Spec addendum A1.
  it('mismatches a student with no class', () => {
    expect(isClassMismatch(scope('Grade 1'), scope(null))).toBe(true);
    expect(isClassMismatch(scope(null), scope(null))).toBe(true);
  });
});

// Spec §3's hard rule: "Do not silently submit with the override flag."
// This is the one expression both forms route their request body through.
describe('overrideFlag', () => {
  it('attaches the flag ONLY on a confirmed mismatch', () => {
    expect(overrideFlag(true, true)).toEqual({ allowCrossClassAssignment: true });
  });

  it('omits the key entirely when the mismatch is unconfirmed', () => {
    expect(overrideFlag(true, false)).toEqual({});
    expect('allowCrossClassAssignment' in overrideFlag(true, false)).toBe(false);
  });

  // The nastiest failure mode: a stale tick left over from a previous
  // selection riding along on an assignment that actually matches. Callers
  // re-arm the checkbox on every input change, and this is the backstop.
  it('omits the key when there is no mismatch, even if the box is somehow ticked', () => {
    expect(overrideFlag(false, true)).toEqual({});
    expect(overrideFlag(false, false)).toEqual({});
  });
});

describe('describeScope', () => {
  it('names the section only when there is one', () => {
    expect(describeScope(scope('Grade 1'))).toBe('Grade 1');
    expect(describeScope(scope('Grade 1', 'A'))).toBe('Grade 1 — A');
    expect(describeScope(scope(null))).toBe('(no class)');
  });
});

// The async-gate half. This project has shipped this bug class repeatedly
// (WEB-P Phases 2-4): a dependent value read before its source query settles.
// Here a half-loaded class list would resolve every structure to "no class"
// and fire a mismatch warning on a perfectly valid assignment — so an
// unresolved scope must be null ("don't know yet"), never a scope object.
describe('resolveStructureScope', () => {
  it('returns null while the class list is still undefined', () => {
    expect(resolveStructureScope(undefined, { classId: 'c1', sectionId: null })).toBeNull();
  });

  it('returns null when no structure is selected', () => {
    expect(resolveStructureScope(classes, undefined)).toBeNull();
  });

  it('returns null when the class is not in the list (stale/filtered list)', () => {
    expect(resolveStructureScope(classes, { classId: 'c-gone', sectionId: null })).toBeNull();
  });

  it('returns null when the section id cannot be resolved within its class', () => {
    expect(resolveStructureScope(classes, { classId: 'c1', sectionId: 'sec-gone' })).toBeNull();
  });

  it('resolves a whole-class structure to a null section', () => {
    expect(resolveStructureScope(classes, { classId: 'c1', sectionId: null }))
      .toEqual({ className: 'Grade 1', sectionName: null });
  });

  it('resolves a section-scoped structure to both names', () => {
    expect(resolveStructureScope(classes, { classId: 'c1', sectionId: 'secB' }))
      .toEqual({ className: 'Grade 1', sectionName: 'B' });
  });

  // The whole point of the gate: null must not be fed to isClassMismatch as a
  // scope. Callers guard on `!!structureScope`; this pins why.
  it('a null resolve would have produced a FALSE mismatch if treated as a scope', () => {
    const unresolved = resolveStructureScope(undefined, { classId: 'c1', sectionId: null });
    expect(unresolved).toBeNull();
    // What the bug would look like if a caller coerced null to an empty scope:
    expect(isClassMismatch({ className: null, sectionName: null }, scope('Grade 1', 'A'))).toBe(true);
  });
});
