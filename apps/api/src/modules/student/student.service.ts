import { Injectable, NotFoundException } from '@nestjs/common';
import { getBsYear } from 'bs-calendar';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { StudentRow, StudentResponseDto, toStudentResponse } from './entities/student.entity';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';

const SORT_WHITELIST: Record<string, string> = {
  created_at: 'created_at',
  first_name: 'first_name',
  last_name: 'last_name',
  student_id: 'student_id',
  admission_date: 'admission_date',
};

type UpdateFieldSpec = [keyof UpdateStudentDto, string, 'text' | 'date' | 'jsonb' | 'int'];

const UPDATE_FIELD_MAP: UpdateFieldSpec[] = [
  ['firstName',        'first_name',        'text'],
  ['lastName',         'last_name',         'text'],
  ['dateOfBirth',      'date_of_birth',     'date'],
  ['gender',           'gender',            'text'],
  ['bloodGroup',       'blood_group',       'text'],
  ['religion',         'religion',          'text'],
  ['ethnicity',        'ethnicity',         'text'],
  ['nationality',      'nationality',       'text'],
  ['motherTongue',     'mother_tongue',     'text'],
  ['phone',            'phone',             'text'],
  ['email',            'email',             'text'],
  ['permanentAddress', 'permanent_address', 'jsonb'],
  ['temporaryAddress', 'temporary_address', 'jsonb'],
  ['guardians',        'guardians',         'jsonb'],
  ['className',        'class_name',        'text'],
  ['sectionName',      'section_name',      'text'],
  ['rollNumber',       'roll_number',       'int'],
  ['admissionDate',    'admission_date',    'date'],
  ['academicYear',     'academic_year',     'text'],
  ['previousSchool',   'previous_school',   'text'],
  ['photoUrl',         'photo_url',         'text'],
];

@Injectable()
export class StudentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async admitStudent(dto: CreateStudentDto, createdById: string): Promise<StudentResponseDto> {
    const { tenantId } = this.tenantContext.getOrThrow();

    const row = await this.tenantPrisma.run(async (tx) => {
      const admissionDate = new Date(dto.admissionDate);
      const studentId = await this.generateStudentId(tx, admissionDate);

      const rows = await tx.$queryRawUnsafe<StudentRow[]>(
        `INSERT INTO students (
           tenant_id, student_id, first_name, last_name, date_of_birth, gender,
           blood_group, religion, ethnicity, nationality, mother_tongue,
           phone, email, permanent_address, temporary_address, guardians,
           class_name, section_name, roll_number, admission_date, academic_year,
           previous_school, created_by
         ) VALUES (
           $1::uuid, $2, $3, $4, $5::date, $6,
           $7, $8, $9, $10, $11,
           $12, $13, $14::jsonb, $15::jsonb, $16::jsonb,
           $17, $18, $19, $20::date, $21,
           $22, $23::uuid
         ) RETURNING *`,
        tenantId, studentId,
        dto.firstName, dto.lastName, dto.dateOfBirth, dto.gender,
        dto.bloodGroup ?? null, dto.religion ?? null, dto.ethnicity ?? null,
        dto.nationality ?? 'Nepali', dto.motherTongue ?? null,
        dto.phone ?? null, dto.email ?? null,
        dto.permanentAddress ? JSON.stringify(dto.permanentAddress) : null,
        dto.temporaryAddress ? JSON.stringify(dto.temporaryAddress) : null,
        dto.guardians ? JSON.stringify(dto.guardians) : null,
        dto.className ?? null, dto.sectionName ?? null, dto.rollNumber ?? null,
        dto.admissionDate, dto.academicYear ?? null,
        dto.previousSchool ?? null, createdById,
      );

      return rows[0];
    });

    return toStudentResponse(row);
  }

  async findAll(query: ListStudentsQueryDto): Promise<{
    data: StudentResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const search      = query.search    ?? '';
    const className   = query.className ?? null;
    const sectionName = query.section   ?? null;
    const status      = query.status    ?? null;

    const sortCol = SORT_WHITELIST[query.sortBy ?? 'created_at'] ?? 'created_at';
    const sortDir = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const rows = await this.tenantPrisma.query<StudentRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM students
       WHERE deleted_at IS NULL
         AND ($1::text IS NULL OR (
               first_name ILIKE '%' || $1 || '%' OR
               last_name  ILIKE '%' || $1 || '%' OR
               student_id ILIKE '%' || $1 || '%'
             ))
         AND ($2::text IS NULL OR class_name   = $2)
         AND ($3::text IS NULL OR section_name = $3)
         AND ($4::text IS NULL OR status       = $4)
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $5 OFFSET $6`,
      search, className, sectionName, status, limit, offset,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;

    return {
      data: rows.map(toStudentResponse),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string): Promise<StudentResponseDto> {
    const rows = await this.tenantPrisma.query<StudentRow>(
      `SELECT * FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${id} not found`);
    return toStudentResponse(rows[0]);
  }

  async updateStudent(id: string, dto: UpdateStudentDto): Promise<StudentResponseDto> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [dtoKey, col, type] of UPDATE_FIELD_MAP) {
      const val = dto[dtoKey];
      if (val !== undefined) {
        const cast = type === 'text' ? '' : `::${type}`;
        setClauses.push(`${col} = $${idx++}${cast}`);
        params.push(type === 'jsonb' ? JSON.stringify(val) : val);
      }
    }

    if (setClauses.length === 0) return this.findOne(id);

    setClauses.push('updated_at = NOW()');
    params.push(id);

    const rows = await this.tenantPrisma.query<StudentRow>(
      `UPDATE students SET ${setClauses.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${id} not found`);
    return toStudentResponse(rows[0]);
  }

  async updateStatus(id: string, dto: UpdateStudentStatusDto): Promise<StudentResponseDto> {
    await this.tenantPrisma.execute(
      `UPDATE students SET status = $1, updated_at = NOW()
       WHERE id = $2::uuid AND deleted_at IS NULL`,
      dto.status, id,
    );
    return this.findOne(id);
  }

  async removeStudent(id: string): Promise<void> {
    const affected = await this.tenantPrisma.execute(
      `UPDATE students SET deleted_at = NOW()
       WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (affected === 0) throw new NotFoundException(`Student ${id} not found`);
  }

  private async generateStudentId(tx: TenantTx, admissionDate: Date): Promise<string> {
    const bsYear = getBsYear(admissionDate);
    const rows = await tx.$queryRawUnsafe<{ max_id: string | null }[]>(
      `SELECT MAX(student_id) AS max_id FROM students WHERE student_id LIKE $1`,
      `${bsYear}-%`,
    );
    const maxId = rows[0]?.max_id ?? null;
    const seq = maxId ? parseInt(maxId.split('-')[1], 10) + 1 : 1;
    return `${bsYear}-${seq.toString().padStart(4, '0')}`;
  }
}
