/** EDU-1 row shapes (snake_case, as Postgres returns them) + transformers. */

export interface AssignmentRow {
  id: string;
  academic_year_id: string;
  class_id: string;
  section_id: string | null;
  subject_id: string;
  created_by: string;
  title: string;
  description: string | null;
  due_date: Date;
  attachment_keys: string[];
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  // enriched by JOINs in list/detail queries
  class_name?: string;
  section_name?: string | null;
  subject_name?: string;
  teacher_name?: string;
  submission_count?: string;
}

export interface SubmissionRow {
  id: string;
  assignment_id: string;
  student_id: string;
  text_answer: string | null;
  file_key: string | null;
  submitted_at: Date;
  status: 'SUBMITTED' | 'LATE' | 'REVIEWED';
  marks: string | null;
  feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  // enriched
  first_name?: string;
  last_name?: string;
  roll_number?: number | null;
}

/** DB-sourced DATE values round-trip via toISOString (UTC-frame consistent —
 *  see FIX-2 notes in date.util.ts); timestamps are plain ISO. */
function dbDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toAssignmentResponse(r: AssignmentRow) {
  return {
    id: r.id,
    academicYearId: r.academic_year_id,
    classId: r.class_id,
    sectionId: r.section_id,
    subjectId: r.subject_id,
    createdBy: r.created_by,
    title: r.title,
    description: r.description,
    dueDate: dbDateOnly(r.due_date),
    attachmentKeys: r.attachment_keys ?? [],
    status: r.status,
    publishedAt: r.published_at ? r.published_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    ...(r.class_name !== undefined ? { className: r.class_name } : {}),
    ...(r.section_name !== undefined ? { sectionName: r.section_name } : {}),
    ...(r.subject_name !== undefined ? { subjectName: r.subject_name } : {}),
    ...(r.teacher_name !== undefined ? { teacherName: r.teacher_name } : {}),
    ...(r.submission_count !== undefined
      ? { submissionCount: parseInt(r.submission_count, 10) }
      : {}),
  };
}

export type AssignmentResponseDto = ReturnType<typeof toAssignmentResponse>;

export function toSubmissionResponse(r: SubmissionRow) {
  return {
    id: r.id,
    assignmentId: r.assignment_id,
    studentId: r.student_id,
    textAnswer: r.text_answer,
    fileKey: r.file_key,
    submittedAt: r.submitted_at.toISOString(),
    status: r.status,
    marks: r.marks !== null ? Number(r.marks) : null,
    feedback: r.feedback,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    ...(r.first_name !== undefined
      ? { studentName: `${r.first_name} ${r.last_name}`, rollNumber: r.roll_number ?? null }
      : {}),
  };
}

export type SubmissionResponseDto = ReturnType<typeof toSubmissionResponse>;
