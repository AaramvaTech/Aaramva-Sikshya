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
        const targets: DeliveryTarget[] = [{ channel: 'EMAIL', recipient: dto.email }];
        if (guardian.phone) {
          targets.push({ channel: 'SMS', recipient: toE164Nepal(guardian.phone) ?? guardian.phone });
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
  ): Promise<{ userId: string; email: string; sent: true }> {
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
    const { user_id: userId, email } = rows[0] as { user_id: string; email: string };

    const password = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await this.tenantPrisma.run(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE users SET password_hash = $1, must_change_password = true, updated_at = NOW()
         WHERE id = $2::uuid`,
        passwordHash, userId,
      );
      await tx.$executeRawUnsafe(`DELETE FROM refresh_tokens WHERE user_id = $1::uuid`, userId);
    });

    this.events.emit(MAIL_EVENTS.credentialsIssued, {
      tenantId: this.tenantContext.getOrThrow().tenantId,
      to: email, loginEmail: email,
      password, relatedUserId: userId, kind: 'reset',
    } satisfies CredentialsIssuedEvent);
    return { userId, email, sent: true };
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
        dto.phone,
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
          dto.phone,
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
          dto.phone,
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

      const existing = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM guardians
         WHERE student_id = $1::uuid AND phone IS NOT DISTINCT FROM $2 AND deleted_at IS NULL
         LIMIT 1`,
        studentId,
        g.phone ?? null,
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
        g.phone ?? null,
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
