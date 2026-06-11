import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getBsYear } from 'bs-calendar';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { StudentRow, StudentResponseDto, toStudentResponse } from './entities/student.entity';
import { CreateStudentDto } from './dto/create-student.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';
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
  // className / sectionName / academicYear text fields are skipped when UUID IDs are provided
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

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const row = await this.tenantPrisma.run(async (tx) => {
          const admissionDate = new Date(dto.admissionDate);
          if (isNaN(admissionDate.getTime())) {
            throw new BadRequestException('Invalid admission date');
          }
          const minAdDate = new Date('1943-04-14');
          const maxAdDate = new Date('2043-04-13');
          if (admissionDate < minAdDate || admissionDate > maxAdDate) {
            throw new BadRequestException('Admission date must be within BS calendar range (2000–2100 BS)');
          }

          const studentId = await this.generateStudentId(tx, admissionDate);

          // Resolve class/section UUIDs → names when IDs are provided
          let classIdToInsert: string | null = null;
          let sectionIdToInsert: string | null = null;
          let classNameToInsert: string | null = dto.className ?? null;
          let sectionNameToInsert: string | null = dto.sectionName ?? null;
          let academicYearToInsert: string | null = dto.academicYear ?? null;

          if (dto.classId && dto.sectionId) {
            const classRows = await tx.$queryRawUnsafe<{ name: string }[]>(
              `SELECT name FROM classes WHERE id = $1::uuid AND deleted_at IS NULL`,
              dto.classId,
            );
            if (!classRows[0]) throw new NotFoundException('Class not found');

            const sectionRows = await tx.$queryRawUnsafe<{ name: string }[]>(
              `SELECT name FROM sections WHERE id = $1::uuid AND class_id = $2::uuid AND deleted_at IS NULL`,
              dto.sectionId, dto.classId,
            );
            if (!sectionRows[0]) throw new NotFoundException('Section not found');

            classIdToInsert = dto.classId;
            sectionIdToInsert = dto.sectionId;
            classNameToInsert = classRows[0].name;
            sectionNameToInsert = sectionRows[0].name;
          }

          if (dto.academicYearId) {
            const yearRows = await tx.$queryRawUnsafe<{ name: string }[]>(
              `SELECT name FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
              dto.academicYearId,
            );
            if (yearRows[0]) academicYearToInsert = yearRows[0].name;
          }

          const rows = await tx.$queryRawUnsafe<StudentRow[]>(
            `INSERT INTO students (
               tenant_id, student_id, first_name, last_name, date_of_birth, gender,
               blood_group, religion, ethnicity, nationality, mother_tongue,
               phone, email, permanent_address, temporary_address, guardians,
               class_id, section_id, class_name, section_name, roll_number,
               admission_date, academic_year, previous_school, created_by
             ) VALUES (
               $1::uuid, $2, $3, $4, $5::date, $6,
               $7, $8, $9, $10, $11,
               $12, $13, $14::jsonb, $15::jsonb, $16::jsonb,
               $17::uuid, $18::uuid, $19, $20, $21,
               $22::date, $23, $24, $25::uuid
             ) RETURNING *`,
            tenantId, studentId,
            dto.firstName, dto.lastName, dto.dateOfBirth, dto.gender,
            dto.bloodGroup ?? null, dto.religion ?? null, dto.ethnicity ?? null,
            dto.nationality ?? 'Nepali', dto.motherTongue ?? null,
            dto.phone ?? null, dto.email ?? null,
            dto.permanentAddress ? JSON.stringify(dto.permanentAddress) : null,
            dto.temporaryAddress ? JSON.stringify(dto.temporaryAddress) : null,
            dto.guardians?.length
              ? JSON.stringify(dto.guardians.map((g) => ({ id: randomUUID(), ...g })))
              : null,
            classIdToInsert, sectionIdToInsert,
            classNameToInsert, sectionNameToInsert, dto.rollNumber ?? null,
            dto.admissionDate, academicYearToInsert,
            dto.previousSchool ?? null, createdById,
          );

          return rows[0];
        });
        return toStudentResponse(row);
      } catch (err: any) {
        if (attempt < 2 && err?.code === 'P2002') continue;
        throw err;
      }
    }
    throw new Error('Failed to generate unique student ID after 3 attempts');
  }

  async findAll(query: ListStudentsQueryDto): Promise<{
    data: StudentResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const search      = query.search?.trim() || null;
    const className   = query.className ?? null;
    const sectionName = query.section   ?? null;
    const status      = query.status    ?? null;
    const classId     = query.classId   ?? null;
    const sectionId   = query.sectionId ?? null;

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
         AND ($5::uuid IS NULL OR class_id   = $5::uuid)
         AND (
           $6::uuid IS NULL OR
           section_id = $6::uuid OR
           (section_id IS NULL AND section_name = (SELECT name FROM sections WHERE id = $6::uuid))
         )
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $7 OFFSET $8`,
      search, className, sectionName, status, classId, sectionId, limit, offset,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;

    return {
      data: rows.map(toStudentResponse),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string): Promise<StudentResponseDto> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.tenantPrisma.query<StudentRow>(
      `SELECT * FROM students WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL`,
      id, tenantId,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${id} not found`);
    return toStudentResponse(rows[0]);
  }

  async updateStudent(id: string, dto: UpdateStudentDto): Promise<StudentResponseDto> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // When UUID IDs are provided, skip text fields so they get derived from the IDs
    const skipTextEnrollment = !!(dto.classId && dto.sectionId);
    const skipTextAcademicYear = !!dto.academicYearId;

    for (const [dtoKey, col, type] of UPDATE_FIELD_MAP) {
      if (skipTextEnrollment && (dtoKey === 'className' || dtoKey === 'sectionName')) continue;
      if (skipTextAcademicYear && dtoKey === 'academicYear') continue;
      const val = dto[dtoKey];
      if (val !== undefined) {
        const cast = type === 'text' ? '' : `::${type}`;
        setClauses.push(`${col} = $${idx++}${cast}`);
        params.push(type === 'jsonb' ? JSON.stringify(val) : val);
      }
    }

    // Resolve class/section UUIDs → names and set all four enrollment columns
    if (dto.classId && dto.sectionId) {
      const classRows = await this.tenantPrisma.query<{ name: string }>(
        `SELECT name FROM classes WHERE id = $1::uuid AND deleted_at IS NULL`,
        dto.classId,
      );
      if (!classRows[0]) throw new NotFoundException('Class not found');

      const sectionRows = await this.tenantPrisma.query<{ name: string }>(
        `SELECT name FROM sections WHERE id = $1::uuid AND class_id = $2::uuid AND deleted_at IS NULL`,
        dto.sectionId, dto.classId,
      );
      if (!sectionRows[0]) throw new NotFoundException('Section not found');

      setClauses.push(`class_id = $${idx++}::uuid`);   params.push(dto.classId);
      setClauses.push(`section_id = $${idx++}::uuid`); params.push(dto.sectionId);
      setClauses.push(`class_name = $${idx++}`);       params.push(classRows[0].name);
      setClauses.push(`section_name = $${idx++}`);     params.push(sectionRows[0].name);
    }

    if (dto.academicYearId) {
      const yearRows = await this.tenantPrisma.query<{ name: string }>(
        `SELECT name FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
        dto.academicYearId,
      );
      if (yearRows[0]) {
        setClauses.push(`academic_year = $${idx++}`);
        params.push(yearRows[0].name);
      }
    }

    if (setClauses.length === 0) return this.findOne(id);

    setClauses.push('updated_at = NOW()');
    params.push(id);
    params.push(tenantId);

    const rows = await this.tenantPrisma.query<StudentRow>(
      `UPDATE students SET ${setClauses.join(', ')}
       WHERE id = $${idx}::uuid AND tenant_id = $${idx + 1}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${id} not found`);
    return toStudentResponse(rows[0]);
  }

  async updateStatus(id: string, dto: UpdateStudentStatusDto): Promise<StudentResponseDto> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const affected = await this.tenantPrisma.execute(
      `UPDATE students SET status = $1, updated_at = NOW()
       WHERE id = $2::uuid AND tenant_id = $3::uuid AND deleted_at IS NULL`,
      dto.status, id, tenantId,
    );
    if (affected === 0) throw new NotFoundException(`Student ${id} not found`);
    return this.findOne(id);
  }

  async enroll(id: string, dto: EnrollStudentDto): Promise<StudentResponseDto> {
    const { tenantId } = this.tenantContext.getOrThrow();

    const studentRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL`,
      id, tenantId,
    );
    if (!studentRows[0]) throw new NotFoundException(`Student ${id} not found`);

    const classRows = await this.tenantPrisma.query<{ name: string }>(
      `SELECT name FROM classes WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.classId,
    );
    if (!classRows[0]) throw new NotFoundException(`Class not found`);

    const sectionRows = await this.tenantPrisma.query<{ name: string }>(
      `SELECT name FROM sections WHERE id = $1::uuid AND class_id = $2::uuid AND deleted_at IS NULL`,
      dto.sectionId, dto.classId,
    );
    if (!sectionRows[0]) throw new NotFoundException(`Section not found`);

    const yearRows = await this.tenantPrisma.query<{ name: string }>(
      `SELECT name FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.academicYearId,
    );
    if (!yearRows[0]) throw new NotFoundException(`Academic year not found`);

    await this.tenantPrisma.execute(
      `UPDATE students SET
         class_id = $1::uuid, section_id = $2::uuid,
         class_name = $3, section_name = $4, roll_number = $5,
         academic_year = $6, updated_at = NOW()
       WHERE id = $7::uuid AND tenant_id = $8::uuid AND deleted_at IS NULL`,
      dto.classId, dto.sectionId,
      classRows[0].name, sectionRows[0].name, dto.rollNumber ?? null,
      yearRows[0].name, id, tenantId,
    );

    return this.findOne(id);
  }

  async removeStudent(id: string): Promise<void> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const affected = await this.tenantPrisma.execute(
      `UPDATE students SET deleted_at = NOW()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL`,
      id, tenantId,
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
