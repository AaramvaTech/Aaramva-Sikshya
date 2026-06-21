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

// Backend report-card shape (apps/api .../result.service.ts getReportCard).
// This is the only endpoint that returns subject-level rows, which the
// results screen renders. /exams/results/student/:id returns a flat per-exam
// summary with no subjects, so the screen must consume the report card.
interface ReportCardResponse {
  student: { id: string };
  examResults: {
    examType: { id: string; name: string };
    percentage: number | null;
    grade: string | null;
    gpa: number | null;
    rankInSection: number | null;
    subjects: {
      subjectId: string;
      subjectName: string;
      fullMarks: number;
      marksObtained: number | null;
      grade: string | null;
    }[];
  }[];
}

export function useChildResults(childId: string) {
  return useQuery<ExamResult[]>({
    queryKey: ['parent', 'child', childId, 'results'],
    queryFn: async () => {
      const res = await api.get(`/exams/results/report-card/${childId}`);
      const report = res.data.data as ReportCardResponse;
      const studentId = report.student?.id ?? childId;
      return (report.examResults ?? []).map((er) => ({
        studentId,
        examTypeId: er.examType.id,
        examTypeName: er.examType.name,
        results: (er.subjects ?? []).map((s) => ({
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          fullMark: s.fullMarks,
          passmark: 0,
          marksObtained: s.marksObtained,
          grade: s.grade,
          gradePoint: null,
          remarks: null,
        })),
        rank: er.rankInSection,
        totalMarks: null,
        percentage: er.percentage,
        gpa: er.gpa,
        overallGrade: er.grade,
      }));
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
