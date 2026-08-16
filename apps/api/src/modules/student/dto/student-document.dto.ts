import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * STUDENT-DOCS-1: documentType is free text (matches staff_documents' own
 * VARCHAR(50), no DB/DTO enum) — the curated kind list is a frontend dropdown
 * concern (Phase 2), same convention staff's DOCUMENT_TYPES list already uses.
 *
 * No presign DTO here — Phase 3 removed the dedicated presign endpoint
 * (confirmed unused; the frontend presigns via the generic
 * POST /files/presign-upload, same as staff's own document upload).
 */
export class ConfirmStudentDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  documentType: string;

  /** FILE-1 key (kind student-document) from the generic presign route. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  fileKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}
