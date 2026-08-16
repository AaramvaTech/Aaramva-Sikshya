import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * STUDENT-DOCS-1: documentType is free text (matches staff_documents' own
 * VARCHAR(50), no DB/DTO enum) — the curated kind list is a frontend dropdown
 * concern (Phase 2), same convention staff's DOCUMENT_TYPES list already uses.
 */
export class PresignStudentDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  documentType: string;

  /** Original client filename — logging/UX only, never used for the key. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;

  /** Declared size in bytes; signed into the PUT (Content-Length). */
  @IsInt()
  @Min(1)
  size: number;
}

export class ConfirmStudentDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  documentType: string;

  /** FILE-1 key (kind student-document) from the presign step above. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  fileKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}
