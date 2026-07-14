import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { getBsYear } from 'bs-calendar';
import { generateTemporaryPassword } from '../mail/password.util';
import { MAIL_EVENTS } from '../mail/mail.events';
import type { CredentialsIssuedEvent } from '../mail/mail.events';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { todayAdInNepal } from '../common/utils/date.util';
import { toE164Nepal } from '../common/utils/phone.util';
import {
  CredentialDeliveryService,
  DeliveryTarget,
} from '../credential-delivery/credential-delivery.service';
import { credentialKeyConfigured } from '../credential-delivery/credential-crypto.util';
import {
  StaffProfileRow,
  StaffDocumentRow,
  toStaffResponse,
  toStaffDocumentResponse,
  StaffResponseDto,
  StaffDocumentResponseDto,
} from './entities/hr.entity';
import { CreateStaffDto, UpdateStaffDto, StaffQueryDto, AddStaffDocumentDto } from './dto/staff.dto';
import { StorageService } from '../storage/storage.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly events: EventEmitter2,
    private readonly storage: StorageService,
    private readonly credentialDelivery: CredentialDeliveryService,
  ) {}

  async createStaff(dto: CreateStaffDto): Promise<StaffResponseDto> {
    // MAIL-1: omitted password → generate + email; provided → no email.
    const generated = !dto.password;
    const password = dto.password ?? generateTemporaryPassword();
    // REG-1 §2: store the validated Nepali mobile in E.164 (+977…). The DTO
    // guarantees a valid mobile for HTTP callers; direct callers (seeds/tests)
    // may omit it → null (no throw here; the mandatory gate is the DTO).
    const phoneE164 = toE164Nepal(dto.phone);
    let enqueued = false;

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

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      let user: { id: string };
      try {
        [user] = await tx.$queryRawUnsafe<{ id: string }[]>(
          `INSERT INTO users (email, password_hash, first_name, last_name, role, phone, must_change_password)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          dto.email,
          passwordHash,
          dto.firstName,
          dto.lastName,
          dto.role,
          phoneE164, // REG-1 §2: E.164 phone on the user row
          generated, // POL-1 T4: emailed temp password → force change on first login
        );
      } catch (err: unknown) {
        const msg = (err as Error)?.message ?? '';
        if (msg.includes('23505') || msg.includes('unique constraint')) {
          throw new ConflictException('A user with this email already exists');
        }
        throw err;
      }

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
        phoneE164, // REG-1 §2: E.164 phone on the staff profile
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

      // REG-1 §4: enqueue delivery in-tx when a temp password was generated + a key
      // is configured (self-delivery: staff's own email + phone). Else the legacy
      // MAIL event below fires — registration never fails on delivery.
      if (generated && credentialKeyConfigured()) {
        const targets: DeliveryTarget[] = [{ channel: 'EMAIL', recipient: dto.email }];
        if (phoneE164) targets.push({ channel: 'SMS', recipient: phoneE164 });
        await this.credentialDelivery.enqueueInTx(tx, {
          userId: user.id,
          plaintext: password,
          targets,
        });
        enqueued = true;
      }

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

    if (generated && !enqueued) {
      this.events.emit(MAIL_EVENTS.credentialsIssued, {
        tenantId: this.tenantContext.getOrThrow().tenantId,
        to: dto.email, loginEmail: dto.email,
        password, relatedUserId: profile.user_id, kind: 'new',
      } satisfies CredentialsIssuedEvent);
    }
    return toStaffResponse(profile);
  }

  /**
   * MAIL-1 resend: regenerates a temporary password for the staff login and
   * emails it. Existing sessions are revoked.
   */
  async resendStaffCredentials(
    staffProfileId: string,
  ): Promise<{ userId: string; email: string; sent: true }> {
    const rows = await this.tenantPrisma.query<{ user_id: string; email: string | null }>(
      `SELECT sp.user_id, u.email
       FROM staff_profiles sp JOIN users u ON u.id = sp.user_id
       WHERE sp.id = $1::uuid AND sp.deleted_at IS NULL`,
      staffProfileId,
    );
    if (!rows[0]) throw new NotFoundException(`Staff ${staffProfileId} not found`);
    if (!rows[0].email) throw new BadRequestException('Staff login has no email');
    const { user_id: userId, email } = rows[0] as { user_id: string; email: string };

    const password = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
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

  async getMyProfile(userId: string): Promise<StaffResponseDto> {
    const rows = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT sp.*, u.email, u.first_name, u.last_name, u.role, u.is_active,
              d.name AS department_name, des.title AS designation_title
         FROM staff_profiles sp
         JOIN users u ON u.id = sp.user_id
         LEFT JOIN departments d ON d.id = sp.department_id AND d.deleted_at IS NULL
         LEFT JOIN designations des ON des.id = sp.designation_id AND des.deleted_at IS NULL
         WHERE sp.user_id = $1::uuid AND sp.deleted_at IS NULL`,
      userId,
    );
    if (!rows[0]) throw new NotFoundException('Staff profile not found for this user');
    return toStaffResponse(rows[0]);
  }

  async updateStaff(id: string, dto: UpdateStaffDto): Promise<StaffResponseDto> {
    const existing = await this.tenantPrisma.query<StaffProfileRow>(
      `SELECT * FROM staff_profiles WHERE id = $1::uuid AND deleted_at IS NULL`,
      id,
    );
    if (!existing[0]) throw new NotFoundException(`Staff profile ${id} not found`);

    // FILE-1: a verified photoFileKey rides the existing photoUrl column path.
    if (dto.photoFileKey !== undefined) {
      const { slug } = this.tenantContext.getOrThrow();
      await this.storage.verifyConfirmedKey(dto.photoFileKey, 'staff-photo', slug);
      dto.photoUrl = dto.photoFileKey;
    } else if (dto.photoUrl?.startsWith('data:')) {
      this.logger.warn(
        '[FILE-1] deprecated base64 staff photo received — switch to the presign flow (photoFileKey)',
      );
    }

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
              photo_url = $13,
              updated_at = NOW()
        WHERE id = $14::uuid
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
      dto.photoUrl !== undefined ? dto.photoUrl : p.photo_url,
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

    // QA-1 OBS-E-3: end_date is Nepal's calendar today, not UTC-today.
    const today = todayAdInNepal();

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
    // FILE-1: exactly one of fileKey (verified storage key, wins) | fileUrl
    // (legacy base64, deprecated but still accepted through cutover).
    let fileValue: string;
    if (dto.fileKey !== undefined) {
      const { slug } = this.tenantContext.getOrThrow();
      await this.storage.verifyConfirmedKey(dto.fileKey, 'staff-document', slug);
      fileValue = dto.fileKey;
    } else if (dto.fileUrl) {
      if (dto.fileUrl.startsWith('data:')) {
        this.logger.warn(
          '[FILE-1] deprecated base64 staff document received — switch to the presign flow (fileKey)',
        );
      }
      fileValue = dto.fileUrl;
    } else {
      throw new BadRequestException('Either fileKey or fileUrl is required.');
    }

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
      fileValue,
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
