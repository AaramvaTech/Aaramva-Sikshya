/**
 * FEE-CLASS-GUARD — the single mismatch rule, shared by both write paths into
 * student_fee_structure_assignments (StudentFeeStructureAssignmentService.assign
 * and BulkAssignRunnerService.processChunk). Keeping it here rather than in
 * either caller is the point: a rule duplicated in two places is a rule that
 * eventually disagrees with itself.
 */

export interface ClassScope {
  classId: string | null;
  sectionId: string | null;
  className: string | null;
  sectionName: string | null;
}

/**
 * Spec "Section-level strictness": a structure with no section applies to the
 * whole class, so only class must match in that case. A structure WITH a
 * section requires the student to be in that exact section.
 *
 * A student with no class_id at all counts as a mismatch — we cannot confirm a
 * match, and this guard defaults to blocking rather than waving through.
 */
export function isClassMismatch(structure: ClassScope, student: ClassScope): boolean {
  if (!student.classId || student.classId !== structure.classId) return true;
  return structure.sectionId !== null && student.sectionId !== structure.sectionId;
}

/** "Grade 1" / "Grade 1 — A" / "(unassigned)" — for the human-readable half of the error. */
export function describeScope(scope: ClassScope): string {
  if (!scope.className) return '(no class)';
  return scope.sectionName ? `${scope.className} — ${scope.sectionName}` : scope.className;
}

export function mismatchMessage(structure: ClassScope, student: ClassScope): string {
  return `Fee structure is for ${describeScope(structure)}, but this student is in ${describeScope(student)}.`;
}
