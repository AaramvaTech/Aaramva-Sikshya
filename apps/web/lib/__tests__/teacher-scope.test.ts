import { describe, it, expect } from 'vitest';
import { resolveScopeReady } from '../teacher-scope';

// WEB-P Phase 2 Task 6 — pins Task 5's fix contract (extracted from
// CreateAssignmentDialog's `effectiveScopeAll` expression in
// app/(portal)/teacher/assignments/page.tsx). Regression coverage for the
// "async value feeds a render decision with no gate tied to its own loading
// state" bug shape — the same shape Tasks 3 and 4 hit as query races.
describe('resolveScopeReady', () => {
  it('stays false while sections are still loading, even with zero owned so far', () => {
    expect(resolveScopeReady(false, true, 0)).toBe(false);
  });

  it('stays false while still loading, regardless of the (stale) owned count', () => {
    expect(resolveScopeReady(false, true, 3)).toBe(false);
  });

  it('becomes true once loaded with zero owned sections — nothing to narrow to', () => {
    expect(resolveScopeReady(false, false, 0)).toBe(true);
  });

  it('stays false once loaded with some owned sections (narrows to "my classes")', () => {
    expect(resolveScopeReady(false, false, 5)).toBe(false);
  });

  it('explicit browse-all overrides everything, even mid-load', () => {
    expect(resolveScopeReady(true, true, 0)).toBe(true);
  });

  it('explicit browse-all overrides a nonzero owned count once loaded', () => {
    expect(resolveScopeReady(true, false, 5)).toBe(true);
  });
});
