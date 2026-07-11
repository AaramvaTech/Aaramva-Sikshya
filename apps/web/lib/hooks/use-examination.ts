import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { examinationApi } from '@/lib/api/examination.api';
import { useTenantStore } from '@/store/tenant.store';
import type { CreateExamTypeData, CreateGradingScaleData, BulkCreateScheduleData, BulkMarksData } from '@/types/api.types';

export function useExamTypes(academicYearId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['exam-types', academicYearId],
    queryFn: () =>
      examinationApi.listExamTypes({ academicYearId }).then((r) => r.data.data),
    enabled: !!slug && !!academicYearId,
  });
}

export function useExamSchedules(params: {
  examTypeId?: string;
  classId?: string;
}) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['exam-schedules', params],
    queryFn: () =>
      examinationApi.listSchedules(params).then((r) => r.data.data),
    enabled: !!slug && !!(params.examTypeId || params.classId),
  });
}

export function useMarksForSchedule(scheduleId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['marks', scheduleId],
    queryFn: () =>
      examinationApi.getMarksForSchedule(scheduleId).then((r) => r.data.data.data),
    enabled: !!slug && !!scheduleId,
  });
}

export function useClassResults(classId: string, examTypeId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['results', 'class', classId, examTypeId],
    queryFn: () =>
      examinationApi
        .getClassResults(classId, { examTypeId })
        .then((r) => r.data.data),
    enabled: !!slug && !!classId && !!examTypeId,
  });
}

export function useReportCard(studentId: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['report-card', studentId],
    queryFn: () =>
      examinationApi.getReportCard(studentId).then((r) => r.data.data),
    enabled: !!slug && !!studentId,
  });
}

export function useGradingScales() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['grading-scales'],
    queryFn: () =>
      examinationApi.listGradingScales().then((r) => r.data.data),
    enabled: !!slug,
  });
}

// POL-1 T6 — grading-scale CRUD (rename-only edit; thresholds immutable)
export function useGradingScale(id: string) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['grading-scales', id],
    queryFn: () => examinationApi.getGradingScale(id).then((r) => r.data.data),
    enabled: !!slug && !!id,
  });
}

export function useCreateGradingScale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateGradingScaleData) =>
      examinationApi.createGradingScale(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['grading-scales'] }),
  });
}

export function useRenameGradingScale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      examinationApi.renameGradingScale(id, { name }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['grading-scales'] }),
  });
}

export function useSetDefaultGradingScale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => examinationApi.setDefaultGradingScale(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['grading-scales'] }),
  });
}

export function useCreateExamType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateExamTypeData) =>
      examinationApi.createExamType(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-types'] }),
  });
}

export function useUpdateExamType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; weightPercent?: number; orderIndex?: number } }) =>
      examinationApi.updateExamType(id, data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-types'] }),
  });
}

export function useDeleteExamType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => examinationApi.deleteExamType(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-types'] }),
  });
}

export function useSetExamTypePublished() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      examinationApi.setExamTypePublished(id, published),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-types'] }),
  });
}

export function useBulkCreateSchedules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkCreateScheduleData) =>
      examinationApi.bulkCreateSchedules(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-schedules'] }),
  });
}

export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<{
        examDate: string;
        startTime: string;
        endTime: string;
        fullMarks: number;
        passMarks: number;
        room: string;
      }>;
    }) => examinationApi.updateSchedule(id, data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-schedules'] }),
  });
}

export function useBulkEnterMarks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkMarksData) =>
      examinationApi.bulkEnterMarks(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['marks', variables.examScheduleId],
      });
    },
  });
}

export function useComputeResults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      examTypeId: string;
      classId: string;
      sectionId?: string;
    }) => examinationApi.computeResults(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['results', 'class', variables.classId],
      });
    },
  });
}
