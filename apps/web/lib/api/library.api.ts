import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  BookCategory,
  BookSummary,
  BookDetail,
  BookCopy,
  LibraryMember,
  BookIssue,
  AddBookData,
  AddCopyData,
  IssueBookData,
} from '@/types/api.types';

export const libraryApi = {
  listBooks: (params?: { page?: number; limit?: number; search?: string; categoryId?: string }) =>
    api.get<ApiResponse<PaginatedResponse<BookSummary>>>('/library/books', { params }),
  getBook: (id: string) =>
    api.get<ApiResponse<BookDetail>>(`/library/books/${id}`),
  addBook: (data: AddBookData) =>
    api.post<ApiResponse<BookSummary>>('/library/books', data),
  addCopy: (bookId: string, data: AddCopyData) =>
    api.post<ApiResponse<BookCopy>>(`/library/books/${bookId}/copies`, data),

  listMembers: (params?: { page?: number; limit?: number; search?: string }) =>
    api.get<ApiResponse<PaginatedResponse<LibraryMember>>>('/library/members', { params }),
  registerMember: (data: { type: 'STUDENT' | 'STAFF'; studentId?: string; userId?: string; maxBooks?: number }) =>
    api.post<ApiResponse<LibraryMember>>('/library/members', data),

  listIssues: (params?: { page?: number; limit?: number; status?: string; memberId?: string }) =>
    api.get<ApiResponse<PaginatedResponse<BookIssue>>>('/library/issues', { params }),
  getOverdue: () =>
    api.get<ApiResponse<BookIssue[]>>('/library/issues/overdue'),
  issueBook: (data: IssueBookData) =>
    api.post<ApiResponse<BookIssue>>('/library/issues', data),
  returnBook: (issueId: string, data?: { notes?: string }) =>
    api.patch<ApiResponse<BookIssue>>(`/library/issues/${issueId}/return`, data ?? {}),
  payFine: (issueId: string) =>
    api.patch<ApiResponse<BookIssue>>(`/library/issues/${issueId}/pay-fine`, {}),

  listCategories: () =>
    api.get<ApiResponse<BookCategory[]>>('/library/categories'),
  createCategory: (data: { name: string }) =>
    api.post<ApiResponse<BookCategory>>('/library/categories', data),
};
