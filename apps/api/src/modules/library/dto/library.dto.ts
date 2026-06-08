import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

// ─── Book Category ────────────────────────────────────────────────────────────

export class CreateBookCategoryDto {
  @IsString()
  name: string;
}

// ─── Book ─────────────────────────────────────────────────────────────────────

export class AddBookDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsString()
  isbn?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  edition?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateBookDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsString()
  isbn?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  edition?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class BookQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;
}

export class AddCopyDto {
  @IsString()
  copyNumber: string;

  @IsOptional()
  @IsString()
  accessionNumber?: string;

  @IsOptional()
  @IsString()
  shelfLocation?: string;

  @IsOptional()
  @IsEnum(['GOOD', 'FAIR', 'DAMAGED'])
  condition?: string;
}

export class UpdateCopyDto {
  @IsOptional()
  @IsString()
  shelfLocation?: string;

  @IsOptional()
  @IsEnum(['GOOD', 'FAIR', 'DAMAGED', 'WITHDRAWN'])
  condition?: string;
}

// ─── Library Member ───────────────────────────────────────────────────────────

export class RegisterMemberDto {
  @IsEnum(['STUDENT', 'STAFF'])
  type: 'STUDENT' | 'STAFF';

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxBooks?: number;
}

export class UpdateMemberDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxBooks?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class MemberQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

// ─── Issue ────────────────────────────────────────────────────────────────────

export class IssueBookDto {
  @IsUUID()
  bookCopyId: string;

  @IsUUID()
  memberId: string;

  @IsString()
  dueDate: string;

  @IsOptional()
  @Type(() => Number)
  finePerDay?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReturnBookDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class IssueQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsUUID()
  memberId?: string;
}
