import { describe, it, expect } from 'vitest';
import { subjectColor, SUBJECT_PALETTE } from '../subjects';

describe('subjectColor', () => {
  it('is stable for the same subject id across calls', () => {
    const first = subjectColor('subject-math-101');
    const second = subjectColor('subject-math-101');
    expect(first).toBe(second);
  });

  it('returns a real palette entry, not a fabricated value', () => {
    const style = subjectColor('subject-science-202');
    expect(SUBJECT_PALETTE).toContain(style);
  });

  it('distributes different ids across more than one palette entry', () => {
    const colors = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((id) => subjectColor(id)),
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});
