import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { examinationApi } from '@/lib/api/examination.api';
import { useTenantStore } from '@/store/tenant.store';
import type { CreateExamTypeData, BulkCreateScheduleData, BulkMarksData } from '@/types/api.types';

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

export function useCreateExamType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateExamTypeData) =>
      examinationApi.createExamType(data),
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
