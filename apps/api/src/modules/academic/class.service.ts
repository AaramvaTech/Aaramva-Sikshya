import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import {
  ClassRow,
  SectionRow,
  ClassListItemDto,
  SectionBriefDto,
  SectionResponseDto,
  toSectionResponse,
} from './entities/academic.entity';
import { CreateClassDto, ListClassesQueryDto, UpdateClassDto } from './dto/class.dto';
import { CreateSectionDto, UpdateSectionDto } from './dto/section.dto';

function toClassListItem(row: ClassRow): ClassListItemDto {
  let sections: SectionBriefDto[] = [];
  if (row.sections) {
    sections = typeof row.sections === 'string'
      ? JSON.parse(row.sections)
      : (row.sections as SectionBriefDto[]);
  }
  return {
    id: row.id,
    name: row.name,
    alias: row.alias,
    orderIndex: Number(row.order_index),
    sectionCount: Number(row.section_count ?? 0),
    studentCount: Number(row.student_count ?? 0),
    sections,
  };
}

@Injectable()
export class ClassService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async createClass(dto: CreateClassDto): Promise<ClassListItemDto> {
    const rows = await this.tenantPrisma.query<ClassRow>(
      `INSERT INTO classes (name, alias, order_index) VALUES ($1, $2, $3) RETURNING *`,
      dto.name, dto.alias ?? null, dto.orderIndex,
    );
    return toClassListItem(rows[0]);
  }

  async findAllClasses(query: ListClassesQueryDto): Promise<{
    data: ClassListItemDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const rows = await this.tenantPrisma.query<ClassRow & { total_count: string }>(
      `SELECT
         c.*,
         COUNT(DISTINCT s.id) AS section_count,
         COUNT(DISTINCT st.id) AS student_count,
         COUNT(*) OVER() AS total_count,
         COALESCE(
           json_agg(
             json_build_object(
               'id', s.id,
               'name', s.name,
               'capacity', s.capacity,
               'classTeacherName',
               CASE WHEN u.id IS NOT NULL
                    THEN u.first_name || ' ' || u.last_name
               END
             ) ORDER BY s.name
           ) FILTER (WHERE s.id IS NOT NULL),
           '[]'::json
         ) AS sections
       FROM classes c
       LEFT JOIN sections s   ON s.class_id = c.id AND s.deleted_at IS NULL
       LEFT JOIN users u      ON s.class_teacher_id = u.id
       LEFT JOIN students st  ON st.class_id = c.id AND st.deleted_at IS NULL
       WHERE c.deleted_at IS NULL
       GROUP BY c.id
       ORDER BY c.order_index ASC
       LIMIT $1 OFFSET $2`,
      limit, offset,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map(toClassListItem),
      meta: { page, limit, total },
    };
  }

  async findOneClass(id: string): Promise<ClassListItemDto> {
    const rows = await this.tenantPrisma.query<ClassRow>(
      `SELECT
         c.*,
         COUNT(DISTINCT s.id) AS section_count,
         COUNT(DISTINCT st.id) AS student_count,
         COALESCE(
           json_agg(
             json_build_object(
               'id', s.id,
               'name', s.name,
               'capacity', s.capacity,
               'classTeacherName',
               CASE WHEN u.id IS NOT NULL
                    THEN u.first_name || ' ' || u.last_name
               END
             ) ORDER BY s.name
           ) FILTER (WHERE s.id IS NOT NULL),
           '[]'::json
         ) AS sections
       FROM classes c
       LEFT JOIN sections s   ON s.class_id = c.id AND s.deleted_at IS NULL
       LEFT JOIN users u      ON s.class_teacher_id = u.id
       LEFT JOIN students st  ON st.class_id = c.id AND st.deleted_at IS NULL
       WHERE c.id = $1::uuid AND c.deleted_at IS NULL
       GROUP BY c.id`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Class ${id} not found`);
    return toClassListItem(rows[0]);
  }

  async updateClass(id: string, dto: UpdateClassDto): Promise<ClassListItemDto> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.alias !== undefined) { setClauses.push(`alias = $${idx++}`); params.push(dto.alias); }
    if (dto.orderIndex !== undefined) { setClauses.push(`order_index = $${idx++}`); params.push(dto.orderIndex); }

    if (setClauses.length === 0) return this.findOneClass(id);

    setClauses.push('updated_at = NOW()');
    params.push(id);

    const rows = await this.tenantPrisma.query<ClassRow>(
      `UPDATE classes SET ${setClauses.join(', ')}
       WHERE id = $${idx}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Class ${id} not found`);
    return toClassListItem(rows[0]);
  }

  async deleteClass(id: string): Promise<void> {
    const countRows = await this.tenantPrisma.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM students WHERE class_id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (parseInt(countRows[0]?.count ?? '0', 10) > 0) {
      throw new BadRequestException('Cannot delete class with active enrollments');
    }

    const affected = await this.tenantPrisma.execute(
      `UPDATE classes SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (affected === 0) throw new NotFoundException(`Class ${id} not found`);
  }

  async createSection(classId: string, dto: CreateSectionDto): Promise<SectionResponseDto> {
    const classExists = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM classes WHERE id = $1::uuid AND deleted_at IS NULL`,
      classId,
    );
    if (!classExists[0]) throw new NotFoundException(`Class ${classId} not found`);

    const rows = await this.tenantPrisma.query<SectionRow>(
      `INSERT INTO sections (class_id, name, capacity, class_teacher_id)
       VALUES ($1::uuid, $2, $3, $4::uuid)
       RETURNING *`,
      classId, dto.name, dto.capacity ?? 40, dto.classTeacherId ?? null,
    );
    return toSectionResponse(rows[0]);
  }

  async getSections(classId: string): Promise<SectionResponseDto[]> {
    const rows = await this.tenantPrisma.query<SectionRow & { class_teacher_name: string | null }>(
      `SELECT s.*, u.first_name || ' ' || u.last_name AS class_teacher_name
       FROM sections s
       LEFT JOIN users u ON s.class_teacher_id = u.id
       WHERE s.class_id = $1::uuid AND s.deleted_at IS NULL
       ORDER BY s.name ASC`,
      classId,
    );
    return rows.map(toSectionResponse);
  }

  async updateSection(
    classId: string,
    sectionId: string,
    dto: UpdateSectionDto,
  ): Promise<SectionResponseDto> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (dto.name !== undefined) { setClauses.push(`name = $${idx++}`); params.push(dto.name); }
    if (dto.capacity !== undefined) { setClauses.push(`capacity = $${idx++}`); params.push(dto.capacity); }
    if (dto.classTeacherId !== undefined) {
      setClauses.push(`class_teacher_id = $${idx++}::uuid`);
      params.push(dto.classTeacherId);
    }

    if (setClauses.length === 0) return this.findOneSection(classId, sectionId);

    setClauses.push('updated_at = NOW()');
    params.push(sectionId);
    params.push(classId);

    const rows = await this.tenantPrisma.query<SectionRow>(
      `UPDATE sections SET ${setClauses.join(', ')}
       WHERE id = $${idx}::uuid AND class_id = $${idx + 1}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Section ${sectionId} not found`);
    return toSectionResponse(rows[0]);
  }

  async deleteSection(classId: string, sectionId: string): Promise<void> {
    const countRows = await this.tenantPrisma.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM students WHERE section_id = $1::uuid AND deleted_at IS NULL`,
      sectionId,
    );
    if (parseInt(countRows[0]?.count ?? '0', 10) > 0) {
      throw new BadRequestException('Cannot delete section with active enrollments');
    }

    const affected = await this.tenantPrisma.execute(
      `UPDATE sections SET deleted_at = NOW()
       WHERE id = $1::uuid AND class_id = $2::uuid AND deleted_at IS NULL`,
      sectionId, classId,
    );
    if (affected === 0) throw new NotFoundException(`Section ${sectionId} not found`);
  }

  private async findOneSection(classId: string, sectionId: string): Promise<SectionResponseDto> {
    const rows = await this.tenantPrisma.query<SectionRow>(
      `SELECT * FROM sections WHERE id = $1::uuid AND class_id = $2::uuid AND deleted_at IS NULL`,
      sectionId, classId,
    );
    if (!rows[0]) throw new NotFoundException(`Section ${sectionId} not found`);
    return toSectionResponse(rows[0]);
  }
}
