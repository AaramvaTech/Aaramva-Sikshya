import type { StudentSummary } from '@/types/api.types';

/** UI-2 §5.2 — the STUDENT_LIST chip picker's core logic, pulled out of
 * bulk-assign-dialog.tsx so it's unit-testable without rendering the dialog. */
export function addPickedStudent(list: StudentSummary[], student: StudentSummary): StudentSummary[] {
  if (list.some((s) => s.id === student.id)) return list;
  return [...list, student];
}

export function removePickedStudent(list: StudentSummary[], studentId: string): StudentSummary[] {
  return list.filter((s) => s.id !== studentId);
}
