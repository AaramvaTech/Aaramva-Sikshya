import { describe, it, expect } from 'vitest';
import { formatClassSection } from '@/lib/class-section';

describe('formatClassSection', () => {
  it('joins class and section', () => expect(formatClassSection('Grade 9', 'B')).toBe('Grade 9 · B'));
  it('class only when no section', () => expect(formatClassSection('Grade 9', null)).toBe('Grade 9'));
  it('dash when the student has no class', () => expect(formatClassSection(null, 'A')).toBe('—'));
});
