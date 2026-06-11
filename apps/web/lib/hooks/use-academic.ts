import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { academicApi } from '@/lib/api/academic.api';
import { hrApi } from '@/lib/api/hr.api';
import { useTenantStore } from '@/store/tenant.store';
import type { TimetableSlotData, StaffSummary } from '@/types/api.types';

export function useClasses() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['classes'],
    queryFn: () => academicApi.listClasses().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}

export function useSubjects() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['subjects'],
    queryFn: () => academicApi.listSubjects().then((r) => r.data.data.data),
    enabled: !!slug,
  });
}

export function useClassSubjects(classId: string, academicYearId?: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['class-subjects', classId, academicYearId],
    queryFn: () =>
      academicApi
        .getClassSubjects(classId, academicYearId ? { academicYearId } : undefined)
        .then((r) => r.data.data),
    enabled: !!slug && !!classId,
  });
}

export function useSectionTimetable(sectionId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['timetable', 'section', sectionId],
    queryFn: () =>
      academicApi.getSectionTimetable(sectionId).then((r) => r.data.data),
    enabled: !!slug && !!sectionId,
  });
}

export function useCreateClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; alias?: string; orderIndex: number }) =>
      academicApi.createClass(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['classes'] }),
  });
}

export function useUpdateClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ name: string; alias: string; orderIndex: number }>;
    }) => academicApi.updateClass(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['classes'] }),
  });
}

export function useDeleteClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => academicApi.deleteClass(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['classes'] }),
  });
}

export function useCreateSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      classId,
      data,
    }: {
      classId: string;
      data: { name: string; capacity?: number };
    }) => academicApi.createSection(classId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['classes'] }),
  });
}

export function useUpdateSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      classId,
      sectionId,
      data,
    }: {
      classId: string;
      sectionId: string;
      data: Partial<{ name: string; capacity: number }>;
    }) => academicApi.updateSection(classId, sectionId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['classes'] }),
  });
}

export function useDeleteSection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ classId, sectionId }: { classId: string; sectionId: string }) =>
      academicApi.deleteSection(classId, sectionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['classes'] }),
  });
}

export function useCreateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; code?: string; type?: string }) =>
      academicApi.createSubject(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subjects'] }),
  });
}

export function useUpdateSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{ name: string; code: string; type: string }>;
    }) => academicApi.updateSubject(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subjects'] }),
  });
}

export function useDeleteSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => academicApi.deleteSubject(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subjects'] }),
  });
}

export function useAssignSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      classId,
      data,
    }: {
      classId: string;
      data: {
        subjectId: string;
        academicYearId: string;
        fullMarks?: number;
        passMarks?: number;
      };
    }) => academicApi.assignSubject(classId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['class-subjects', variables.classId],
      });
    },
  });
}

export function useRemoveSubject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      classId,
      subjectId,
    }: {
      classId: string;
      subjectId: string;
    }) => academicApi.removeSubject(classId, subjectId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['class-subjects', variables.classId],
      });
    },
  });
}

export function useTeachers() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['teachers'],
    queryFn: () =>
      hrApi.listStaff({ role: 'TEACHER', limit: 200 }).then((r) => r.data.data.data),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: TimetableSlotData) => academicApi.createSlot(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['timetable', 'section', variables.sectionId],
      });
    },
  });
}

export function useDeleteSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      slotId,
      sectionId,
    }: {
      slotId: string;
      sectionId: string;
    }) => academicApi.deleteSlot(slotId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['timetable', 'section', variables.sectionId],
      });
    },
  });
}
