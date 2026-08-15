import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { errorBody } from '../common/errors/error-codes';

/**
 * CL — single source of truth for "does this PARENT own this student" checks.
 * Replaces ~10 copy-pasted assertGuardianOwnsStudent/assertParentOwnsStudent
 * implementations across finance, payment gateways, attendance, exams,
 * storage and timetable (docs/api-contracts/CL-guardian-removal-spec.md).
 * Every check filters `deleted_at IS NULL` so a removed guardian-student link
 * (DELETE /students/:studentId/guardians/:guardianId) actually revokes access —
 * none of the copies it replaces did.
 *
 * All 10 replaced call sites only ever asserted on the exception CLASS
 * (ForbiddenException), never the message string (ERR-1: clients key off
 * `code`) — so unifying every call site onto the cataloged FORBIDDEN_SCOPE
 * body here is not a behavior change for any caller.
 */
@Injectable()
export class GuardianScopeService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Throws 403 unless callerId has an ACTIVE guardian link to studentId. */
  async assertOwnsStudent(callerId: string, studentId: string): Promise<void> {
    const rows = await this.tenantPrisma.query<{ ok: number }>(
      `SELECT 1 AS ok FROM guardians
       WHERE user_id = $1::uuid AND student_id = $2::uuid AND deleted_at IS NULL
       LIMIT 1`,
      callerId,
      studentId,
    );
    if (!rows[0]) {
      throw new ForbiddenException(errorBody('FORBIDDEN_SCOPE'));
    }
  }

  /**
   * Timetable's PARENT check asks a differently-shaped question — "does this
   * guardian have an active child in section S" — not "does this guardian own
   * student S" (no single studentId is being requested). Kept in this same
   * service (same table, same deleted_at discipline) rather than inventing a
   * second shared service for one caller.
   */
  async assertOwnsStudentInSection(callerId: string, sectionId: string): Promise<void> {
    const rows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT s.id FROM students s
       JOIN guardians g ON g.student_id = s.id AND g.deleted_at IS NULL
       WHERE g.user_id = $1::uuid AND s.section_id = $2::uuid AND s.deleted_at IS NULL
       LIMIT 1`,
      callerId,
      sectionId,
    );
    if (!rows[0]) {
      throw new ForbiddenException(errorBody('FORBIDDEN_SCOPE'));
    }
  }
}
