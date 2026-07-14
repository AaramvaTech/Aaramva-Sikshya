export interface TermLite { name: string; gpa: number | null; rankInClass: number | null; }
export interface SubjectLite { subjectName: string; percentage: number | null; marksObtained: number | null; fullMarks: number; grade: string | null; }

export function gpaTrend(terms: { name: string; gpa: number | null }[]): { label: string; gpa: number }[] {
  return terms.filter((t): t is { name: string; gpa: number } => t.gpa != null).map((t) => ({ label: t.name, gpa: t.gpa }));
}
export function gpaChange(terms: { gpa: number | null }[], index: number): number | null {
  if (index <= 0) return null;
  const cur = terms[index]?.gpa, prev = terms[index - 1]?.gpa;
  return cur != null && prev != null ? Math.round((cur - prev) * 100) / 100 : null;
}
export function rankChange(terms: { rankInClass: number | null }[], index: number): number | null {
  if (index <= 0) return null;
  const cur = terms[index]?.rankInClass, prev = terms[index - 1]?.rankInClass;
  return cur != null && prev != null ? prev - cur : null;
}
export function subjectInsights(subjects: SubjectLite[]): { top: SubjectLite | null; focus: SubjectLite | null } {
  const graded = subjects.filter((s) => s.percentage != null);
  if (!graded.length) return { top: null, focus: null };
  if (graded.length === 1) return { top: graded[0], focus: null };
  const sorted = [...graded].sort((a, b) => (b.percentage as number) - (a.percentage as number));
  return { top: sorted[0], focus: sorted[sorted.length - 1] };
}
