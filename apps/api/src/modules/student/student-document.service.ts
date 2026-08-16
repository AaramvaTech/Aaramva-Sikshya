import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { StorageService } from '../storage/storage.service';
import { GuardianScopeService } from './guardian-scope.service';
import { Role } from '../common/enums/role.enum';
import { errorBody } from '../common/errors/error-codes';
import {
  StudentDocumentRow,
  StudentDocumentResponseDto,
  toStudentDocumentResponse,
} from './entities/student.entity';
import { ConfirmStudentDocumentDto } from './dto/student-document.dto';

/**
 * STUDENT-DOCS-1: admin/staff-managed document records for a student — birth
 * certificate, transfer certificate, etc. Real table (student_documents),
 * replacing the vestigial students.documents JSONB column (dropped Phase 3).
 *
 * Upload presigns via the generic POST /files/presign-upload (kind
 * student-document) — Phase 1 built a dedicated presign endpoint here too,
 * matching the frontend's original contract, but Phase 2's actual UI wiring
 * confirmed it unused (mirrors staff's own document upload, which never had
 * one either); Phase 3 removed it. confirmUpload (role-gated at the
 * controller to STUDENT_PROFILE_EDITORS, matching PATCH /students/:id) is
 * the only write left. List/download is broader: staff readers, plus the
 * owning student and their guardians via the same ownership checks used
 * everywhere else in this module.
 */
@Injectable()
export class StudentDocumentService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly storage: StorageService,
    private readonly guardianScope: GuardianScopeService,
  ) {}

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
