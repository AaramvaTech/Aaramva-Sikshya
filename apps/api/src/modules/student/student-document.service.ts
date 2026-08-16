import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { StorageService, PresignUploadResult } from '../storage/storage.service';
import { GuardianScopeService } from './guardian-scope.service';
import { Role } from '../common/enums/role.enum';
import { errorBody } from '../common/errors/error-codes';
import {
  StudentDocumentRow,
  StudentDocumentResponseDto,
  toStudentDocumentResponse,
} from './entities/student.entity';
import { PresignStudentDocumentDto, ConfirmStudentDocumentDto } from './dto/student-document.dto';

/**
 * STUDENT-DOCS-1: admin/staff-managed document records for a student — birth
 * certificate, transfer certificate, etc. Real table (student_documents),
 * NOT the vestigial students.documents JSONB column (see student.entity.ts).
 *
 * Upload (presign/confirm) is role-gated at the controller to
 * STUDENT_PROFILE_EDITORS (matches PATCH /students/:id). List/download is
 * broader: staff readers, plus the owning student and their guardians via
 * the same ownership checks used everywhere else in this module.
 */
@Injectable()
export class StudentDocumentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storage: StorageService,
    private readonly guardianScope: GuardianScopeService,
  ) {}

  async presignUpload(
    studentId: string,
    dto: PresignStudentDocumentDto,
    role: Role,
  ): Promise<PresignUploadResult> {
    await this.assertStudentExists(studentId);
    const { slug } = this.tenantContext.getOrThrow();
    return this.storage.presignUpload('student-document', dto.contentType, dto.size, slug, role);
  }

  async confirmUpload(
    studentId: string,
    dto: ConfirmStudentDocumentDto,
  ): Promise<StudentDocumentResponseDto> {
    await this.assertStudentExists(studentId);
    const { slug } = this.tenantContext.getOrThrow();
    await this.storage.verifyConfirmedKey(dto.fileKey, 'student-document', slug);

    const rows = await this.tenantPrisma.query<StudentDocumentRow>(
      `INSERT INTO student_documents (student_id, document_type, file_url, file_name)
         VALUES ($1::uuid, $2, $3, $4)
         RETURNING *`,
      studentId,
      dto.documentType,
      dto.fileKey,
      dto.fileName ?? null,
    );
    return toStudentDocumentResponse(rows[0]);
  }

  async listDocuments(
    studentId: string,
    callerId: string,
    callerRole: Role,
  ): Promise<StudentDocumentResponseDto[]> {
    if (callerRole === Role.PARENT) {
      await this.guardianScope.assertOwnsStudent(callerId, studentId);
    } else if (callerRole === Role.STUDENT) {
      await this.assertIsSelf(callerId, studentId);
    } else {
      await this.assertStudentExists(studentId);
    }

    const rows = await this.tenantPrisma.query<StudentDocumentRow>(
      `SELECT * FROM student_documents
       WHERE student_id = $1::uuid AND deleted_at IS NULL
       ORDER BY uploaded_at DESC`,
      studentId,
    );
    return rows.map(toStudentDocumentResponse);
  }

  private async assertStudentExists(studentId: string): Promise<void> {
    const rows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
      studentId,
    );
    if (!rows[0]) throw new NotFoundException(`Student ${studentId} not found`);
  }

  /** A STUDENT caller may only ever view their own linked student row —
   *  checked against token.userId, never trusted from the path param alone.
   *  403 (not 404) to match GuardianScopeService.assertOwnsStudent's
   *  FORBIDDEN_SCOPE convention for the equivalent PARENT check. */
  private async assertIsSelf(callerId: string, studentId: string): Promise<void> {
    const rows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM students WHERE id = $1::uuid AND user_id = $2::uuid AND deleted_at IS NULL`,
      studentId,
      callerId,
    );
    if (!rows[0]) throw new ForbiddenException(errorBody('FORBIDDEN_SCOPE'));
  }
}
