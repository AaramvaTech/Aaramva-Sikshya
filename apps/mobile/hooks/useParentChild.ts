import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import type {
  MyChild,
  ChildAttendanceSummary,
  AttendanceHistoryItem,
  SectionTimetableSlot,
  ExamResult,
  ReportCard,
  FeeAssignment,
  StudentLedger,
} from '../types';

// ─── Children list ────────────────────────────────────────────────────────────

export function useMyChildren() {
  return useQuery<MyChild[]>({
    queryKey: ['parent', 'children'],
    queryFn: async () => {
      const res = await api.get('/students/my-children');
      return res.data.data as MyChild[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Per-child hooks — all keyed by childId to prevent cross-child cache hits ─

export function useChildAttendanceSummary(
  childId: string,
  academicYearId: string | null | undefined,
) {
  return useQuery<ChildAttendanceSummary>({
    queryKey: ['parent', 'child', childId, 'attendance', 'summary', academicYearId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (academicYearId) params.academicYearId = academicYearId;
      const res = await api.get(`/attendance/students/${childId}/summary`, { params });
      return res.data.data as ChildAttendanceSummary;
    },
    enabled: !!childId,
  });
}

export function useChildAttendanceHistory({
  childId,
  fromDate,
  toDate,
  page = 1,
  limit = 32,
}: {
  childId: string;
  fromDate: string;
  toDate: string;
  page?: number;
  limit?: number;
}) {
  return useQuery<{ data: AttendanceHistoryItem[]; meta: { page: number; limit: number; total: number } }>({
    queryKey: ['parent', 'child', childId, 'attendance', 'history', fromDate, toDate, page],
    queryFn: async () => {
      const res = await api.get(`/attendance/students/${childId}/history`, {
        params: { fromDate, toDate, page, limit },
      });
      return res.data.data as {
        data: AttendanceHistoryItem[];
        meta: { page: number; limit: number; total: number };
      };
    },
    enabled: !!childId && !!fromDate && !!toDate,
  });
}

export function useChildTimetable(sectionId: string | null | undefined) {
  return useQuery<SectionTimetableSlot[]>({
    queryKey: ['parent', 'section', sectionId, 'timetable'],
    queryFn: async () => {
      const res = await api.get(`/timetable/section/${sectionId}`);
      const raw = res.data.data as SectionTimetableSlot[] | { slots: SectionTimetableSlot[] };
      return Array.isArray(raw) ? raw : (raw.slots ?? []);
    },
    enabled: !!sectionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useChildResults(childId: string) {
  return useQuery<ExamResult[]>({
    queryKey: ['parent', 'child', childId, 'results'],
    queryFn: async () => {
      const res = await api.get(`/exams/results/student/${childId}`);
      return res.data.data as ExamResult[];
    },
    enabled: !!childId,
  });
}

export function useChildReportCard(childId: string) {
  return useQuery<ReportCard>({
    queryKey: ['parent', 'child', childId, 'report-card'],
    queryFn: async () => {
      const res = await api.get(`/exams/results/report-card/${childId}`);
      return res.data.data as ReportCard;
    },
    enabled: !!childId,
  });
}

export function useChildFees(
  childId: string,
  academicYearId: string | null | undefined,
) {
  return useQuery<FeeAssignment[]>({
    queryKey: ['parent', 'child', childId, 'fees', academicYearId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (academicYearId) params.academicYearId = academicYearId;
      const res = await api.get(`/finance/students/${childId}/fee-assignments`, { params });
      return res.data.data as FeeAssignment[];
    },
    enabled: !!childId,
  });
}

export function useChildLedger(
  childId: string,
  academicYearId: string | null | undefined,
) {
  return useQuery<StudentLedger>({
    queryKey: ['parent', 'child', childId, 'ledger', academicYearId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (academicYearId) params.academicYearId = academicYearId;
      const res = await api.get(`/finance/reports/student-ledger/${childId}`, { params });
      return res.data.data as StudentLedger;
    },
    enabled: !!childId,
  });
}
