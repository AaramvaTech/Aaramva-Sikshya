import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentsApi } from '@/lib/api/students.api';
import { classesApi } from '@/lib/api/classes.api';
import { academicYearsApi } from '@/lib/api/academic-years.api';
import { useTenantStore } from '@/store/tenant.store';
import type { CreateStudentData, EnrollStudentData } from '@/types/api.types';
import type { EditStudentFormValues } from '@/lib/schemas/student.schema';

export type StudentListParams = {
  page?: number;
  limit?: number;
  search?: string;
  classId?: string;
  className?: string;
  sectionId?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export function useStudentStats() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', 'stats'],
    queryFn: () => studentsApi.getStats().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useStudents(params: StudentListParams) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['students', params],
    queryFn: () => studentsApi.list(params).then((r) => r.data),
    enabled: !!slug,
  });
}

export function useStudent(id: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['student', id],
    queryFn: () => studentsApi.getById(id).then((r) => r.data.data),
    enabled: !!slug && !!id,
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStudentData) => studentsApi.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['students'] }),
  });
}

export function useUpdateStudent(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EditStudentFormValues>) =>
      studentsApi.update(studentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student', studentId] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

export function useEnrollStudent(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: EnrollStudentData) => studentsApi.enroll(studentId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student', studentId] });
      queryClient.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

export function useClasses() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['classes'],
    queryFn: () => classesApi.list().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}

export function useAcademicYears() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['academic-years'],
    queryFn: () => academicYearsApi.list().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}

export function useCurrentAcademicYear() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['academic-years', 'current'],
    queryFn: () => academicYearsApi.getCurrent().then((r) => r.data.data),
    enabled: !!slug,
    retry: false,
  });
}

export function useCreateAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: import('@/lib/api/academic-years.api').CreateAcademicYearData) =>
      academicYearsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
    },
  });
}

export function useSetCurrentAcademicYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => academicYearsApi.setCurrent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
    },
  });
}

// ── Student CSV import (OB2) ──────────────────────────────────────────────────
export function useImportPreview() {
  return useMutation({
    mutationFn: (csv: string) => studentsApi.importPreview(csv).then((r) => r.data.data),
  });
}

export function useImportCommit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) => studentsApi.importCommit(csv).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding', 'status'] });
    },
  });
}
