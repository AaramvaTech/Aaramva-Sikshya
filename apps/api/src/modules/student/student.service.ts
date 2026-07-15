import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { adToBs, getBsYear } from 'bs-calendar';
import { generateTemporaryPassword } from '../mail/password.util';
import { MAIL_EVENTS } from '../mail/mail.events';
import type { CredentialsIssuedEvent } from '../mail/mail.events';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantPrismaService, TenantTx } from '../tenant/tenant-prisma.service';
import {
  StudentRow,
  StudentResponseDto,
  GuardianDto,
  GuardianRowLite,
  toGuardianDto,
  toStudentResponse,
} from './entities/student.entity';
import { GuardianService } from './guardian.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { CreateStudentAccountDto } from './dto/create-student-account.dto';
import { EnrollStudentDto } from './dto/enroll-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { Role } from '../common/enums/role.enum';
import { StorageService } from '../storage/storage.service';
import {
  CredentialDeliveryService,
  DeliveryTarget,
} from '../credential-delivery/credential-delivery.service';
import { credentialKeyConfigured } from '../credential-delivery/credential-crypto.util';
import { toE164Nepal } from '../common/utils/phone.util';

const SORT_WHITELIST: Record<string, string> = {
  created_at: 'created_at',
  first_name: 'first_name',
  last_name: 'last_name',
  student_id: 'student_id',
  admission_date: 'admission_date',
};

type UpdateFieldSpec = [keyof UpdateStudentDto, string, 'text' | 'date' | 'jsonb' | 'int'];

const UPDATE_FIELD_MAP: UpdateFieldSpec[] = [
  ['firstName',        'first_name',        'text'],
  ['lastName',         'last_name',         'text'],
  ['dateOfBirth',      'date_of_birth',     'date'],
  ['gender',           'gender',            'text'],
  ['bloodGroup',       'blood_group',       'text'],
  ['religion',         'religion',          'text'],
  ['ethnicity',        'ethnicity',         'text'],
  ['nationality',      'nationality',       'text'],
  ['motherTongue',     'mother_tongue',     'text'],
  ['phone',            'phone',             'text'],
  ['email',            'email',             'text'],
  ['permanentAddress', 'permanent_address', 'jsonb'],
  ['temporaryAddress', 'temporary_address', 'jsonb'],
  // NOTE: `guardians` is deliberately NOT here (MIG-2). Guardians are written to
  // the normalized `guardians` table via GuardianService.insertGuardiansTx, not
  // a JSONB column on students. See updateStudent().
  // className / sectionName / academicYear text fields are skipped when UUID IDs are provided
  ['className',        'class_name',        'text'],
  ['sectionName',      'section_name',      'text'],
  ['rollNumber',       'roll_number',       'int'],
  ['admissionDate',    'admission_date',    'date'],
  ['academicYear',     'academic_year',     'text'],
  ['previousSchool',   'previous_school',   'text'],
  ['photoUrl',         'photo_url',         'text'],
];

@Injectable()
export class StudentService {
  private readonly logger = new Logger(StudentService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly guardianService: GuardianService,
    private readonly events: EventEmitter2,
    private readonly storage: StorageService,
    private readonly credentialDelivery: CredentialDeliveryService,
  ) {}

  /**
   * FILE-1: a verified storage key (photoFileKey) wins over the legacy base64
   * photoUrl, which keeps working through cutover but is logged as deprecated.
   */
  private async resolvePhotoValue(dto: {
    photoUrl?: string;
    photoFileKey?: string;
  }): Promise<string | undefined> {
    if (dto.photoFileKey !== undefined) {
      const { slug } = this.tenantContext.getOrThrow();
      await this.storage.verifyConfirmedKey(dto.photoFileKey, 'student-photo', slug);
      return dto.photoFileKey;
    }
    if (dto.photoUrl?.startsWith('data:')) {
      this.logger.warn(
        '[FILE-1] deprecated base64 student photo received — switch to the presign flow (photoFileKey)',
      );
    }
    return dto.photoUrl;
  }

  async admitStudent(dto: CreateStudentDto, createdById: string): Promise<StudentResponseDto> {
    const { tenantId } = this.tenantContext.getOrThrow();

    // FILE-1: resolve/verify the photo BEFORE the insert tx. Note the INSERT
    // previously had no photo_url at all — admission photos were silently
    // dropped; fixed here for both the key and the legacy base64 path.
    const photoValue = await this.resolvePhotoValue(dto);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await this.tenantPrisma.run(async (tx) => {
          const admissionDate = new Date(dto.admissionDate);
          if (isNaN(admissionDate.getTime())) {
            throw new BadRequestException('Invalid admission date');
          }
          const minAdDate = new Date('1943-04-14');
          const maxAdDate = new Date('2043-04-13');
          if (admissionDate < minAdDate || admissionDate > maxAdDate) {
            throw new BadRequestException('Admission date must be within BS calendar range (2000–2100 BS)');
          }

          const studentId = await this.generateStudentId(tx, admissionDate);

          // Resolve class/section UUIDs → names when IDs are provided
          let classIdToInsert: string | null = null;
          let sectionIdToInsert: string | null = null;
          let classNameToInsert: string | null = dto.className ?? null;
          let sectionNameToInsert: string | null = dto.sectionName ?? null;
          let academicYearToInsert: string | null = dto.academicYear ?? null;

          if (dto.classId && dto.sectionId) {
            const classRows = await tx.$queryRawUnsafe<{ name: string }[]>(
              `SELECT name FROM classes WHERE id = $1::uuid AND deleted_at IS NULL`,
              dto.classId,
            );
            if (!classRows[0]) throw new NotFoundException('Class not found');

            const sectionRows = await tx.$queryRawUnsafe<{ name: string }[]>(
              `SELECT name FROM sections WHERE id = $1::uuid AND class_id = $2::uuid AND deleted_at IS NULL`,
              dto.sectionId, dto.classId,
            );
            if (!sectionRows[0]) throw new NotFoundException('Section not found');

            classIdToInsert = dto.classId;
            sectionIdToInsert = dto.sectionId;
            classNameToInsert = classRows[0].name;
            sectionNameToInsert = sectionRows[0].name;
          }

          if (dto.academicYearId) {
            const yearRows = await tx.$queryRawUnsafe<{ name: string }[]>(
              `SELECT name FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
              dto.academicYearId,
            );
            if (yearRows[0]) academicYearToInsert = yearRows[0].name;
          }

          const rows = await tx.$queryRawUnsafe<StudentRow[]>(
            `INSERT INTO students (
               tenant_id, student_id, first_name, last_name, date_of_birth, gender,
               blood_group, religion, ethnicity, nationality, mother_tongue,
               phone, email, permanent_address, temporary_address,
               class_id, section_id, class_name, section_name, roll_number,
               admission_date, academic_year, previous_school, created_by, photo_url
             ) VALUES (
               $1::uuid, $2, $3, $4, $5::date, $6,
               $7, $8, $9, $10, $11,
               $12, $13, $14::jsonb, $15::jsonb,
               $16::uuid, $17::uuid, $18, $19, $20,
               $21::date, $22, $23, $24::uuid, $25
             ) RETURNING *`,
            tenantId, studentId,
            dto.firstName, dto.lastName, dto.dateOfBirth, dto.gender,
            dto.bloodGroup ?? null, dto.religion ?? null, dto.ethnicity ?? null,
            dto.nationality ?? 'Nepali', dto.motherTongue ?? null,
            dto.phone ?? null, dto.email ?? null,
            dto.permanentAddress ? JSON.stringify(dto.permanentAddress) : null,
            dto.temporaryAddress ? JSON.stringify(dto.temporaryAddress) : null,
            classIdToInsert, sectionIdToInsert,
            classNameToInsert, sectionNameToInsert, dto.rollNumber ?? null,
            dto.admissionDate, academicYearToInsert,
            dto.previousSchool ?? null, createdById, photoValue ?? null,
          );

          const student = rows[0];
          // MIG-2: guardians are persisted to the normalized `guardians` table
          // in the SAME transaction as the student insert (atomic), not a JSONB
          // column on students.
          const guardians = await this.guardianService.insertGuardiansTx(
            tx,
            student.id,
            dto.guardians ?? [],
          );
          return { student, guardians };
        });
        return toStudentResponse(result.student, result.guardians);
      } catch (err: any) {
        if (attempt < 2 && err?.code === 'P2002') continue;
        throw err;
      }
    }
    throw new Error('Failed to generate unique student ID after 3 attempts');
  }

  async findAll(query: ListStudentsQueryDto): Promise<{
    data: StudentResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page  = query.page  ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const search      = query.search?.trim() || null;
    const className   = query.className ?? null;
    const sectionName = query.section   ?? null;
    const status      = query.status    ?? null;
    const classId     = query.classId   ?? null;
    const sectionId   = query.sectionId ?? null;

    const sortCol = SORT_WHITELIST[query.sortBy ?? 'created_at'] ?? 'created_at';
    const sortDir = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const rows = await this.tenantPrisma.query<StudentRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM students
       WHERE deleted_at IS NULL
         AND ($1::text IS NULL OR (
               first_name ILIKE '%' || $1 || '%' OR
               last_name  ILIKE '%' || $1 || '%' OR
               student_id ILIKE '%' || $1 || '%'
             ))
         AND ($2::text IS NULL OR class_name   = $2)
         AND ($3::text IS NULL OR section_name = $3)
         AND ($4::text IS NULL OR status       = $4)
         AND ($5::uuid IS NULL OR class_id   = $5::uuid)
         AND (
           $6::uuid IS NULL OR
           section_id = $6::uuid OR
           (section_id IS NULL AND section_name = (SELECT name FROM sections WHERE id = $6::uuid))
         )
       ORDER BY ${sortCol} ${sortDir}
       LIMIT $7 OFFSET $8`,
      search, className, sectionName, status, classId, sectionId, limit, offset,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;

    const guardiansByStudent = await this.fetchGuardians(rows.map((r) => r.id));

    return {
      data: rows.map((r) => toStudentResponse(r, guardiansByStudent.get(r.id) ?? [])),
      meta: { page, limit, total },
    };
  }

  async findOne(id: string): Promise<StudentResponseDto> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.tenantPrisma.query<StudentRow>(
      `SELECT * FROM students WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL`,
      id, tenantId,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${id} not found`);
    const guardiansByStudent = await this.fetchGuardians([rows[0].id]);
    return toStudentResponse(rows[0], guardiansByStudent.get(rows[0].id) ?? []);
  }

  async updateStudent(id: string, dto: UpdateStudentDto): Promise<StudentResponseDto> {
    const { tenantId } = this.tenantContext.getOrThrow();

    // FILE-1: a verified photoFileKey rides the existing photoUrl column path.
    dto.photoUrl = await this.resolvePhotoValue(dto);

    // MIG-2: guardians supplied on an update are written to the normalized
    // `guardians` table (find-or-create, additive — never wholesale-replaces or
    // unlinks existing rows). Guardian edits/removals belong to the dedicated
    // guardian endpoints, which own the user_id parent-account linkage.
    if (dto.guardians?.length) {
      const exists = await this.tenantPrisma.query<{ id: string }>(
        `SELECT id FROM students WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL`,
        id, tenantId,
      );
      if (!exists[0]) throw new NotFoundException(`Student ${id} not found`);
      await this.tenantPrisma.run((tx) =>
        this.guardianService.insertGuardiansTx(tx, id, dto.guardians!),
      );
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // When UUID IDs are provided, skip text fields so they get derived from the IDs
    const skipTextEnrollment = !!(dto.classId && dto.sectionId);
    const skipTextAcademicYear = !!dto.academicYearId;

    for (const [dtoKey, col, type] of UPDATE_FIELD_MAP) {
      if (skipTextEnrollment && (dtoKey === 'className' || dtoKey === 'sectionName')) continue;
      if (skipTextAcademicYear && dtoKey === 'academicYear') continue;
      const val = dto[dtoKey];
      if (val !== undefined) {
        const cast = type === 'text' ? '' : `::${type}`;
        setClauses.push(`${col} = $${idx++}${cast}`);
        params.push(type === 'jsonb' ? JSON.stringify(val) : val);
      }
    }

    // Resolve class/section UUIDs → names and set all four enrollment columns
    if (dto.classId && dto.sectionId) {
      const classRows = await this.tenantPrisma.query<{ name: string }>(
        `SELECT name FROM classes WHERE id = $1::uuid AND deleted_at IS NULL`,
        dto.classId,
      );
      if (!classRows[0]) throw new NotFoundException('Class not found');

      const sectionRows = await this.tenantPrisma.query<{ name: string }>(
        `SELECT name FROM sections WHERE id = $1::uuid AND class_id = $2::uuid AND deleted_at IS NULL`,
        dto.sectionId, dto.classId,
      );
      if (!sectionRows[0]) throw new NotFoundException('Section not found');

      setClauses.push(`class_id = $${idx++}::uuid`);   params.push(dto.classId);
      setClauses.push(`section_id = $${idx++}::uuid`); params.push(dto.sectionId);
      setClauses.push(`class_name = $${idx++}`);       params.push(classRows[0].name);
      setClauses.push(`section_name = $${idx++}`);     params.push(sectionRows[0].name);
    }

    if (dto.academicYearId) {
      const yearRows = await this.tenantPrisma.query<{ name: string }>(
        `SELECT name FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
        dto.academicYearId,
      );
      if (yearRows[0]) {
        setClauses.push(`academic_year = $${idx++}`);
        params.push(yearRows[0].name);
      }
    }

    if (setClauses.length === 0) return this.findOne(id);

    setClauses.push('updated_at = NOW()');
    params.push(id);
    params.push(tenantId);

    const rows = await this.tenantPrisma.query<StudentRow>(
      `UPDATE students SET ${setClauses.join(', ')}
       WHERE id = $${idx}::uuid AND tenant_id = $${idx + 1}::uuid AND deleted_at IS NULL
       RETURNING *`,
      ...params,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${id} not found`);
    const guardiansByStudent = await this.fetchGuardians([rows[0].id]);
    return toStudentResponse(rows[0], guardiansByStudent.get(rows[0].id) ?? []);
  }

  async updateStatus(id: string, dto: UpdateStudentStatusDto): Promise<StudentResponseDto> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const affected = await this.tenantPrisma.execute(
      `UPDATE students SET status = $1, updated_at = NOW()
       WHERE id = $2::uuid AND tenant_id = $3::uuid AND deleted_at IS NULL`,
      dto.status, id, tenantId,
    );
    if (affected === 0) throw new NotFoundException(`Student ${id} not found`);
    return this.findOne(id);
  }

  async enroll(id: string, dto: EnrollStudentDto): Promise<StudentResponseDto> {
    const { tenantId } = this.tenantContext.getOrThrow();

    const studentRows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL`,
      id, tenantId,
    );
    if (!studentRows[0]) throw new NotFoundException(`Student ${id} not found`);

    const classRows = await this.tenantPrisma.query<{ name: string }>(
      `SELECT name FROM classes WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.classId,
    );
    if (!classRows[0]) throw new NotFoundException(`Class not found`);

    const sectionRows = await this.tenantPrisma.query<{ name: string }>(
      `SELECT name FROM sections WHERE id = $1::uuid AND class_id = $2::uuid AND deleted_at IS NULL`,
      dto.sectionId, dto.classId,
    );
    if (!sectionRows[0]) throw new NotFoundException(`Section not found`);

    const yearRows = await this.tenantPrisma.query<{ name: string }>(
      `SELECT name FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.academicYearId,
    );
    if (!yearRows[0]) throw new NotFoundException(`Academic year not found`);

    await this.tenantPrisma.execute(
      `UPDATE students SET
         class_id = $1::uuid, section_id = $2::uuid,
         class_name = $3, section_name = $4, roll_number = $5,
         academic_year = $6, updated_at = NOW()
       WHERE id = $7::uuid AND tenant_id = $8::uuid AND deleted_at IS NULL`,
      dto.classId, dto.sectionId,
      classRows[0].name, sectionRows[0].name, dto.rollNumber ?? null,
      yearRows[0].name, id, tenantId,
    );

    return this.findOne(id);
  }

  async createStudentAccount(
    studentId: string,
    dto: CreateStudentAccountDto,
  ): Promise<{ userId: string; studentId: string; email: string; linked: true }> {
    const { tenantId } = this.tenantContext.getOrThrow();

    const preCheck = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL`,
      studentId, tenantId,
    );
    if (!preCheck[0]) throw new NotFoundException(`Student ${studentId} not found`);

    // MAIL-1: omitted password → generate + email; provided → no email.
    const generated = !dto.password;
    const password = dto.password ?? generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    let enqueued = false;

    const result = await this.tenantPrisma.run(async (tx) => {
      const rows = await tx.$queryRawUnsafe<{
        id: string;
        user_id: string | null;
        first_name: string;
        last_name: string;
        phone: string | null;
      }[]>(
        `SELECT id, user_id, first_name, last_name, phone
         FROM students
         WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL
         FOR UPDATE`,
        studentId, tenantId,
      );
      if (!rows[0]) throw new NotFoundException(`Student ${studentId} not found`);
      const student = rows[0];

      if (student.user_id) {
        throw new ConflictException('Student already has a linked login account');
      }

      const emailConflict = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM users WHERE email = $1`,
        dto.email,
      );
      if (emailConflict[0]) {
        throw new ConflictException('Email is already in use');
      }

      const userRows = await tx.$queryRawUnsafe<{ id: string; email: string }[]>(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, must_change_password)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email`,
        dto.email, passwordHash, Role.STUDENT,
        student.first_name, student.last_name,
        generated, // POL-1 T4: emailed temp password → force change on first login
      );
      const userId = userRows[0].id;

      const affected = await tx.$executeRawUnsafe(
        `UPDATE students SET user_id = $1::uuid, updated_at = NOW()
         WHERE id = $2::uuid AND user_id IS NULL`,
        userId, studentId,
      );
      if (affected === 0) {
        throw new ConflictException('Student already has a linked login account');
      }

      // REG-1 §4 student routing: when a temp password was generated + a key is
      // configured, fan out delivery in-tx — the PRIMARY guardian (email + phone,
      // recipient_user_id = the guardian's user) ALWAYS, plus the student's OWN
      // email (their login) and phone (only when present). Guardian rows name the
      // student in the message (recipient_user_id signal). Else the MAIL event below.
      if (generated && credentialKeyConfigured()) {
        const gRows = await tx.$queryRawUnsafe<
          { email: string | null; phone: string | null; user_id: string | null }[]
        >(
          `SELECT email, phone, user_id FROM guardians
           WHERE student_id = $1::uuid AND is_primary = true AND deleted_at IS NULL
           ORDER BY created_at ASC LIMIT 1`,
          studentId,
        );
        const guardian = gRows[0];
        const targets: DeliveryTarget[] = [{ channel: 'EMAIL', recipient: dto.email }];
        if (student.phone) {
          targets.push({ channel: 'SMS', recipient: toE164Nepal(student.phone) ?? student.phone });
        }
        if (guardian?.email) {
          targets.push({ channel: 'EMAIL', recipient: guardian.email, recipientUserId: guardian.user_id });
        }
        if (guardian?.phone) {
          targets.push({ channel: 'SMS', recipient: toE164Nepal(guardian.phone) ?? guardian.phone, recipientUserId: guardian.user_id });
        }
        await this.credentialDelivery.enqueueInTx(tx, { userId, plaintext: password, targets });
        enqueued = true;
      }

      return { userId, studentId, email: dto.email, linked: true as const };
    });

    if (generated && !enqueued) {
      this.events.emit(MAIL_EVENTS.credentialsIssued, {
        tenantId, to: dto.email, loginEmail: dto.email,
        password, relatedUserId: result.userId, kind: 'new',
      } satisfies CredentialsIssuedEvent);
    }
    return result;
  }

  /**
   * MAIL-1 resend: regenerates a temporary password for the student's linked
   * login and emails it. Existing sessions are revoked (password changed).
   */
  async resendStudentCredentials(
    studentId: string,
  ): Promise<{ userId: string; email: string; sent: true }> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const rows = await this.tenantPrisma.query<{ user_id: string | null; email: string | null }>(
      `SELECT s.user_id, u.email
       FROM students s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = $1::uuid AND s.deleted_at IS NULL`,
      studentId,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${studentId} not found`);
    if (!rows[0].user_id || !rows[0].email) {
      throw new BadRequestException('Student has no linked login account');
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
      await tx.$executeRawUnsafe(
        `DELETE FROM refresh_tokens WHERE user_id = $1::uuid`,
        userId,
      );
    });

    this.events.emit(MAIL_EVENTS.credentialsIssued, {
      tenantId, to: email, loginEmail: email,
      password, relatedUserId: userId, kind: 'reset',
    } satisfies CredentialsIssuedEvent);
    return { userId, email, sent: true };
  }

  async removeStudent(id: string): Promise<void> {
    const { tenantId } = this.tenantContext.getOrThrow();
    const affected = await this.tenantPrisma.execute(
      `UPDATE students SET deleted_at = NOW()
       WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL`,
      id, tenantId,
    );
    if (affected === 0) throw new NotFoundException(`Student ${id} not found`);
  }

  async getStats() {
    const summaryRows = await this.tenantPrisma.query<{
      total: string;
      active: string;
      passed_out: string;
      expelled: string;
      transferred: string;
      dropped: string;
      male: string;
      female: string;
      other_gender: string;
      new_this_month: string;
    }>(
      // QA-1 OBS-C: byStatus buckets must match the real student status enum
      // (ACTIVE, PASSED_OUT, EXPELLED, TRANSFERRED, DROPPED). The old buckets
      // counted INACTIVE/GRADUATED — statuses that can never be set, so
      // PASSED_OUT/EXPELLED/DROPPED students were silently dropped from byStatus.
      `SELECT
         COUNT(*)                                                                AS total,
         COUNT(*) FILTER (WHERE status = 'ACTIVE')                             AS active,
         COUNT(*) FILTER (WHERE status = 'PASSED_OUT')                         AS passed_out,
         COUNT(*) FILTER (WHERE status = 'EXPELLED')                           AS expelled,
         COUNT(*) FILTER (WHERE status = 'TRANSFERRED')                        AS transferred,
         COUNT(*) FILTER (WHERE status = 'DROPPED')                            AS dropped,
         COUNT(*) FILTER (WHERE gender = 'MALE')                               AS male,
         COUNT(*) FILTER (WHERE gender = 'FEMALE')                             AS female,
         COUNT(*) FILTER (WHERE gender = 'OTHER')                              AS other_gender,
         COUNT(*) FILTER (WHERE DATE_TRUNC('month', created_at)
                               = DATE_TRUNC('month', CURRENT_DATE))            AS new_this_month
       FROM students
       WHERE deleted_at IS NULL`,
    );

    const classRows = await this.tenantPrisma.query<{ class_name: string; count: string }>(
      `SELECT class_name, COUNT(*) AS count
       FROM students
       WHERE deleted_at IS NULL AND status = 'ACTIVE' AND class_name IS NOT NULL
       GROUP BY class_name
       ORDER BY class_name`,
    );

    const recentRows = await this.tenantPrisma.query<Pick<
      StudentRow,
      'id' | 'student_id' | 'first_name' | 'last_name' | 'class_name' | 'section_name' | 'admission_date' | 'photo_url' | 'status'
    >>(
      `SELECT id, student_id, first_name, last_name, class_name, section_name,
              admission_date, photo_url, status
       FROM students
       WHERE deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 8`,
    );

    const s = summaryRows[0] ?? { total: '0', active: '0', passed_out: '0', expelled: '0', transferred: '0', dropped: '0', male: '0', female: '0', other_gender: '0', new_this_month: '0' };

    const toAd = (d: Date | string) => {
      const date = d instanceof Date ? d : new Date(d);
      return date.toISOString().split('T')[0];
    };
    const toBs = (d: Date | string) => {
      const date = d instanceof Date ? d : new Date(d);
      const bs = adToBs(date);
      return `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`;
    };

    return {
      total: Number(s.total),
      byStatus: {
        ACTIVE: Number(s.active),
        PASSED_OUT: Number(s.passed_out),
        EXPELLED: Number(s.expelled),
        TRANSFERRED: Number(s.transferred),
        DROPPED: Number(s.dropped),
      },
      byGender: {
        MALE: Number(s.male),
        FEMALE: Number(s.female),
        OTHER: Number(s.other_gender),
      },
      newThisMonth: Number(s.new_this_month),
      byClass: classRows.map((r) => ({ className: r.class_name, count: Number(r.count) })),
      recentAdmissions: recentRows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        fullName: `${r.first_name} ${r.last_name}`,
        className: r.class_name,
        sectionName: r.section_name,
        admissionDate: { ad: toAd(r.admission_date), bs: toBs(r.admission_date) },
        photoUrl: r.photo_url,
        status: r.status,
      })),
    };
  }

  /**
   * Load guardians for the given students from the normalized `guardians` table
   * (MIG-2 — the student profile/list read source), grouped by student_id and
   * ordered primary-first. Returns an empty map for an empty id list.
   */
  private async fetchGuardians(
    studentIds: string[],
  ): Promise<Map<string, GuardianDto[]>> {
    const byStudent = new Map<string, GuardianDto[]>();
    if (studentIds.length === 0) return byStudent;

    const rows = await this.tenantPrisma.query<GuardianRowLite & { student_id: string }>(
      `SELECT id, student_id, relation, first_name, last_name, phone, email, is_primary, user_id
       FROM guardians
       WHERE student_id = ANY($1::uuid[])
       ORDER BY is_primary DESC, created_at ASC`,
      studentIds,
    );
    for (const r of rows) {
      const list = byStudent.get(r.student_id) ?? [];
      list.push(toGuardianDto(r));
      byStudent.set(r.student_id, list);
    }
    return byStudent;
  }

  private async generateStudentId(tx: TenantTx, admissionDate: Date): Promise<string> {
    const bsYear = getBsYear(admissionDate);
    const rows = await tx.$queryRawUnsafe<{ max_id: string | null }[]>(
      `SELECT MAX(student_id) AS max_id FROM students WHERE student_id LIKE $1`,
      `${bsYear}-%`,
    );
    const maxId = rows[0]?.max_id ?? null;
    const seq = maxId ? parseInt(maxId.split('-')[1], 10) + 1 : 1;
    return `${bsYear}-${seq.toString().padStart(4, '0')}`;
  }
}
