import { adToBs } from 'bs-calendar';

// ─── Row types (raw DB results) ───────────────────────────────────────────────

export interface AcademicYearRow {
  id: string;
  name: string;
  year_bs: number;
  start_date: Date | string;
  end_date: Date | string;
  is_current: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface ClassRow {
  id: string;
  name: string;
  alias: string | null;
  order_index: number;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  section_count?: string | number;
  student_count?: string | number;
  sections?: SectionBriefDto[] | string;
  total_count?: string;
}

export interface SectionRow {
  id: string;
  class_id: string;
  name: string;
  capacity: number;
  class_teacher_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  class_teacher_name?: string | null;
}

export interface SubjectRow {
  id: string;
  name: string;
  code: string | null;
  type: string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface ClassSubjectRow {
  id: string;
  class_id: string;
  subject_id: string;
  academic_year_id: string;
  full_marks: number;
  pass_marks: number;
  created_at: Date | string;
  subject_name?: string;
  subject_code?: string | null;
  subject_type?: string;
}

export interface TimetableSlotRow {
  id: string;
  section_id: string;
  subject_id: string;
  teacher_id: string;
  academic_year_id: string;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  room: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  subject_name?: string;
  subject_code?: string | null;
  teacher_full_name?: string;
  section_name?: string;
  class_id?: string;
  class_name?: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface BsAdDate { ad: string; bs: string }

export interface AcademicYearResponseDto {
  id: string;
  name: string;
  yearBs: number;
  startDate: BsAdDate;
  endDate: BsAdDate;
  isCurrent: boolean;
  createdAt: string;
}

export interface SectionBriefDto {
  id: string;
  name: string;
  capacity: number;
  classTeacherName: string | null;
}

export interface ClassListItemDto {
  id: string;
  name: string;
  alias: string | null;
  orderIndex: number;
  sectionCount: number;
  studentCount: number;
  sections: SectionBriefDto[];
}

export interface SectionResponseDto {
  id: string;
  classId: string;
  name: string;
  capacity: number;
  classTeacherId: string | null;
  classTeacherName: string | null;
  createdAt: string;
}

export interface SubjectResponseDto {
  id: string;
  name: string;
  code: string | null;
  type: string;
  createdAt: string;
}

export interface ClassSubjectResponseDto {
  id: string;
  classId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  subjectType: string;
  academicYearId: string;
  fullMarks: number;
  passMarks: number;
  createdAt: string;
}

export interface TimetableSlotResponseDto {
  id: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  academicYearId: string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  room: string | null;
}

export interface SlotItemDto {
  slotId: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: { id: string; name: string; code: string | null };
  teacher: { id: string; fullName: string };
  room: string | null;
}

export interface SectionTimetableDto {
  sectionId: string;
  sectionName: string;
  className: string;
  schedule: Record<number, SlotItemDto[]>;
}

export interface TeacherSlotItemDto {
  slotId: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: { id: string; name: string; code: string | null };
  section: string;
  className: string;
  room: string | null;
}

export interface TeacherTimetableDto {
  teacherId: string;
  teacherName: string;
  schedule: Record<number, TeacherSlotItemDto[]>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toAdString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

export function toBsString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const bs = adToBs(date);
  return `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`;
}

/**
 * Postgres `time` columns come back through Prisma's raw driver as a JS Date
 * (which stringifies to "Thu Jan 01 1970 15:30:00 GMT+0530 …") or, in some
 * paths, as a plain "HH:MM:SS" string. Always emit a plain "HH:MM" wall-clock
 * string at the API boundary, reading UTC components for the Date case so no
 * device/server offset is ever applied (mirrors examination.entity.toTimeField
 * and mobile lib/time.ts).
 */
export function toTimeString(t: Date | string | null | undefined): string {
  if (t === null || t === undefined || t === '') return '';
  if (t instanceof Date) {
    return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
  }
  const s = String(t);
  if (s.includes('T')) return s.split('T')[1].substring(0, 5); // ISO datetime
  return s.substring(0, 5); // "HH:MM:SS" or "HH:MM"
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

export function toAcademicYearResponse(row: AcademicYearRow): AcademicYearResponseDto {
  return {
    id: row.id,
    name: row.name,
    yearBs: Number(row.year_bs),
    startDate: { ad: toAdString(row.start_date), bs: toBsString(row.start_date) },
    endDate: { ad: toAdString(row.end_date), bs: toBsString(row.end_date) },
    isCurrent: row.is_current,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}

export function toSectionResponse(row: SectionRow): SectionResponseDto {
  return {
    id: row.id,
    classId: row.class_id,
    name: row.name,
    capacity: Number(row.capacity),
    classTeacherId: row.class_teacher_id,
    classTeacherName: row.class_teacher_name ?? null,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}

export function toSubjectResponse(row: SubjectRow): SubjectResponseDto {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    type: row.type,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}

export function toClassSubjectResponse(row: ClassSubjectRow): ClassSubjectResponseDto {
  return {
    id: row.id,
    classId: row.class_id,
    subjectId: row.subject_id,
    subjectName: row.subject_name ?? '',
    subjectCode: row.subject_code ?? null,
    subjectType: row.subject_type ?? 'THEORY',
    academicYearId: row.academic_year_id,
    fullMarks: Number(row.full_marks),
    passMarks: Number(row.pass_marks),
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}

export function toTimetableSlotResponse(row: TimetableSlotRow): TimetableSlotResponseDto {
  return {
    id: row.id,
    sectionId: row.section_id,
    subjectId: row.subject_id,
    teacherId: row.teacher_id,
    academicYearId: row.academic_year_id,
    dayOfWeek: Number(row.day_of_week),
    periodNumber: Number(row.period_number),
    startTime: toTimeString(row.start_time),
    endTime: toTimeString(row.end_time),
    room: row.room,
  };
}
