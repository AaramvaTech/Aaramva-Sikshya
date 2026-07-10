import { adToBs } from 'bs-calendar';

export interface StudentRow {
  id: string;
  tenant_id: string;
  student_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: Date | string;
  gender: string;
  blood_group: string | null;
  religion: string | null;
  ethnicity: string | null;
  nationality: string;
  mother_tongue: string | null;
  phone: string | null;
  email: string | null;
  permanent_address: Record<string, string> | null;
  temporary_address: Record<string, string> | null;
  // Guardians are NOT a column on students anymore (MIG-2 dropped the JSONB
  // `guardians` column in migration 0002). They live in the normalized
  // `guardians` table and are attached to the response via toStudentResponse's
  // `guardians` argument — see StudentService.fetchGuardians / GuardianService.
  class_name: string | null;
  section_name: string | null;
  roll_number: number | null;
  admission_date: Date | string;
  academic_year: string | null;
  previous_school: string | null;
  photo_url: string | null;
  documents: unknown[];
  status: string;
  created_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface BsAdDate {
  ad: string;
  bs: string;
}

export interface GuardianDto {
  id: string;
  relation: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  isPrimary: boolean;
}

/** Minimal shape of a row from the normalized `guardians` table. */
export interface GuardianRowLite {
  id: string;
  relation: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
}

/** Map a normalized guardians-table row to the API GuardianDto. */
export function toGuardianDto(g: GuardianRowLite): GuardianDto {
  return {
    id: g.id,
    relation: g.relation,
    firstName: g.first_name,
    lastName: g.last_name ?? '',
    phone: g.phone ?? '',
    email: g.email ?? null,
    isPrimary: g.is_primary,
  };
}

export interface StudentResponseDto {
  id: string;
  studentId: string;
  tenantId: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  dateOfBirth: BsAdDate;
  gender: string;
  bloodGroup: string | null;
  religion: string | null;
  ethnicity: string | null;
  nationality: string;
  motherTongue: string | null;
  phone: string | null;
  email: string | null;
  permanentAddress: Record<string, string> | null;
  temporaryAddress: Record<string, string> | null;
  guardians: GuardianDto[];
  className: string | null;
  sectionName: string | null;
  rollNumber: number | null;
  admissionDate: BsAdDate;
  academicYear: string | null;
  previousSchool: string | null;
  photoUrl: string | null;
  documents: unknown[];
  status: string;
  createdAt: string;
}

function toAdString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split('T')[0];
}

function toBsString(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  const bs = adToBs(date);
  return `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`;
}

export function toStudentResponse(
  row: StudentRow,
  guardians: GuardianDto[] = [],
): StudentResponseDto {
  return {
    id: row.id,
    studentId: row.student_id,
    tenantId: row.tenant_id,
    userId: row.user_id ?? null,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`,
    dateOfBirth: { ad: toAdString(row.date_of_birth), bs: toBsString(row.date_of_birth) },
    gender: row.gender,
    bloodGroup: row.blood_group,
    religion: row.religion,
    ethnicity: row.ethnicity,
    nationality: row.nationality,
    motherTongue: row.mother_tongue,
    phone: row.phone,
    email: row.email,
    permanentAddress: row.permanent_address,
    temporaryAddress: row.temporary_address,
    // Guardians come from the normalized `guardians` table (MIG-2), passed in by
    // the caller (StudentService.fetchGuardians / GuardianService.insertGuardiansTx).
    guardians,
    className: row.class_name,
    sectionName: row.section_name,
    rollNumber: row.roll_number,
    admissionDate: { ad: toAdString(row.admission_date), bs: toBsString(row.admission_date) },
    academicYear: row.academic_year,
    previousSchool: row.previous_school,
    photoUrl: row.photo_url,
    documents: row.documents ?? [],
    status: row.status,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}
