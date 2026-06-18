import { adToBs } from 'bs-calendar';

// ─── Row shapes ────────────────────────────────────────────────────────────────

export interface GradingScaleRow {
  id: string;
  name: string;
  is_default: boolean;
  created_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface GradeThresholdRow {
  id: string;
  grading_scale_id: string;
  grade: string;
  gpa_point: string | null;
  min_percent: string;
  max_percent: string;
  remarks: string | null;
  created_at: Date | string;
}

export interface ExamTypeRow {
  id: string;
  name: string;
  weight_percent: string;
  academic_year_id: string;
  grading_scale_id: string | null;
  order_index: number;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface ExamScheduleRow {
  id: string;
  exam_type_id: string;
  class_id: string;
  subject_id: string;
  subject_name?: string;
  exam_date: Date | string;
  start_time: string;
  end_time: string;
  full_marks: string;
  pass_marks: string;
  theory_marks: string | null;
  practical_marks: string | null;
  room: string | null;
  invigilator_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface MarksRow {
  id: string;
  exam_schedule_id: string;
  student_id: string;
  marks_obtained: string | null;
  theory_marks: string | null;
  practical_marks: string | null;
  is_absent: boolean;
  is_expelled: boolean;
  remarks: string | null;
  entered_by: string;
  entered_at: Date | string;
  updated_at: Date | string;
  // joined fields
  full_marks?: string;
  pass_marks?: string;
}

export interface StudentResultRow {
  id: string;
  student_id: string;
  exam_type_id: string;
  academic_year_id: string;
  total_marks: string;
  obtained_marks: string;
  percentage: string;
  gpa: string | null;
  grade: string | null;
  division: string | null;
  rank_in_section: number | null;
  rank_in_class: number | null;
  is_pass: boolean;
  status: string;
  computed_at: Date | string;
}

export interface StudentSubjectResultRow {
  id: string;
  student_result_id: string;
  subject_id: string;
  subject_name: string;
  full_marks: string;
  marks_obtained: string | null;
  theory_marks: string | null;
  practical_marks: string | null;
  is_absent: boolean;
  percentage: string | null;
  grade: string | null;
  is_pass: boolean;
  created_at: Date | string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : parseFloat(v);
}

// Postgres TIME via Prisma raw query may arrive as "HH:MM:SS" or a JS Date
// serialised to "1970-01-01THH:MM:SS.000Z". Always return "HH:MM".
function toTimeField(t: unknown): string {
  if (!t) return '';
  const s = t instanceof Date ? t.toISOString() : String(t);
  if (s.includes('T')) return s.split('T')[1].substring(0, 5);
  return s.substring(0, 5);
}

function toDateField(d: Date | string | null | undefined): { ad: string; bs: string } | null {
  if (!d) return null;
  const dateStr = d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0];
  try {
    const bs = adToBs(new Date(dateStr));
    return {
      ad: dateStr,
      bs: `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`,
    };
  } catch {
    return { ad: dateStr, bs: dateStr };
  }
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface GradeThresholdResponseDto {
  id: string;
  grade: string;
  gpaPoint: number | null;
  minPercent: number;
  maxPercent: number;
  remarks: string | null;
}

export interface GradingScaleResponseDto {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: { ad: string; bs: string } | null;
  thresholds?: GradeThresholdResponseDto[];
}

export function toGradeThresholdResponse(row: GradeThresholdRow): GradeThresholdResponseDto {
  return {
    id: row.id,
    grade: row.grade,
    gpaPoint: row.gpa_point ? toNum(row.gpa_point) : null,
    minPercent: toNum(row.min_percent),
    maxPercent: toNum(row.max_percent),
    remarks: row.remarks ?? null,
  };
}

export function toGradingScaleResponse(
  row: GradingScaleRow,
  thresholds?: GradeThresholdRow[],
): GradingScaleResponseDto {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    createdAt: toDateField(row.created_at),
    thresholds: thresholds?.map(toGradeThresholdResponse),
  };
}

export interface ExamTypeResponseDto {
  id: string;
  name: string;
  weightPercent: number;
  academicYearId: string;
  gradingScaleId: string | null;
  orderIndex: number;
  createdAt: { ad: string; bs: string } | null;
  updatedAt: { ad: string; bs: string } | null;
}

export function toExamTypeResponse(row: ExamTypeRow): ExamTypeResponseDto {
  return {
    id: row.id,
    name: row.name,
    weightPercent: toNum(row.weight_percent),
    academicYearId: row.academic_year_id,
    gradingScaleId: row.grading_scale_id ?? null,
    orderIndex: row.order_index,
    createdAt: toDateField(row.created_at),
    updatedAt: toDateField(row.updated_at),
  };
}

export interface ExamScheduleResponseDto {
  id: string;
  examTypeId: string;
  classId: string;
  subjectId: string;
  examDate: { ad: string; bs: string } | null;
  startTime: string;
  endTime: string;
  fullMarks: number;
  passMarks: number;
  theoryMarks: number | null;
  practicalMarks: number | null;
  room: string | null;
  invigilatorId: string | null;
  createdAt: { ad: string; bs: string } | null;
}

export function toExamScheduleResponse(row: ExamScheduleRow): ExamScheduleResponseDto {
  return {
    id: row.id,
    examTypeId: row.exam_type_id,
    classId: row.class_id,
    subjectId: row.subject_id,
    examDate: toDateField(row.exam_date),
    startTime: toTimeField(row.start_time),
    endTime: toTimeField(row.end_time),
    fullMarks: toNum(row.full_marks),
    passMarks: toNum(row.pass_marks),
    theoryMarks: row.theory_marks ? toNum(row.theory_marks) : null,
    practicalMarks: row.practical_marks ? toNum(row.practical_marks) : null,
    room: row.room ?? null,
    invigilatorId: row.invigilator_id ?? null,
    createdAt: toDateField(row.created_at),
  };
}

export interface MyExamScheduleRow extends ExamScheduleRow {
  exam_type_name: string;
  subject_name: string;
  class_name: string;
}

export interface MyExamScheduleDto extends ExamScheduleResponseDto {
  examTypeName: string;
  subjectName: string;
  className: string;
}

export function toMyExamScheduleResponse(row: MyExamScheduleRow): MyExamScheduleDto {
  return {
    ...toExamScheduleResponse(row),
    examTypeName: row.exam_type_name,
    subjectName: row.subject_name,
    className: row.class_name,
  };
}

export interface MarksResponseDto {
  id: string;
  examScheduleId: string;
  studentId: string;
  marksObtained: number | null;
  theoryMarks: number | null;
  practicalMarks: number | null;
  isAbsent: boolean;
  isExpelled: boolean;
  remarks: string | null;
  enteredBy: string;
  enteredAt: { ad: string; bs: string } | null;
}

export function toMarksResponse(row: MarksRow): MarksResponseDto {
  return {
    id: row.id,
    examScheduleId: row.exam_schedule_id,
    studentId: row.student_id,
    marksObtained: row.marks_obtained ? toNum(row.marks_obtained) : null,
    theoryMarks: row.theory_marks ? toNum(row.theory_marks) : null,
    practicalMarks: row.practical_marks ? toNum(row.practical_marks) : null,
    isAbsent: row.is_absent,
    isExpelled: row.is_expelled,
    remarks: row.remarks ?? null,
    enteredBy: row.entered_by,
    enteredAt: toDateField(row.entered_at),
  };
}

export interface StudentResultResponseDto {
  id: string;
  studentId: string;
  examTypeId: string;
  academicYearId: string;
  totalMarks: number;
  obtainedMarks: number;
  percentage: number;
  gpa: number | null;
  grade: string | null;
  division: string | null;
  rankInSection: number | null;
  rankInClass: number | null;
  isPassed: boolean;
  status: string;
  computedAt: { ad: string; bs: string } | null;
}

export function toStudentResultResponse(row: StudentResultRow): StudentResultResponseDto {
  return {
    id: row.id,
    studentId: row.student_id,
    examTypeId: row.exam_type_id,
    academicYearId: row.academic_year_id,
    totalMarks: toNum(row.total_marks),
    obtainedMarks: toNum(row.obtained_marks),
    percentage: toNum(row.percentage),
    gpa: row.gpa ? toNum(row.gpa) : null,
    grade: row.grade ?? null,
    division: row.division ?? null,
    rankInSection: row.rank_in_section ?? null,
    rankInClass: row.rank_in_class ?? null,
    isPassed: row.is_pass,
    status: row.status,
    computedAt: toDateField(row.computed_at),
  };
}
