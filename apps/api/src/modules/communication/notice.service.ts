import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { errorBody } from '../common/errors/error-codes';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateNoticeDto, ListNoticesQueryDto, UpdateNoticeDto } from './dto/notice.dto';

export interface NoticeRow {
  id: string;
  title: string;
  body: string;
  type: string;
  audience: string;
  class_id: string | null;
  is_published: boolean;
  published_at: Date | null;
  expires_at: Date | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  total_count?: string;
}

function toNoticeResponse(row: NoticeRow) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    audience: row.audience,
    classId: row.class_id,
    isPublished: row.is_published,
    publishedAt: row.published_at ?? null,
    expiresAt: row.expires_at ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Audience values a given role may see. Exported so the notice.posted fan-out
 *  (NoticeListener) targets exactly the users who can see the notice in lists. */
export const ROLE_AUDIENCES: Record<string, string[]> = {
  PLATFORM_ADMIN: ['ALL', 'TEACHERS', 'PARENTS', 'STUDENTS', 'CLASS'],
  SCHOOL_OWNER:   ['ALL', 'TEACHERS', 'PARENTS', 'STUDENTS', 'CLASS'],
  PRINCIPAL:      ['ALL', 'TEACHERS', 'PARENTS', 'STUDENTS', 'CLASS'],
  ACADEMIC_COORDINATOR: ['ALL', 'TEACHERS', 'STUDENTS', 'CLASS'],
  ACCOUNTANT:     ['ALL', 'TEACHERS'],
  LIBRARIAN:      ['ALL', 'TEACHERS'],
  TEACHER:        ['ALL', 'TEACHERS'],
  STUDENT:        ['ALL', 'STUDENTS'],
  PARENT:         ['ALL', 'PARENTS'],
};

@Injectable()
export class NoticeService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createNotice(dto: CreateNoticeDto, userId: string) {
    const rows = await this.tenantPrisma.run((tx) =>
      tx.$queryRawUnsafe<NoticeRow[]>(
        `INSERT INTO notices (title, body, type, audience, class_id, expires_at, created_by, is_published)
         VALUES ($1, $2, $3, $4, $5::uuid, $6::timestamptz, $7::uuid, false)
         RETURNING *`,
        dto.title,
        dto.body,
        dto.type ?? 'GENERAL',
        dto.audience ?? 'ALL',
        dto.classId ?? null,
        dto.expiresAt ?? null,
        userId,
      ),
    );
    return toNoticeResponse(rows[0]);
  }

  async publishNotice(id: string, userId: string) {
    const existing = await this.tenantPrisma.run((tx) =>
      tx.$queryRawUnsafe<NoticeRow[]>(
        `SELECT id, is_published, created_by, deleted_at FROM notices WHERE id = $1::uuid`,
        id,
      ),
    );
    if (!existing[0] || existing[0].deleted_at) throw new NotFoundException(`Notice ${id} not found`);

    const rows = await this.tenantPrisma.run((tx) =>
      tx.$queryRawUnsafe<NoticeRow[]>(
        `UPDATE notices SET is_published = true, published_at = NOW(), updated_at = NOW()
         WHERE id = $1::uuid
         RETURNING *`,
        id,
      ),
    );

    // PUSH-1 (NEW event): fan-out only on the FIRST publish — re-publishing an
    // already-published notice must not re-notify. Fire-and-forget.
    if (!existing[0].is_published) {
      const { slug } = this.tenantContext.getOrThrow();
      this.eventEmitter.emit('notice.posted', {
        tenantSlug: slug,
        noticeId: rows[0].id,
        title: rows[0].title,
        body: rows[0].body,
        audience: rows[0].audience,
        classId: rows[0].class_id,
      });
    }
    return toNoticeResponse(rows[0]);
  }

  async updateNotice(id: string, dto: UpdateNoticeDto, userId: string, userRole: string) {
    const existing = await this.tenantPrisma.run((tx) =>
      tx.$queryRawUnsafe<NoticeRow[]>(
        `SELECT id, created_by, deleted_at FROM notices WHERE id = $1::uuid`,
        id,
      ),
    );
    if (!existing[0] || existing[0].deleted_at) throw new NotFoundException(`Notice ${id} not found`);

    const isPrincipalOrAbove = ['PLATFORM_ADMIN', 'SCHOOL_OWNER', 'PRINCIPAL'].includes(userRole);
    if (!isPrincipalOrAbove && existing[0].created_by !== userId) {
      throw new ForbiddenException(errorBody('FORBIDDEN_SCOPE', 'You can only edit your own notices'));
    }

    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [id];
    let idx = 2;

    if (dto.title !== undefined)    { sets.push(`title = $${idx++}`);          params.push(dto.title); }
    if (dto.body !== undefined)     { sets.push(`body = $${idx++}`);            params.push(dto.body); }
    if (dto.type !== undefined)     { sets.push(`type = $${idx++}`);            params.push(dto.type); }
    if (dto.audience !== undefined) { sets.push(`audience = $${idx++}`);        params.push(dto.audience); }
    if (dto.classId !== undefined)  { sets.push(`class_id = $${idx++}::uuid`);  params.push(dto.classId); }
    if (dto.expiresAt !== undefined){ sets.push(`expires_at = $${idx++}::timestamptz`); params.push(dto.expiresAt); }

    const rows = await this.tenantPrisma.run((tx) =>
      tx.$queryRawUnsafe<NoticeRow[]>(
        `UPDATE notices SET ${sets.join(', ')} WHERE id = $1::uuid RETURNING *`,
        ...params,
      ),
    );
    return toNoticeResponse(rows[0]);
  }

  async deleteNotice(id: string) {
    const rows = await this.tenantPrisma.run((tx) =>
      tx.$queryRawUnsafe<NoticeRow[]>(
        `UPDATE notices SET deleted_at = NOW() WHERE id = $1::uuid AND deleted_at IS NULL RETURNING id`,
        id,
      ),
    );
    if (!rows[0]) throw new NotFoundException(`Notice ${id} not found`);
  }

  async getNoticeById(id: string) {
    const rows = await this.tenantPrisma.query<NoticeRow>(
      `SELECT * FROM notices WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Notice ${id} not found`);
    return toNoticeResponse(rows[0]);
  }

  async getNotices(
    query: ListNoticesQueryDto,
    userRole: string,
    classId: string | null,
  ): Promise<{ data: ReturnType<typeof toNoticeResponse>[]; meta: { page: number; limit: number; total: number } }> {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const offset = (page - 1) * limit;

    const allowedAudiences = ROLE_AUDIENCES[userRole] ?? ['ALL'];
    const isPrincipalOrAbove = ['PLATFORM_ADMIN', 'SCHOOL_OWNER', 'PRINCIPAL'].includes(userRole);

    const conditions: string[] = [
      'deleted_at IS NULL',
      '(expires_at IS NULL OR expires_at > NOW())',
    ];
    const params: unknown[] = [];
    let idx = 1;

    // Unpublished notices only visible to PRINCIPAL+
    if (!isPrincipalOrAbove) {
      conditions.push('is_published = true');
    }

    // Audience-based filtering
    const audiencePlaceholders = allowedAudiences.map(() => `$${idx++}`).join(', ');
    conditions.push(`audience IN (${audiencePlaceholders})`);
    params.push(...allowedAudiences);

    if (query.audience) { conditions.push(`audience = $${idx++}`); params.push(query.audience); }
    if (query.type)     { conditions.push(`type = $${idx++}`);     params.push(query.type); }

    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<NoticeRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count FROM notices
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map(toNoticeResponse),
      meta: { page, limit, total },
    };
  }
}
