import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { StorageService } from '../storage/storage.service';
import type { AuthUser } from '../auth/auth.types';
import {
  AssignmentRow,
  toAssignmentResponse,
  AssignmentResponseDto,
} from './entities/assignment.entity';
import {
  AssignmentQueryDto,
  CreateAssignmentDto,
  UpdateAssignmentDto,
} from './dto/assignment.dto';

/** Enrichment JOINs shared by list/detail queries. */
const ENRICHED_SELECT = `
  a.*,
  c.name AS class_name,
  sec.name AS section_name,
  sub.name AS subject_name,
  (u.first_name || ' ' || u.last_name) AS teacher_name,
  (SELECT COUNT(*) FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submission_count
`;
const ENRICHED_JOINS = `
  JOIN classes c ON c.id = a.class_id
  LEFT JOIN sections sec ON sec.id = a.section_id
  JOIN subjects sub ON sub.id = a.subject_id
  JOIN users u ON u.id = a.created_by
`;

/**
 * EDU-1 teacher/admin side. Scoping philosophy: teacher writes are
 * SOFT-scoped with accountability — any teacher may post to any class
 * (cover-teacher reality), created_by is stamped and shown. Students and
 * parents never reach this service (SubmissionService hard-scopes them).
 */
@Injectable()
export class AssignmentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storage: StorageService,
    private readonly events: EventEmitter2,
  ) {}

  private async verifyAttachmentKeys(keys: string[] | undefined): Promise<string[]> {
    if (!keys || keys.length === 0) return [];
    const { slug } = this.tenantContext.getOrThrow();
    for (const key of keys) {
      await this.storage.verifyConfirmedKey(key, 'assignment-attachment', slug);
    }
    return keys;
  }

  async create(dto: CreateAssignmentDto, user: AuthUser): Promise<AssignmentResponseDto> {
    // Referential checks with clear 404s (FK violations are opaque 500s).
    const classRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM classes WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.classId,
    );
    if (!classRows[0]) throw new NotFoundException('Class not found');

    if (dto.sectionId) {
      const sectionRows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM sections WHERE id = $1::uuid AND class_id = $2::uuid AND deleted_at IS NULL`,
        dto.sectionId,
        dto.classId,
      );
      if (!sectionRows[0]) throw new NotFoundException('Section not found in that class');
    }

    const subjectRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM subjects WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.subjectId,
    );
    if (!subjectRows[0]) throw new NotFoundException('Subject not found');

    let academicYearId = dto.academicYearId ?? null;
    if (academicYearId) {
      // ERR-MAP-1: the omission this whole ticket was diagnosed from. The three
      // checks above guard class/section/subject with clear 404s; a SUPPLIED
      // academicYearId skipped straight into the INSERT and produced 23503 →
      // opaque 500. Phase 0 §11 Q2 ruled the filter mapping is a BACKSTOP, not
      // a replacement — so the guard is the fix and the mapping only catches
      // the next omission of this shape.
      const yearRows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
        academicYearId,
      );
      if (!yearRows[0]) throw new NotFoundException('Academic year not found');
    }
    if (!academicYearId) {
      const current = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM academic_years WHERE is_current = true AND deleted_at IS NULL`,
      );
      if (!current[0]) {
        throw new BadRequestException('No current academic year is set — pass academicYearId.');
      }
      academicYearId = current[0].id;
    }

    const attachmentKeys = await this.verifyAttachmentKeys(dto.attachmentKeys);

    const rows = await this.tenantPrisma.query<AssignmentRow>(
      `INSERT INTO assignments (
         academic_year_id, class_id, section_id, subject_id, created_by,
         title, description, due_date, attachment_keys
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::date, $9::jsonb)
       RETURNING *`,
      academicYearId,
      dto.classId,
      dto.sectionId ?? null,
      dto.subjectId,
      user.userId,
      dto.title,
      dto.description ?? null,
      dto.dueDate,
      JSON.stringify(attachmentKeys),
    );
    return this.findOne(rows[0].id);
  }

  async findAll(query: AssignmentQueryDto): Promise<{
    data: AssignmentResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;
    const sortCol = query.sortBy ?? 'created_at';
    const sortDir = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const rows = await this.tenantPrisma.query<AssignmentRow & { total_count: string }>(
      `SELECT ${ENRICHED_SELECT}, COUNT(*) OVER() AS total_count
       FROM assignments a ${ENRICHED_JOINS}
       WHERE a.deleted_at IS NULL
         AND ($1::text IS NULL OR a.title ILIKE '%' || $1 || '%')
         AND ($2::uuid IS NULL OR a.class_id = $2::uuid)
         AND ($3::uuid IS NULL OR a.section_id = $3::uuid)
         AND ($4::uuid IS NULL OR a.subject_id = $4::uuid)
         AND ($5::text IS NULL OR a.status = $5)
       ORDER BY a.${sortCol} ${sortDir}
       LIMIT $6 OFFSET $7`,
      query.search?.trim() || null,
      query.classId ?? null,
      query.sectionId ?? null,
      query.subjectId ?? null,
      query.status ?? null,
      limit,
      offset,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map(toAssignmentResponse),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string): Promise<AssignmentResponseDto> {
    const rows = await this.tenantPrisma.query<AssignmentRow>(
      `SELECT ${ENRICHED_SELECT} FROM assignments a ${ENRICHED_JOINS}
       WHERE a.id = $1::uuid AND a.deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Assignment ${id} not found`);
    return toAssignmentResponse(rows[0]);
  }

  async update(
    id: string,
    dto: UpdateAssignmentDto,
    user: AuthUser,
  ): Promise<AssignmentResponseDto> {
    const existing = await this.tenantPrisma.query<AssignmentRow>(
      `SELECT * FROM assignments WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Assignment ${id} not found`);
    if (existing[0].status === 'CLOSED') {
      throw new ConflictException('Closed assignments cannot be edited.');
    }

    const attachmentKeys =
      dto.attachmentKeys !== undefined
        ? await this.verifyAttachmentKeys(dto.attachmentKeys)
        : undefined;

    // Edits never re-fire assignment.published (publish-edge-only rule).
    // Soft-scoped write → record the actor (decision 3): updated_by = editor.
    await this.tenantPrisma.execute(
      `UPDATE assignments SET
         title = COALESCE($2, title),
         description = CASE WHEN $3::boolean THEN $4 ELSE description END,
         due_date = COALESCE($5::date, due_date),
         attachment_keys = COALESCE($6::jsonb, attachment_keys),
         updated_by = $7::uuid,
         updated_at = NOW()
       WHERE id = $1::uuid`,
      id,
      dto.title ?? null,
      dto.description !== undefined,
      dto.description ?? null,
      dto.dueDate ?? null,
      attachmentKeys !== undefined ? JSON.stringify(attachmentKeys) : null,
      user.userId,
    );
    return this.findOne(id);
  }

  async softDelete(id: string): Promise<void> {
    const affected = await this.tenantPrisma.execute(
      `UPDATE assignments SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (affected === 0) throw new NotFoundException(`Assignment ${id} not found`);
  }

  /**
   * DRAFT→PUBLISHED. The event fires on this edge ONLY (PUSH-1 rule): the
   * conditional UPDATE returns a row exactly once; re-publish attempts 409.
   */
  async publish(id: string, user: AuthUser): Promise<AssignmentResponseDto> {
    const rows = await this.tenantPrisma.query<AssignmentRow>(
      `UPDATE assignments SET status = 'PUBLISHED', published_at = NOW(),
         updated_by = $2::uuid, updated_at = NOW()
       WHERE id = $1::uuid AND deleted_at IS NULL AND status = 'DRAFT'
       RETURNING *`,
      id,
      user.userId,
    );
    if (!rows[0]) {
      await this.findOne(id); // 404 if missing…
      throw new ConflictException('Only DRAFT assignments can be published.'); // …else wrong state
    }

    const enriched = await this.findOne(id);
    const { slug } = this.tenantContext.getOrThrow();
    this.events.emit('assignment.published', {
      tenantSlug: slug,
      assignmentId: rows[0].id,
      title: rows[0].title,
      dueDate: enriched.dueDate,
      classId: rows[0].class_id,
      sectionId: rows[0].section_id,
      subjectName: enriched.subjectName ?? '',
    });
    return enriched;
  }

  /** PUBLISHED→CLOSED (stops accepting submissions). No event. */
  async close(id: string, user: AuthUser): Promise<AssignmentResponseDto> {
    const rows = await this.tenantPrisma.query<AssignmentRow>(
      `UPDATE assignments SET status = 'CLOSED', updated_by = $2::uuid, updated_at = NOW()
       WHERE id = $1::uuid AND deleted_at IS NULL AND status = 'PUBLISHED'
       RETURNING id`,
      id,
      user.userId,
    );
    if (!rows[0]) {
      await this.findOne(id);
      throw new ConflictException('Only PUBLISHED assignments can be closed.');
    }
    return this.findOne(id);
  }
}
