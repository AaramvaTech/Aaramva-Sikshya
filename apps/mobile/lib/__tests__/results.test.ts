import { describe, it, expect } from '@jest/globals';
import { gpaTrend, gpaChange, rankChange, subjectInsights } from '../results';

describe('Results derivation helpers', () => {
  it('gpaTrend drops null-GPA terms', () => {
    expect(gpaTrend([{ name: 'T1', gpa: 3.2 }, { name: 'T2', gpa: null }, { name: 'T3', gpa: 3.6 }]))
      .toEqual([{ label: 'T1', gpa: 3.2 }, { label: 'T3', gpa: 3.6 }]);
  });
  it('gpaChange diffs vs previous term', () => {
    expect(gpaChange([{ gpa: 3.2 }, { gpa: 3.6 }], 1)).toBe(0.4);
    expect(gpaChange([{ gpa: 3.2 }], 0)).toBeNull();
  });
  it('rankChange is positive when rank improves', () => {
    expect(rankChange([{ rankInClass: 5 }, { rankInClass: 2 }], 1)).toBe(3);
  });
  it('subjectInsights picks max and min by percentage', () => {
    const subs = [
      { subjectName: 'Math', percentage: 92, marksObtained: 92, fullMarks: 100, grade: 'A+' },
      { subjectName: 'Eng', percentage: 55, marksObtained: 55, fullMarks: 100, grade: 'C' },
    ];
    const r = subjectInsights(subs);
    expect(r.top?.subjectName).toBe('Math');
    expect(r.focus?.subjectName).toBe('Eng');
  });
  it('subjectInsights returns null focus (not a duplicate) when only one subject is graded', () => {
    const subs = [
      { subjectName: 'Math', percentage: 92, marksObtained: 92, fullMarks: 100, grade: 'A+' },
    ];
    const r = subjectInsights(subs);
    expect(r.top?.subjectName).toBe('Math');
    expect(r.focus).toBeNull();
  });
});
