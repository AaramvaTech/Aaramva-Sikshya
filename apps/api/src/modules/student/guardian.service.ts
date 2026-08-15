import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { TenantContextService } from '../tenant/tenant-context.service';
import { generateTemporaryPassword } from '../mail/password.util';
import { MAIL_EVENTS } from '../mail/mail.events';
import type { CredentialsIssuedEvent } from '../mail/mail.events';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { CreateGuardianAccountDto } from './dto/create-guardian-account.dto';
import { ProvisionGuardianDto } from './dto/provision-guardian.dto';
import { GuardianInputDto } from './dto/create-student.dto';
import { GuardianDto, toGuardianDto } from './entities/student.entity';
import { Role } from '../common/enums/role.enum';
import {
  CredentialDeliveryService,
  DeliveryTarget,
} from '../credential-delivery/credential-delivery.service';
import { credentialKeyConfigured } from '../credential-delivery/credential-crypto.util';
import { toE164Nepal } from '../common/utils/phone.util';

interface GuardianRow {
  id: string;
  student_id: string;
  relation: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  user_id: string | null;
}

interface UserRow {
  id: string;
  email: string;
  role: string;
  first_name: string;
  last_name: string;
}

interface StudentRow {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  class_name: string | null;
  section_name: string | null;
  roll_number: number | null;
}

@Injectable()
export class GuardianService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly events: EventEmitter2,
    private readonly credentialDelivery: CredentialDeliveryService,
  ) {}

  async createGuardianAccount(
    studentId: string,
    guardianId: string,
    dto: CreateGuardianAccountDto,
  ) {
    const studentRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
      studentId,
    );
    if (!studentRows[0]) throw new NotFoundException('Student not found');

    // MAIL-1: omitted password → generate + email (only if a NEW user is created).
    const generated = !dto.password;
    const password = dto.password ?? generateTemporaryPassword();
    // Hash before the transaction to keep the DB lock duration short
    const passwordHash = await bcrypt.hash(password, 10);

    const outcome = await this.tenantPrisma.run(async (tx) => {
      // Lock the guardian row to prevent concurrent account creation
      const guardianRows = await tx.$queryRawUnsafe<GuardianRow[]>(
        `SELECT id, student_id, relation, first_name, last_name, phone, email, is_primary, user_id
         FROM guardians WHERE id = $1::uuid AND student_id = $2::uuid AND deleted_at IS NULL FOR UPDATE`,
        guardianId,
        studentId,
      );
      if (!guardianRows[0]) throw new NotFoundException('Guardian not found');
      const guardian = guardianRows[0];

      if (guardian.user_id) {
        throw new ConflictException('Guardian already has a linked account');
      }

      const existingUserRows = await tx.$queryRawUnsafe<UserRow[]>(
        `SELECT id, email, role, first_name, last_name FROM users WHERE email = $1`,
        dto.email,
      );
      const existingUser = existingUserRows[0] ?? null;

      let userId: string;
      let createdNewUser = false;

      if (existingUser) {
        if (existingUser.role !== Role.PARENT) {
          throw new ConflictException('Email is already used by a non-PARENT account');
        }
        userId = existingUser.id;
      } else {
        createdNewUser = true;
        const newUserRows = await tx.$queryRawUnsafe<UserRow[]>(
          `INSERT INTO users (email, password_hash, role, first_name, last_name, must_change_password)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, email, role, first_name, last_name`,
          dto.email,
          passwordHash,
          Role.PARENT,
          guardian.first_name,
          guardian.last_name ?? null,
          generated, // POL-1 T4: emailed temp password → force change on first login
        );
        userId = newUserRows[0].id;
      }

      // Atomic final guard: only update if still unlinked
      const affected = await tx.$executeRawUnsafe(
        `UPDATE guardians SET user_id = $1::uuid, updated_at = NOW()
         WHERE id = $2::uuid AND user_id IS NULL`,
        userId,
        guardianId,
      );
      if (affected === 0) {
        throw new ConflictException('Guardian already has a linked account');
      }

      // REG-1 §4: when a NEW parent login was created with a generated temp
      // password, enqueue delivery in THIS transaction — the encrypted secret +
      // PENDING ledger rows (EMAIL to the login email, SMS to the guardian phone).
      // Falls back to the legacy MAIL event only when no encryption key is set.
      let enqueued = false;
      if (generated && createdNewUser && credentialKeyConfigured()) {
        const targets: DeliveryTarget[] = [
          { channel: 'EMAIL', recipient: dto.email, templateType: 'GUARDIAN_SELF' },
        ];
        if (guardian.phone) {
          targets.push({
            channel: 'SMS',
            recipient: toE164Nepal(guardian.phone) ?? guardian.phone,
            templateType: 'GUARDIAN_SELF',
          });
        }
        await this.credentialDelivery.enqueueInTx(tx, { userId, plaintext: password, targets });
        enqueued = true;
      }

      return { userId, guardianId, email: dto.email, linked: true as const, createdNewUser, enqueued };
    });

    // Legacy fallback: only when the ledger enqueue did NOT run (no encryption key).
    if (generated && outcome.createdNewUser && !outcome.enqueued) {
      this.events.emit(MAIL_EVENTS.credentialsIssued, {
        tenantId: this.tenantContext.getOrThrow().tenantId,
        to: dto.email, loginEmail: dto.email,
        password, relatedUserId: outcome.userId, kind: 'new',
      } satisfies CredentialsIssuedEvent);
    }
    const { createdNewUser: _omit, enqueued: _omit2, ...result } = outcome;
    return result;
  }

  /**
   * MAIL-1 resend: regenerates a temporary password for the guardian's linked
   * PARENT login and emails it. Existing sessions are revoked.
   */
  async resendGuardianCredentials(
    studentId: string,
    guardianId: string,
  ): Promise<{ userId: string; deliveryIds: string[] }> {
    const rows = await this.tenantPrisma.query<{ user_id: string | null; email: string | null }>(
      `SELECT g.user_id, u.email
       FROM guardians g LEFT JOIN users u ON u.id = g.user_id
       WHERE g.id = $1::uuid AND g.student_id = $2::uuid AND g.deleted_at IS NULL`,
      guardianId, studentId,
    );
    if (!rows[0]) throw new NotFoundException('Guardian not found');
    if (!rows[0].user_id || !rows[0].email) {
      throw new BadRequestException('Guardian has no linked login account');
    }
    // MAIL-3: unified on the ledger — re-derives GUARDIAN_SELF (see resendForUser).
    return this.credentialDelivery.resendForUser(rows[0].user_id);
  }

  /**
   * BUG-1 / Option B — provision a relational guardian + a parent-portal login in
   * one idempotent action. Does all three things the parent app needs:
   *   1. find-or-create the relational guardian (keyed on student_id + phone),
   *   2. create-or-reuse the PARENT user (keyed on email; existing PARENT reused),
   *   3. write the guardians.user_id linkage the hard-scope queries read.
   * Re-running with the same details creates no duplicate guardian and no
   * duplicate user. Mirrors the existing email+password credential pattern; no SMS.
   */
  async provisionGuardian(studentId: string, dto: ProvisionGuardianDto) {
    const studentRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
      studentId,
    );
    if (!studentRows[0]) throw new NotFoundException('Student not found');

    // Hash before the transaction to keep the DB lock duration short.
    const passwordHash = await bcrypt.hash(dto.password, 10);
    // REG-OBS-4: find-or-create keys on phone — normalize the lookup key to E.164
    // (matching the backfilled column) so a bare/977… input matches a stored +977…
    // row instead of creating a duplicate.
    const phoneE164 = toE164Nepal(dto.phone) ?? dto.phone;

    return this.tenantPrisma.run(async (tx) => {
      // 1. Find-or-create the relational guardian, idempotent on (student_id, phone).
      const existingGuardian = await tx.$queryRawUnsafe<GuardianRow[]>(
        `SELECT id, student_id, relation, first_name, last_name, phone, email, is_primary, user_id
         FROM guardians
         WHERE student_id = $1::uuid AND phone = $2 AND deleted_at IS NULL
         ORDER BY created_at ASC
         LIMIT 1
         FOR UPDATE`,
        studentId,
        phoneE164,
      );

      let guardian = existingGuardian[0] ?? null;
      let guardianCreated = false;
      if (!guardian) {
        const inserted = await tx.$queryRawUnsafe<GuardianRow[]>(
          `INSERT INTO guardians (student_id, relation, first_name, last_name, phone, email, is_primary)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
           RETURNING id, student_id, relation, first_name, last_name, phone, email, is_primary, user_id`,
          studentId,
          dto.relation,
          dto.firstName,
          dto.lastName ?? null,
          phoneE164,
          dto.email,
          dto.isPrimary ?? false,
        );
        guardian = inserted[0];
        guardianCreated = true;
      }

      // 2. Already linked? Idempotent no-op — return the existing account.
      if (guardian.user_id) {
        return {
          studentId,
          guardianId: guardian.id,
          userId: guardian.user_id,
          email: guardian.email ?? dto.email,
          relation: guardian.relation,
          isPrimary: guardian.is_primary,
          guardianCreated,
          parentAccountCreated: false,
          linked: true as const,
        };
      }

      // 3. Create-or-reuse the PARENT user, keyed on email (multi-child reuse).
      const existingUserRows = await tx.$queryRawUnsafe<UserRow[]>(
        `SELECT id, email, role, first_name, last_name FROM users WHERE email = $1`,
        dto.email,
      );
      const existingUser = existingUserRows[0] ?? null;

      let userId: string;
      let parentAccountCreated = false;
      if (existingUser) {
        if (existingUser.role !== Role.PARENT) {
          throw new ConflictException('Email is already used by a non-PARENT account');
        }
        userId = existingUser.id;
      } else {
        const newUserRows = await tx.$queryRawUnsafe<UserRow[]>(
          `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, email, role, first_name, last_name`,
          dto.email,
          passwordHash,
          Role.PARENT,
          dto.firstName,
          dto.lastName ?? null,
          phoneE164,
        );
        userId = newUserRows[0].id;
        parentAccountCreated = true;
      }

      // 4. Atomic linkage — only link if still unlinked.
      const affected = await tx.$executeRawUnsafe(
        `UPDATE guardians SET user_id = $1::uuid, updated_at = NOW()
         WHERE id = $2::uuid AND user_id IS NULL`,
        userId,
        guardian.id,
      );
      if (affected === 0) {
        throw new ConflictException('Guardian already has a linked account');
      }

      return {
        studentId,
        guardianId: guardian.id,
        userId,
        email: dto.email,
        relation: guardian.relation,
        isPrimary: guardian.is_primary,
        guardianCreated,
        parentAccountCreated,
        linked: true as const,
      };
    });
  }

  /**
   * MIG-2 write path: persist the guardians supplied on a student create/update
   * DTO into the normalized `guardians` table, inside the caller's transaction.
   *
   * Semantics mirror provisionGuardian's guardian insert:
   *  - find-or-create on (student_id, phone): a guardian whose phone already
   *    exists for this student is left untouched — never duplicated, and its
   *    user_id parent-account linkage is preserved. This makes the call
   *    idempotent and non-destructive on the student-update path.
   *  - no user/login account is created (that stays a deliberate separate action).
   *
   * Exactly one guardian is stored as primary. Precedence rule (deterministic):
   * if the DTO marks EXACTLY ONE primary, that one wins; if it marks ZERO or
   * SEVERAL, the FIRST-LISTED guardian wins as primary. Returns the rows it
   * inserted (the create path uses this as the response's guardian list).
   */
  async insertGuardiansTx(
    tx: TenantTx,
    studentId: string,
    guardians: GuardianInputDto[],
  ): Promise<GuardianDto[]> {
    if (!guardians?.length) return [];

    const explicitPrimaries = guardians.filter((g) => g.isPrimary).length;
    const primaryIndex =
      explicitPrimaries === 1 ? guardians.findIndex((g) => g.isPrimary) : 0;

    const inserted: GuardianDto[] = [];
    for (let i = 0; i < guardians.length; i++) {
      const g = guardians[i];
      // REG-OBS-4: normalize the find-or-create key + stored value to E.164.
      const phoneE164 = g.phone ? (toE164Nepal(g.phone) ?? g.phone) : null;

      const existing = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM guardians
         WHERE student_id = $1::uuid AND phone IS NOT DISTINCT FROM $2 AND deleted_at IS NULL
         LIMIT 1`,
        studentId,
        phoneE164,
      );
      if (existing[0]) continue; // idempotent — guardian with this phone already present

      const rows = await tx.$queryRawUnsafe<GuardianRow[]>(
        `INSERT INTO guardians (student_id, relation, first_name, last_name, phone, email, is_primary)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
         RETURNING id, student_id, relation, first_name, last_name, phone, email, is_primary, user_id`,
        studentId,
        g.relation,
        g.firstName,
        g.lastName ?? null,
        phoneE164,
        g.email ?? null,
        i === primaryIndex,
      );
      inserted.push(toGuardianDto(rows[0]));
    }
    return inserted;
  }

  /**
   * POL-1 T2 — GET /guardians/me. Self-scoped like the /students/me routes:
   * everything resolves from token.userId → guardians.user_id; no id params.
   * A parent may hold several guardian rows (one per child); profile fields
   * come from the primary-preferred row, falling back to the users row.
   */
  async getMyProfile(userId: string) {
    const rows = await this.tenantPrisma.query<{
      guardian_id: string;
      relation: string;
      is_primary: boolean;
      g_first_name: string | null;
      g_last_name: string | null;
      g_phone: string | null;
      g_email: string | null;
      student_pk: string;
      admission_number: string;
      first_name: string;
      last_name: string | null;
      photo_url: string | null;
      class_name: string | null;
      section_name: string | null;
      roll_number: number | null;
    }>(
      `SELECT g.id AS guardian_id, g.relation, g.is_primary,
              g.first_name AS g_first_name, g.last_name AS g_last_name,
              g.phone AS g_phone, g.email AS g_email,
              s.id AS student_pk, s.student_id AS admission_number,
              s.first_name, s.last_name, s.photo_url,
              s.class_name, s.section_name, s.roll_number
       FROM guardians g
       JOIN students s ON s.id = g.student_id AND s.deleted_at IS NULL
       WHERE g.user_id = $1::uuid AND g.deleted_at IS NULL
       ORDER BY g.is_primary DESC, g.created_at ASC`,
      userId,
    );
    if (!rows[0]) {
      throw new ForbiddenException('No guardian record linked to this account');
    }

    const userRows = await this.tenantPrisma.query<{
      email: string;
      phone: string | null;
      first_name: string | null;
      last_name: string | null;
    }>(
      `SELECT email, phone, first_name, last_name FROM users WHERE id = $1::uuid`,
      userId,
    );
    const user = userRows[0] ?? { email: '', phone: null, first_name: null, last_name: null };

    const primary = rows[0];
    return {
      userId,
      firstName: primary.g_first_name ?? user.first_name ?? '',
      lastName: primary.g_last_name ?? user.last_name ?? null,
      relation: primary.relation,
      phone: primary.g_phone ?? user.phone ?? null,
      email: user.email,
      children: rows.map((r) => ({
        id: r.student_pk,
        admissionNumber: r.admission_number,
        firstName: r.first_name,
        lastName: r.last_name,
        photoUrl: r.photo_url,
        relation: r.relation,
        isPrimary: r.is_primary,
        className: r.class_name,
        sectionName: r.section_name,
        rollNumber: r.roll_number,
      })),
    };
  }

  /**
   * CL Phase 1 — DELETE /students/:studentId/guardians/:guardianId. Soft-deletes
   * the guardian-student LINK (deleted_at), matching this codebase's
   * soft-delete-only convention — never a hard delete, never touches the
   * guardian's `users` row. Scoped to one link: a guardian tied to several
   * students (siblings) keeps their other links untouched.
   *
   * Locked decision (CL-guardian-removal-spec.md): removing a guardian's
   * last/only linked student does NOT deactivate their login — it's left
   * intact but empty. That needs no extra code here; it falls out of this
   * same code path once every one of their links has deleted_at set.
   *
   * Atomic conditional UPDATE (same idiom as BILL-6's reject/decide guards):
   * a guardian already removed, or one that never belonged to this student,
   * both surface as the same 404 — no double-decide race.
   */
  async removeGuardian(
    studentId: string,
    guardianId: string,
  ): Promise<{ id: string; studentId: string; removedAt: string }> {
    const rows = await this.tenantPrisma.query<{ id: string; deleted_at: Date }>(
      `UPDATE guardians SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1::uuid AND student_id = $2::uuid AND deleted_at IS NULL
       RETURNING id, deleted_at`,
      guardianId,
      studentId,
    );
    if (!rows[0]) {
      throw new NotFoundException('Guardian not found');
    }
    return { id: rows[0].id, studentId, removedAt: rows[0].deleted_at.toISOString() };
  }

  // ── CL Phase 0 — audience/fan-out helpers ────────────────────────────────
  // Replaces ~12 copy-pasted call sites (5 notification listeners,
  // sms.service.ts ×3, submission.service.ts) that each independently
  // resolved "this student's guardians" without filtering deleted_at.
  // Return shapes vary because callers genuinely need different things
  // (a phone, a user id, a full student row) — see
  // docs/api-contracts/CL-guardian-removal-spec.md Phase 0.

  /**
   * ALL active (non-deleted) linked PARENT user ids for the given students —
   * every guardian gets notified, not just one representative. Used by the
   * push/in-app fan-out listeners (attendance/assignment/notice/examination).
   */
  async getActiveParentUserIds(studentIds: string[]): Promise<string[]> {
    if (studentIds.length === 0) return [];
    const rows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT DISTINCT u.id
       FROM guardians g
       JOIN users u ON u.id = g.user_id AND u.role = 'PARENT' AND u.deleted_at IS NULL
       WHERE g.student_id = ANY($1::uuid[]) AND g.deleted_at IS NULL`,
      studentIds,
    );
    return rows.map((r) => r.id);
  }

  /**
   * Primary-preferred (else earliest) active guardian's phone, one per given
   * student — the SMS broadcast rule (ALL_PARENTS/class/section, and the
   * single-student absence/overdue alerts). Only students with a phone on
   * file appear in the returned map.
   */
  async getPrimaryGuardianPhones(studentIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (studentIds.length === 0) return result;
    const rows = await this.tenantPrisma.query<{ student_id: string; phone: string }>(
      `SELECT d.student_id, d.phone FROM (
         SELECT DISTINCT ON (g.student_id) g.student_id, g.phone
         FROM guardians g
         WHERE g.student_id = ANY($1::uuid[]) AND g.deleted_at IS NULL AND g.phone IS NOT NULL
         ORDER BY g.student_id, g.is_primary DESC, g.created_at ASC
       ) d`,
      studentIds,
    );
    for (const r of rows) result.set(r.student_id, r.phone);
    return result;
  }

  /**
   * Primary-preferred (else earliest) active guardian's linked PARENT user id
   * for ONE student — used where exactly one representative contact is
   * wanted (FinanceListener's payment/overdue push+in-app), not the whole
   * family (contrast getActiveParentUserIds).
   */
  async getPrimaryGuardianUserId(studentId: string): Promise<string | null> {
    const rows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT u.id FROM guardians g
       JOIN users u ON u.id = g.user_id
       WHERE g.student_id = $1::uuid AND g.deleted_at IS NULL
         AND u.role = 'PARENT' AND u.deleted_at IS NULL
       ORDER BY g.is_primary DESC, g.created_at ASC
       LIMIT 1`,
      studentId,
    );
    return rows[0]?.id ?? null;
  }

  /**
   * This parent's actively-linked children, enriched with class/section for
   * audience scoping (EDU-1 assignment listing — which of my children are
   * enrolled in the class an assignment was posted to).
   */
  async getActiveChildStudents(userId: string): Promise<
    Array<{ id: string; classId: string | null; sectionId: string | null; firstName: string; lastName: string }>
  > {
    const rows = await this.tenantPrisma.query<{
      id: string; class_id: string | null; section_id: string | null; first_name: string; last_name: string;
    }>(
      `SELECT DISTINCT s.id, s.class_id, s.section_id, s.first_name, s.last_name
       FROM students s
       JOIN guardians g ON g.student_id = s.id AND g.deleted_at IS NULL
       WHERE g.user_id = $1::uuid AND s.deleted_at IS NULL AND s.status = 'ACTIVE'`,
      userId,
    );
    return rows.map((r) => ({
      id: r.id, classId: r.class_id, sectionId: r.section_id,
      firstName: r.first_name, lastName: r.last_name,
    }));
  }

  async getMyChildren(userId: string) {
    const rows = await this.tenantPrisma.query<
      StudentRow & { relation: string; section_id: string | null; academic_year_id: string | null; academic_year_name: string | null }
    >(
      `SELECT s.id, s.student_id, s.first_name, s.last_name, s.photo_url,
              s.class_name, s.section_name, s.roll_number, s.section_id,
              g.relation,
              ay.id AS academic_year_id, ay.name AS academic_year_name
       FROM students s
       JOIN guardians g ON g.student_id = s.id AND g.deleted_at IS NULL
       LEFT JOIN academic_years ay ON ay.is_current = true AND ay.deleted_at IS NULL
       WHERE g.user_id = $1::uuid
         AND s.deleted_at IS NULL`,
      userId,
    );

    return rows.map((r) => ({
      id: r.id,
      admissionNumber: r.student_id,
      firstName: r.first_name,
      lastName: r.last_name,
      photoUrl: r.photo_url,
      relation: r.relation,
      currentEnrollment: r.class_name
        ? {
            className: r.class_name,
            sectionName: r.section_name,
            rollNumber: r.roll_number,
            sectionId: r.section_id ?? null,
            academicYearId: r.academic_year_id ?? null,
            academicYearName: r.academic_year_name ?? null,
          }
        : null,
    }));
  }
}
