import { describe, it, expect } from 'vitest';
import { addPickedStudent, removePickedStudent } from '../student-picker';
import type { StudentSummary } from '@/types/api.types';

function student(id: string): StudentSummary {
  return {
    id, studentId: `S-${id}`, firstName: 'First', lastName: id, fullName: `First ${id}`,
    gender: 'MALE', dateOfBirth: { ad: '2015-01-01', bs: '2071-09-17' }, status: 'ACTIVE',
    className: 'Grade 9', sectionName: 'A', rollNumber: 1, photoUrl: null,
  };
}

describe('addPickedStudent', () => {
  it('appends a new student', () => {
    const result = addPickedStudent([], student('1'));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('does not add a student already in the list (no duplicate chips)', () => {
    const list = [student('1')];
    const result = addPickedStudent(list, student('1'));
    expect(result).toHaveLength(1);
    expect(result).toBe(list); // same reference — no new array on a no-op
  });

  it('preserves existing entries when appending', () => {
    const list = [student('1')];
    const result = addPickedStudent(list, student('2'));
    expect(result.map((s) => s.id)).toEqual(['1', '2']);
  });
});

describe('removePickedStudent', () => {
  it('removes the matching student', () => {
    const list = [student('1'), student('2')];
    const result = removePickedStudent(list, '1');
    expect(result.map((s) => s.id)).toEqual(['2']);
  });

  it('is a no-op for an id not in the list', () => {
    const list = [student('1')];
    const result = removePickedStudent(list, 'missing');
    expect(result.map((s) => s.id)).toEqual(['1']);
  });
});
