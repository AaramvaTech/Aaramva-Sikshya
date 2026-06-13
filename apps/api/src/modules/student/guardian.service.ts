import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { CreateGuardianAccountDto } from './dto/create-guardian-account.dto';
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

  async getMyChildren(userId: string) {
    const rows = await this.tenantPrisma.query<StudentRow & { relation: string }>(
      `SELECT s.id, s.student_id, s.first_name, s.last_name, s.photo_url,
              s.class_name, s.section_name, s.roll_number,
              g.relation
       FROM students s
       JOIN guardians g ON g.student_id = s.id
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
        ? { className: r.class_name, sectionName: r.section_name, rollNumber: r.roll_number }
        : null,
    }));
  }
}
