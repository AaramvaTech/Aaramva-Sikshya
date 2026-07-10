import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import { CreateGuardianAccountDto } from './dto/create-guardian-account.dto';
import { ProvisionGuardianDto } from './dto/provision-guardian.dto';
import { GuardianInputDto } from './dto/create-student.dto';
import { GuardianDto, toGuardianDto } from './entities/student.entity';
import { Role } from '../common/enums/role.enum';

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
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

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

    // Hash before the transaction to keep the DB lock duration short
    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.tenantPrisma.run(async (tx) => {
      // Lock the guardian row to prevent concurrent account creation
      const guardianRows = await tx.$queryRawUnsafe<GuardianRow[]>(
        `SELECT id, student_id, relation, first_name, last_name, phone, email, is_primary, user_id
         FROM guardians WHERE id = $1::uuid AND student_id = $2::uuid FOR UPDATE`,
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

      if (existingUser) {
        if (existingUser.role !== Role.PARENT) {
          throw new ConflictException('Email is already used by a non-PARENT account');
        }
        userId = existingUser.id;
      } else {
        const newUserRows = await tx.$queryRawUnsafe<UserRow[]>(
          `INSERT INTO users (email, password_hash, role, first_name, last_name)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, role, first_name, last_name`,
          dto.email,
          passwordHash,
          Role.PARENT,
          guardian.first_name,
          guardian.last_name ?? null,
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

      return { userId, guardianId, email: dto.email, linked: true };
    });
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
         WHERE student_id = $1::uuid AND phone = $2
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
         WHERE student_id = $1::uuid AND phone IS NOT DISTINCT FROM $2
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

  async getMyChildren(userId: string) {
    const rows = await this.tenantPrisma.query<
      StudentRow & { relation: string; section_id: string | null; academic_year_id: string | null; academic_year_name: string | null }
    >(
      `SELECT s.id, s.student_id, s.first_name, s.last_name, s.photo_url,
              s.class_name, s.section_name, s.roll_number, s.section_id,
              g.relation,
              ay.id AS academic_year_id, ay.name AS academic_year_name
       FROM students s
       JOIN guardians g ON g.student_id = s.id
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
