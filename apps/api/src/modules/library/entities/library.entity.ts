import { adToBs } from 'bs-calendar';

// ─── Row shapes ───────────────────────────────────────────────────────────────

export interface BookCategoryRow {
  id: string;
  name: string;
  created_at: Date | string;
  deleted_at: Date | string | null;
}

export interface BookRow {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
  category_id: string | null;
  edition: string | null;
  language: string;
  description: string | null;
  cover_url: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
  category_name?: string | null;
}

export interface BookCopyRow {
  id: string;
  book_id: string;
  copy_number: string;
  accession_number: string | null;
  shelf_location: string | null;
  condition: string;
  is_available: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  // joined fields from book_issues / library_members
  current_member_id?: string | null;
  current_member_number?: string | null;
  current_due_date?: Date | string | null;
}

export interface LibraryMemberRow {
  id: string;
  user_id: string | null;
  student_id: string | null;
  member_number: string;
  max_books: number;
  is_active: boolean;
  joined_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
  total_count?: string;
}

export interface BookIssueRow {
  id: string;
  book_copy_id: string;
  member_id: string;
  issued_by: string;
  issued_at: Date | string;
  due_date: Date | string;
  returned_at: Date | string | null;
  returned_to: string | null;
  fine_per_day: string | number;
  fine_days: number;
  fine_amount: string | number;
  fine_paid: boolean;
  status: string;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  total_count?: string;
  overdue_days?: number | string | null;
  member_number?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toDateField(d: Date | string | null | undefined): { ad: string; bs: string } | null {
  if (!d) return null;
  const dateStr = d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0];
  try {
    const bs = adToBs(new Date(dateStr));
    return {
      ad: dateStr,
      bs: `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`,
    };
  } catch {
    return { ad: dateStr, bs: dateStr };
  }
}

export function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : parseFloat(v);
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

export interface BookCategoryResponseDto {
  id: string;
  name: string;
  createdAt: { ad: string; bs: string } | null;
}

export function toBookCategoryResponse(row: BookCategoryRow): BookCategoryResponseDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: toDateField(row.created_at),
  };
}

export interface BookResponseDto {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
  categoryId: string | null;
  categoryName: string | null;
  edition: string | null;
  language: string;
  description: string | null;
  createdAt: { ad: string; bs: string } | null;
  updatedAt: { ad: string; bs: string } | null;
}

export function toBookResponse(row: BookRow): BookResponseDto {
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? null,
    publisher: row.publisher ?? null,
    isbn: row.isbn ?? null,
    categoryId: row.category_id ?? null,
    categoryName: row.category_name ?? null,
    edition: row.edition ?? null,
    language: row.language,
    description: row.description ?? null,
    createdAt: toDateField(row.created_at),
    updatedAt: toDateField(row.updated_at),
  };
}

export interface BookCopyIssueInfo {
  memberId: string;
  memberNumber: string;
  dueDate: { ad: string; bs: string } | null;
  isOverdue: boolean;
}

export interface BookCopyResponseDto {
  id: string;
  bookId: string;
  copyNumber: string;
  accessionNumber: string | null;
  shelfLocation: string | null;
  condition: string;
  isAvailable: boolean;
  currentIssue?: BookCopyIssueInfo;
}

export interface BookDetailResponseDto {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  isbn: string | null;
  edition: string | null;
  language: string;
  categoryName: string | null;
  description: string | null;
  totalCopies: number;
  availableCopies: number;
  copies: BookCopyResponseDto[];
}

export function toCopyResponse(row: BookCopyRow): BookCopyResponseDto {
  const dto: BookCopyResponseDto = {
    id: row.id,
    bookId: row.book_id,
    copyNumber: row.copy_number,
    accessionNumber: row.accession_number ?? null,
    shelfLocation: row.shelf_location ?? null,
    condition: row.condition,
    isAvailable: row.is_available,
  };
  if (row.current_member_id) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = row.current_due_date ? new Date(String(row.current_due_date).split('T')[0]) : null;
    if (due) due.setHours(0, 0, 0, 0);
    dto.currentIssue = {
      memberId: row.current_member_id,
      memberNumber: row.current_member_number ?? '',
      dueDate: toDateField(row.current_due_date),
      isOverdue: due ? today > due : false,
    };
  }
  return dto;
}

export interface LibraryMemberResponseDto {
  id: string;
  memberNumber: string;
  memberName: string;
  memberType: 'STUDENT' | 'STAFF';
  maxBooks: number;
  isActive: boolean;
  currentIssueCount: number;
  joinedAt: { ad: string; bs: string } | null;
}

export function toLibraryMemberResponse(row: LibraryMemberRow & { member_name?: string; member_type?: string; current_issue_count?: number | string }): LibraryMemberResponseDto {
  return {
    id: row.id,
    memberNumber: row.member_number,
    memberName: row.member_name ?? '',
    memberType: (row.member_type === 'STAFF' ? 'STAFF' : 'STUDENT') as 'STUDENT' | 'STAFF',
    maxBooks: row.max_books,
    isActive: row.is_active,
    currentIssueCount: row.current_issue_count ? Number(row.current_issue_count) : 0,
    joinedAt: toDateField(row.joined_at),
  };
}

export interface BookIssueResponseDto {
  id: string;
  bookCopyId: string;
  bookTitle: string;
  copyNumber: string;
  memberId: string;
  memberNumber: string;
  memberName: string;
  issuedBy: string;
  issuedAt: { ad: string; bs: string } | null;
  dueDate: { ad: string; bs: string } | null;
  returnedAt: { ad: string; bs: string } | null;
  fineDays: number;
  fineAmount: number;
  finePaid: boolean;
  status: string;
  notes: string | null;
}

export function toBookIssueResponse(row: BookIssueRow & { book_title?: string; copy_number?: string; member_name?: string }): BookIssueResponseDto {
  return {
    id: row.id,
    bookCopyId: row.book_copy_id,
    bookTitle: row.book_title ?? '',
    copyNumber: row.copy_number ?? '',
    memberId: row.member_id,
    memberNumber: row.member_number ?? '',
    memberName: row.member_name ?? '',
    issuedBy: row.issued_by,
    issuedAt: toDateField(row.issued_at),
    dueDate: toDateField(row.due_date),
    returnedAt: toDateField(row.returned_at),
    fineDays: row.fine_days,
    fineAmount: toNum(row.fine_amount),
    finePaid: row.fine_paid,
    status: row.status,
    notes: row.notes ?? null,
  };
}
