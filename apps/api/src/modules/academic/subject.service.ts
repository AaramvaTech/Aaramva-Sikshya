import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  SubjectRow,
  ClassSubjectRow,
  SubjectResponseDto,
  ClassSubjectResponseDto,
  toSubjectResponse,
  toClassSubjectResponse,
} from './entities/academic.entity';
import { CreateSubjectDto, ListSubjectsQueryDto, UpdateSubjectDto } from './dto/subject.dto';
import { AssignSubjectToClassDto } from './dto/class-subject.dto';

@Injectable()
export class SubjectService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async createSubject(dto: CreateSubjectDto): Promise<SubjectResponseDto> {
    const rows = await this.tenantPrisma.query<SubjectRow>(
      `INSERT INTO subjects (name, code, type) VALUES ($1, $2, $3) RETURNING *`,
      dto.name, dto.code ?? null, dto.type ?? 'THEORY',
    );
    return toSubjectResponse(rows[0]);
  }

  async findAllSubjects(query: ListSubjectsQueryDto): Promise<{
    data: SubjectResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const rows = await this.tenantPrisma.query<SubjectRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM subjects
       WHERE deleted_at IS NULL
       ORDER BY name ASC
       LIMIT $1 OFFSET $2`,
      limit, offset,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map(toSubjectResponse),
      meta: { page, limit, total },
    };
  }

  async updateSubject(id: string, dto: UpdateSubjectDto): Promise<SubjectResponseDto> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.code !== undefined) { setClauses.push(`code = $${idx++}`); params.push(dto.code); }
    if (dto.type !== undefined) { setClauses.push(`type = $${idx++}`); params.push(dto.type); }

    if (setClauses.length === 0) return this.findOneOrThrow(id);

    setClauses.push('updated_at = NOW()');
    params.push(id);

    const rows = await this.tenantPrisma.query<SubjectRow>(
      `UPDATE subjects SET ${setClauses.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Subject ${id} not found`);
    return toSubjectResponse(rows[0]);
  }

  async deleteSubject(id: string): Promise<void> {
    const affected = await this.tenantPrisma.execute(
      `UPDATE subjects SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (affected === 0) throw new NotFoundException(`Subject ${id} not found`);
  }

  async assignSubjectToClass(
    classId: string,
    dto: AssignSubjectToClassDto,
  ): Promise<ClassSubjectResponseDto> {
    const existing = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM class_subjects
       WHERE class_id = $1::uuid AND subject_id = $2::uuid AND academic_year_id = $3::uuid`,
      classId, dto.subjectId, dto.academicYearId,
    );
    if (existing[0]) {
      throw new ConflictException(
        'Subject already assigned to this class for the given academic year',
      );
    }

    const rows = await this.tenantPrisma.query<ClassSubjectRow>(
      `INSERT INTO class_subjects (class_id, subject_id, academic_year_id, full_marks, pass_marks)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
       RETURNING *`,
      classId, dto.subjectId, dto.academicYearId,
      dto.fullMarks ?? 100, dto.passMarks ?? 40,
    );
    return this.enrichClassSubjectRow(rows[0]);
  }

  async getClassSubjects(classId: string): Promise<ClassSubjectResponseDto[]> {
    const rows = await this.tenantPrisma.query<ClassSubjectRow>(
      `SELECT cs.*, s.name AS subject_name, s.code AS subject_code, s.type AS subject_type
       FROM class_subjects cs
       JOIN subjects s ON cs.subject_id = s.id AND s.deleted_at IS NULL
       WHERE cs.class_id = $1::uuid
       ORDER BY s.name ASC`,
      classId,
    );
    return rows.map(toClassSubjectResponse);
  }

  async removeClassSubject(classId: string, subjectId: string): Promise<void> {
    const affected = await this.tenantPrisma.execute(
      `DELETE FROM class_subjects WHERE class_id = $1::uuid AND subject_id = $2::uuid`,
      classId, subjectId,
    );
    if (affected === 0) {
      throw new NotFoundException(`Subject assignment not found for class ${classId}`);
    }
  }

  private async findOneOrThrow(id: string): Promise<SubjectResponseDto> {
    const rows = await this.tenantPrisma.query<SubjectRow>(
      `SELECT * FROM subjects WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Subject ${id} not found`);
    return toSubjectResponse(rows[0]);
  }

  private async enrichClassSubjectRow(row: ClassSubjectRow): Promise<ClassSubjectResponseDto> {
    const subjectRows = await this.tenantPrisma.query<SubjectRow>(
      `SELECT * FROM subjects WHERE id = $1::uuid`,
      row.subject_id,
    );
    return toClassSubjectResponse({
      ...row,
      subject_name: subjectRows[0]?.name ?? '',
      subject_code: subjectRows[0]?.code ?? null,
      subject_type: subjectRows[0]?.type ?? 'THEORY',
    });
  }
}
