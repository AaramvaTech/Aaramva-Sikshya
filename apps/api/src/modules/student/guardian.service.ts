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
  deleted_at: Date | null;
}

@Injectable()
export class GuardianService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async createGuardianAccount(
    studentId: string,
    guardianId: string,
    dto: CreateGuardianAccountDto,
  ) {
    // 1. Verify student exists
    const studentRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
      studentId,
    );
    if (!studentRows[0]) throw new NotFoundException('Student not found');

    // 2. Verify guardian exists and belongs to student
    const guardianRows = await this.tenantPrisma.query<GuardianRow>(
      `SELECT * FROM guardians WHERE id = $1::uuid AND student_id = $2::uuid`,
      guardianId, studentId,
    );
    if (!guardianRows[0]) throw new NotFoundException('Guardian not found');
    const guardian = guardianRows[0];

    // 3. Already linked — conflict
    if (guardian.user_id) {
      throw new ConflictException('Guardian already has a linked account');
    }

    // 4. Check if email already exists
    const existingUserRows = await this.tenantPrisma.query<UserRow>(
      `SELECT id, email, role, first_name, last_name FROM users WHERE email = $1`,
      dto.email,
    );
    const existingUser = existingUserRows[0] ?? null;

    let userId: string;

    if (existingUser) {
      // 4a. Email belongs to a non-PARENT user — conflict
      if (existingUser.role !== Role.PARENT) {
        throw new ConflictException('Email is already used by a non-PARENT account');
      }
      // 4b. Email belongs to existing PARENT — link, no new user
      userId = existingUser.id;
    } else {
      // 4c. Create new PARENT user
      const passwordHash = await bcrypt.hash(dto.password, 10);
      const newUserRows = await this.tenantPrisma.query<UserRow>(
        `INSERT INTO users (email, password, role, first_name, last_name)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, role, first_name, last_name`,
        dto.email, passwordHash, Role.PARENT,
        guardian.first_name, guardian.last_name ?? '',
      );
      userId = newUserRows[0].id;
    }

    // 5. Link guardian to user
    await this.tenantPrisma.execute(
      `UPDATE guardians SET user_id = $1::uuid, updated_at = NOW()
       WHERE id = $2::uuid`,
      userId, guardianId,
    );

    return { userId, guardianId, email: dto.email, linked: true };
  }

  async getMyChildren(userId: string) {
    // Find all non-deleted students where this user is a linked guardian
    const rows = await this.tenantPrisma.query<
      StudentRow & { relation: string }
    >(
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
        ? {
            className: r.class_name,
            sectionName: r.section_name,
            rollNumber: r.roll_number,
          }
        : null,
    }));
  }
}
