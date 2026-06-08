import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { getBsYear } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import {
  StaffProfileRow,
  StaffDocumentRow,
  toStaffResponse,
  toStaffDocumentResponse,
  StaffResponseDto,
  StaffDocumentResponseDto,
} from './entities/hr.entity';
import { CreateStaffDto, UpdateStaffDto, StaffQueryDto, AddStaffDocumentDto } from './dto/staff.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class StaffService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async createStaff(dto: CreateStaffDto): Promise<StaffResponseDto> {
    const profile = await this.tenantPrisma.run(async (tx) => {
      const bsYear = getBsYear(new Date());
      const seqKey = `emp_seq_${bsYear}`;

      const [seqRow] = await tx.$queryRawUnsafe<{ value: bigint }[]>(
        `INSERT INTO sequences (key, value) VALUES ($1, 1)
         ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1
         RETURNING value`,
        seqKey,
      );
      const employeeId = `EMP-${bsYear}-${String(Number(seqRow.value)).padStart(4, '0')}`;

      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

      const [user] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        dto.email,
        passwordHash,
        dto.firstName,
        dto.lastName,
        dto.role,
      );

      const [prof] = await tx.$queryRawUnsafe<StaffProfileRow[]>(
        `INSERT INTO staff_profiles
           (user_id, employee_id, department_id, designation_id,
            date_of_birth, gender, phone, join_date, employment_type,
            base_salary, pan_number, bank_name, bank_account,
            permanent_address, emergency_contact_name, emergency_contact_phone)
         VALUES
           ($1::uuid, $2, $3::uuid, $4::uuid,
            $5::date, $6, $7, $8::date, $9,
            $10, $11, $12, $13,
            $14, $15, $16)
         RETURNING *`,
        user.id,
        employeeId,
        dto.departmentId ?? null,
        dto.designationId ?? null,
        dto.dateOfBirth ?? null,
        dto.gender ?? null,
        dto.phone ?? null,
        dto.joinDate,
        dto.employmentType ?? 'PERMANENT',
        dto.baseSalary,
        dto.panNumber ?? null,
        dto.bankName ?? null,
        dto.bankAccount ?? null,
        dto.permanentAddress ?? null,
        dto.emergencyContactName ?? null,
        dto.emergencyContactPhone ?? null,
      );

      return {
        ...prof,
        email: dto.email,
        first_name: dto.firstName,
        last_name: dto.lastName,
        role: dto.role,
        is_active: true,
        department_name: null,
        designation_title: null,
      };
    });

    return toStaffResponse(profile);
  }

  async listStaff(query: StaffQueryDto): Promise<{
    data: StaffResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['sp.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search) {
      conditions.push(`(u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR sp.employee_id ILIKE $${idx})`);
      params.push(`%${query.search}%`);
      idx++;
    }
    if (query.departmentId) {
      conditions.push(`sp.department_id = $${idx++}::uuid`);
      params.push(query.departmentId);
    }
    if (query.role) {
      conditions.push(`u.role = $${idx++}`);
      params.push(query.role);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);

    const rows = await this.tenantPrisma.query<StaffProfileRow & { total_count: string }>(
      `SELECT sp.*, u.email, u.first_name, u.last_name, u.role, u.is_active,
              d.name AS department_name, des.title AS designation_title,
              COUNT(*) OVER() AS total_count
         FROM staff_profiles sp
         JOIN users u ON u.id = sp.user_id
         LEFT JOIN departments d ON d.id = sp.department_id AND d.deleted_at IS NULL
         LEFT JOIN designations des ON des.id = sp.designation_id AND des.deleted_at IS NULL
         ${where}
         ORDER BY u.first_name ASC, u.last_name ASC
         LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map(toStaffResponse), meta: { page, limit, total } };
  }

  async getStaffDetail(id: string): Promise<StaffResponseDto> {
    const rows = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT sp.*, u.email, u.first_name, u.last_name, u.role, u.is_active,
              d.name AS department_name, des.title AS designation_title
         FROM staff_profiles sp
         JOIN users u ON u.id = sp.user_id
         LEFT JOIN departments d ON d.id = sp.department_id AND d.deleted_at IS NULL
         LEFT JOIN designations des ON des.id = sp.designation_id AND des.deleted_at IS NULL
         WHERE sp.id = $1::uuid AND sp.deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Staff profile ${id} not found`);
    return toStaffResponse(rows[0]);
  }

  async updateStaff(id: string, dto: UpdateStaffDto): Promise<StaffResponseDto> {
    const existing = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT * FROM staff_profiles WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Staff profile ${id} not found`);

    const p = existing[0];
    const rows = await this.tenantPrisma.query<StaffProfileRow>(
      `UPDATE staff_profiles
          SET department_id = $1::uuid,
              designation_id = $2::uuid,
              phone = $3,
              employment_type = $4,
              base_salary = $5,
              pan_number = $6,
              bank_name = $7,
              bank_account = $8,
              permanent_address = $9,
              temporary_address = $10,
              emergency_contact_name = $11,
              emergency_contact_phone = $12,
              updated_at = NOW()
        WHERE id = $13::uuid
        RETURNING *`,
      dto.departmentId !== undefined ? dto.departmentId : p.department_id,
      dto.designationId !== undefined ? dto.designationId : p.designation_id,
      dto.phone !== undefined ? dto.phone : p.phone,
      dto.employmentType ?? p.employment_type,
      dto.baseSalary !== undefined ? dto.baseSalary : p.base_salary,
      dto.panNumber !== undefined ? dto.panNumber : p.pan_number,
      dto.bankName !== undefined ? dto.bankName : p.bank_name,
      dto.bankAccount !== undefined ? dto.bankAccount : p.bank_account,
      dto.permanentAddress !== undefined ? dto.permanentAddress : p.permanent_address,
      dto.temporaryAddress !== undefined ? dto.temporaryAddress : p.temporary_address,
      dto.emergencyContactName !== undefined ? dto.emergencyContactName : p.emergency_contact_name,
      dto.emergencyContactPhone !== undefined ? dto.emergencyContactPhone : p.emergency_contact_phone,
      id,
    );

    return this.getStaffDetail(id);
  }

  async softDeleteStaff(id: string): Promise<void> {
    const rows = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT id, user_id FROM staff_profiles WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Staff profile ${id} not found`);

    const today = new Date().toISOString().split('T')[0];

    await this.tenantPrisma.execute(
      `UPDATE staff_profiles
          SET end_date = $1::date, deleted_at = NOW(), updated_at = NOW()
        WHERE id = $2::uuid`,
      today,
      id,
    );
    await this.tenantPrisma.execute(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1::uuid`,
      rows[0].user_id,
    );
  }

  // ─── Staff Documents ────────────────────────────────────────────────────────

  async addDocument(staffId: string, dto: AddStaffDocumentDto): Promise<StaffDocumentResponseDto> {
    const prof = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT user_id FROM staff_profiles WHERE id = $1::uuid AND deleted_at IS NULL`,
      staffId,
    );
    if (!prof[0]) throw new NotFoundException(`Staff profile ${staffId} not found`);

    const rows = await this.tenantPrisma.query<StaffDocumentRow>(
      `INSERT INTO staff_documents (user_id, document_type, file_url, file_name)
         VALUES ($1::uuid, $2, $3, $4)
         RETURNING *`,
      prof[0].user_id,
      dto.documentType,
      dto.fileUrl,
      dto.fileName ?? null,
    );
    return toStaffDocumentResponse(rows[0]);
  }

  async listDocuments(staffId: string): Promise<StaffDocumentResponseDto[]> {
    const prof = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT user_id FROM staff_profiles WHERE id = $1::uuid AND deleted_at IS NULL`,
      staffId,
    );
    if (!prof[0]) throw new NotFoundException(`Staff profile ${staffId} not found`);

    const rows = await this.tenantPrisma.query<StaffDocumentRow>(
      `SELECT * FROM staff_documents
         WHERE user_id = $1::uuid AND deleted_at IS NULL
         ORDER BY uploaded_at DESC`,
      prof[0].user_id,
    );
    return rows.map(toStaffDocumentResponse);
  }
}
