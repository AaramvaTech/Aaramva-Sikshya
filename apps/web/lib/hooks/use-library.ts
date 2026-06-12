import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { libraryApi } from '@/lib/api/library.api';
import { useTenantStore } from '@/store/tenant.store';
import type { AddBookData, AddCopyData, IssueBookData } from '@/types/api.types';

export function useBooks(params?: { page?: number; limit?: number; search?: string; categoryId?: string }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['library', 'books', params],
    queryFn: () => libraryApi.listBooks(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useBookDetail(id: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['library', 'book', id],
    queryFn: () => libraryApi.getBook(id).then((r) => r.data.data),
    enabled: !!slug && !!id,
  });
}

export function useAddBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: AddBookData) => libraryApi.addBook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'books'] });
    },
  });
}

export function useAddCopy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, data }: { bookId: string; data: AddCopyData }) =>
      libraryApi.addCopy(bookId, data),
    onSuccess: (_, { bookId }) => {
      queryClient.invalidateQueries({ queryKey: ['library', 'book', bookId] });
      queryClient.invalidateQueries({ queryKey: ['library', 'books'] });
    },
  });
}

export function useLibraryMembers(params?: { page?: number; limit?: number; search?: string }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['library', 'members', params],
    queryFn: () => libraryApi.listMembers(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useIssues(params?: { page?: number; limit?: number; status?: string; memberId?: string }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['library', 'issues', params],
    queryFn: () => libraryApi.listIssues(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useOverdueIssues() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['library', 'overdue'],
    queryFn: () => libraryApi.getOverdue().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useIssueBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: IssueBookData) => libraryApi.issueBook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'issues'] });
      queryClient.invalidateQueries({ queryKey: ['library', 'books'] });
      queryClient.invalidateQueries({ queryKey: ['library', 'overdue'] });
    },
  });
}

export function useReturnBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, notes }: { issueId: string; notes?: string }) =>
      libraryApi.returnBook(issueId, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'issues'] });
      queryClient.invalidateQueries({ queryKey: ['library', 'books'] });
      queryClient.invalidateQueries({ queryKey: ['library', 'overdue'] });
    },
  });
}

export function usePayFine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (issueId: string) => libraryApi.payFine(issueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'issues'] });
      queryClient.invalidateQueries({ queryKey: ['library', 'overdue'] });
    },
  });
}

export function useRegisterLibraryMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: 'STUDENT' | 'STAFF'; studentId?: string; userId?: string; maxBooks?: number }) =>
      libraryApi.registerMember(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'members'] });
    },
  });
}

export function useBookCategories() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['library', 'categories'],
    queryFn: () => libraryApi.listCategories().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useCreateBookCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => libraryApi.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['library', 'categories'] });
    },
  });
}
