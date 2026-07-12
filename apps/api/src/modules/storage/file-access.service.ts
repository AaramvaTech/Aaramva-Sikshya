import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { READ_URL_TTL_SEC, StorageService } from './storage.service';
import { FileKind, parseStorageKey } from './storage.policy';

/** Staff roles that may read any student/staff photo in their school. */
const STAFF_READERS = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
  Role.ACCOUNTANT,
  Role.TEACHER,
  Role.LIBRARIAN,
];

/** Who may read the settings images (mirrors SettingsController VIEWER_ROLES). */
const SETTINGS_VIEWERS = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
  Role.ACADEMIC_COORDINATOR,
  Role.ACCOUNTANT,
];

/** Staff-document readers beyond the owning staff member. */
const DOCUMENT_MANAGERS = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL];

/**
 * Object-level scoping for presigned reads (FILE-1 read flow).
 *
 * Stored keys are never public URLs; every read presign re-checks BOTH the
 * tenant (key prefix must match the caller's tenant) and the object's owner
 * row — the same IDOR discipline as /students/me: a parent can fetch their
 * own child's photo and nobody else's. Keys that no row references yet are
 * 404 for everyone (no probing uploaded-but-unconfirmed objects).
 */
@Injectable()
export class FileAccessService {
  constructor(
    private readonly storage: StorageService,
    private readonly tenantContext: TenantContextService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async presignRead(rawKey: string | undefined, user: AuthUser) {
    if (!rawKey) throw new BadRequestException('Missing "key" query parameter.');
    const parsed = parseStorageKey(rawKey);
    if (!parsed) throw new BadRequestException('Invalid file key.');

    const { slug } = this.tenantContext.getOrThrow();
    if (parsed.slug !== slug) {
      // Cross-tenant key — indistinguishable from nonexistent on purpose.
      throw new NotFoundException('File not found.');
    }

    await this.assertCanRead(parsed.kind, rawKey, user);
    const url = await this.storage.presignRead(rawKey);
    return { url, expiresIn: READ_URL_TTL_SEC };
  }

  private async assertCanRead(kind: FileKind, key: string, user: AuthUser) {
    switch (kind) {
      case 'school-logo':
        return; // public-read by bucket policy anyway; any tenant user may read

      case 'principal-signature':
      case 'school-stamp': {
        if (!SETTINGS_VIEWERS.includes(user.role)) {
          throw new ForbiddenException('Not allowed to view this file.');
        }
        const rows = await this.tenantPrisma.query<{ ok: number }>(
          `SELECT 1 AS ok FROM public.tenants
           WHERE slug = $1 AND ("principalSignatureUrl" = $2 OR "schoolStampUrl" = $2)`,
          this.tenantContext.getOrThrow().slug,
          key,
        );
        if (rows.length === 0) throw new NotFoundException('File not found.');
        return;
      }

      case 'student-photo': {
        const rows = await this.tenantPrisma.query<{
          id: string;
          user_id: string | null;
        }>(
          `SELECT id, user_id FROM students
           WHERE photo_url = $1 AND deleted_at IS NULL`,
          key,
        );
        if (rows.length === 0) throw new NotFoundException('File not found.');
        if (STAFF_READERS.includes(user.role)) return;
        if (user.role === Role.STUDENT) {
          if (rows[0].user_id === user.userId) return;
          throw new ForbiddenException('Not allowed to view this file.');
        }
        if (user.role === Role.PARENT) {
          const link = await this.tenantPrisma.query<{ ok: number }>(
            `SELECT 1 AS ok FROM guardians
             WHERE student_id = $1::uuid AND user_id = $2::uuid`,
            rows[0].id,
            user.userId,
          );
          if (link.length > 0) return;
        }
        throw new ForbiddenException('Not allowed to view this file.');
      }

      case 'staff-photo': {
        if (!STAFF_READERS.includes(user.role)) {
          throw new ForbiddenException('Not allowed to view this file.');
        }
        const rows = await this.tenantPrisma.query<{ ok: number }>(
          `SELECT 1 AS ok FROM staff_profiles
           WHERE photo_url = $1 AND deleted_at IS NULL`,
          key,
        );
        if (rows.length === 0) throw new NotFoundException('File not found.');
        return;
      }

      case 'staff-document': {
        const rows = await this.tenantPrisma.query<{ user_id: string }>(
          `SELECT user_id FROM staff_documents
           WHERE file_url = $1 AND deleted_at IS NULL`,
          key,
        );
        if (rows.length === 0) throw new NotFoundException('File not found.');
        if (DOCUMENT_MANAGERS.includes(user.role)) return;
        if (rows[0].user_id === user.userId) return;
        throw new ForbiddenException('Not allowed to view this file.');
      }

      // EDU-1: teacher homework attachment — staff read freely; students and
      // parents only when targeted by a non-DRAFT assignment referencing it.
      case 'assignment-attachment': {
        const rows = await this.tenantPrisma.query<{
          class_id: string;
          section_id: string | null;
          status: string;
        }>(
          `SELECT class_id, section_id, status FROM assignments
           WHERE attachment_keys @> jsonb_build_array($1::text) AND deleted_at IS NULL`,
          key,
        );
        if (rows.length === 0) throw new NotFoundException('File not found.');
        if (STAFF_READERS.includes(user.role)) return;
        const visible = rows.filter((r) => r.status !== 'DRAFT');
        if (visible.length === 0) throw new NotFoundException('File not found.');
        if (user.role === Role.STUDENT || user.role === Role.PARENT) {
          const ownJoin =
            user.role === Role.STUDENT
              ? `s.user_id = $3::uuid`
              : `EXISTS (SELECT 1 FROM guardians g WHERE g.student_id = s.id AND g.user_id = $3::uuid)`;
          for (const r of visible) {
            const hit = await this.tenantPrisma.query<{ ok: number }>(
              `SELECT 1 AS ok FROM students s
               WHERE s.deleted_at IS NULL AND s.status = 'ACTIVE'
                 AND s.class_id = $1::uuid
                 AND ($2::uuid IS NULL OR s.section_id = $2::uuid)
                 AND ${ownJoin}
               LIMIT 1`,
              r.class_id,
              r.section_id,
              user.userId,
            );
            if (hit.length > 0) return;
          }
        }
        throw new ForbiddenException('Not allowed to view this file.');
      }

      // EDU-1: student submission file — staff (reviewers), the owning
      // student, and that student's guardians.
      case 'submission-file': {
        const rows = await this.tenantPrisma.query<{
          student_id: string;
          user_id: string | null;
        }>(
          `SELECT sub.student_id, st.user_id
           FROM assignment_submissions sub
           JOIN students st ON st.id = sub.student_id
           WHERE sub.file_key = $1`,
          key,
        );
        if (rows.length === 0) throw new NotFoundException('File not found.');
        if (STAFF_READERS.includes(user.role)) return;
        if (user.role === Role.STUDENT && rows[0].user_id === user.userId) return;
        if (user.role === Role.PARENT) {
          const link = await this.tenantPrisma.query<{ ok: number }>(
            `SELECT 1 AS ok FROM guardians
             WHERE student_id = $1::uuid AND user_id = $2::uuid`,
            rows[0].student_id,
            user.userId,
          );
          if (link.length > 0) return;
        }
        throw new ForbiddenException('Not allowed to view this file.');
      }
    }
  }
}
