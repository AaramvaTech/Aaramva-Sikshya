import { useQuery } from '@tanstack/react-query';
import { reportsApi, type RangeParams } from '@/lib/api/reports.api';
import type {
  AttendanceTrendsReport,
  ExamComparisonRow,
  ExamSummaryReport,
  FeeAgingReport,
  LowAttendanceStudent,
  PublishedExam,
  SectionComparisonRow,
  StaffAttendanceRow,
  DaybookReport,
  FinanceDefaultersReport,
  CollectionSummaryReport,
  FinesReport,
} from '@/types/api.types';

// Simple (non-paginated) responses → .data.data throughout.

export function useAttendanceTrends(params: RangeParams & { groupBy?: string }) {
  return useQuery({
    queryKey: ['reports', 'attendance-trends', params],
    queryFn: async () =>
      (await reportsApi.attendanceTrends(params)).data.data as AttendanceTrendsReport,
  });
}

export function useClassComparison(classId: string, params: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['reports', 'class-comparison', classId, params],
    queryFn: async () =>
      (await reportsApi.classComparison(classId, params)).data.data as {
        from: string;
        to: string;
        sections: SectionComparisonRow[];
      },
    enabled: !!classId,
  });
}

export function useLowAttendance(params: RangeParams & { threshold?: number }) {
  return useQuery({
    queryKey: ['reports', 'low-attendance', params],
    queryFn: async () =>
      (await reportsApi.lowAttendance(params)).data.data as {
        from: string;
        to: string;
        threshold: number;
        students: LowAttendanceStudent[];
      },
  });
}

export function useStaffAttendanceSummary(params: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['reports', 'staff-summary', params],
    queryFn: async () =>
      (await reportsApi.staffSummary(params)).data.data as {
        from: string;
        to: string;
        staff: StaffAttendanceRow[];
      },
  });
}

export function usePublishedExams() {
  return useQuery({
    queryKey: ['reports', 'published-exams'],
    queryFn: async () => (await reportsApi.publishedExams()).data.data as PublishedExam[],
  });
}

export function useExamSummary(examTypeId: string, classId?: string) {
  return useQuery({
    queryKey: ['reports', 'exam-summary', examTypeId, classId],
    queryFn: async () =>
      (await reportsApi.examSummary(examTypeId, classId)).data.data as ExamSummaryReport,
    enabled: !!examTypeId,
  });
}

export function useExamComparison(examTypeId: string) {
  return useQuery({
    queryKey: ['reports', 'exam-comparison', examTypeId],
    queryFn: async () =>
      (await reportsApi.examComparison(examTypeId)).data.data as ExamComparisonRow[],
    enabled: !!examTypeId,
  });
}

export function useFeeAging(params: { asOf?: string; classId?: string }) {
  return useQuery({
    queryKey: ['reports', 'fee-aging', params],
    queryFn: async () => (await reportsApi.feeAging(params)).data.data as FeeAgingReport,
  });
}

// ── UI-6 — Billing Reports page (§4.3-4.7 of UI-6-SPEC.md) ─────────────────
// Named `useFinanceDefaulters`/`useCollectionSummary`, not `useDefaulters`/
// `useCollectionReport` — those names are already taken by the old-rail
// hooks in `use-finance.ts`, which must keep working unmodified.

export function useDaybook(params: { bsDate?: string } = {}) {
  return useQuery({
    queryKey: ['reports', 'daybook', params],
    queryFn: async () => (await reportsApi.daybook(params)).data.data as DaybookReport,
  });
}

export function useFinanceDefaulters(params: { classId?: string; minBalance?: string; sort?: string } = {}) {
  return useQuery({
    queryKey: ['reports', 'finance-defaulters', params],
    queryFn: async () => (await reportsApi.financeDefaulters(params)).data.data as FinanceDefaultersReport,
  });
}

export function useCollectionSummary(params: { from?: string; to?: string; groupBy?: string } = {}) {
  return useQuery({
    queryKey: ['reports', 'collection-summary', params],
    queryFn: async () => (await reportsApi.collectionSummary(params)).data.data as CollectionSummaryReport,
  });
}

export function useFines(params: { from?: string; to?: string; classId?: string } = {}) {
  return useQuery({
    queryKey: ['reports', 'fines', params],
    queryFn: async () => (await reportsApi.fines(params)).data.data as FinesReport,
  });
}
