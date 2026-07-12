import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import type {
  MyChild,
  GuardianProfile,
  ChildAttendanceSummary,
  AttendanceHistoryItem,
  SectionTimetableSlot,
  ExamResult,
  ReportCard,
  StudentLedger,
} from '../types';

// ─── Guardian profile (POL-2 T5) ───────────────────────────────────────────────

// Self-scoped guardian profile — real name/relation/phone/email + children.
// Resolves from the token (no id param), like the /students/me routes.
export function useGuardianProfile() {
  return useQuery<GuardianProfile>({
    queryKey: ['parent', 'guardian', 'me'],
    queryFn: async () => {
      const res = await api.get('/guardians/me');
      return res.data.data as GuardianProfile;
    },
    staleTime: 5 * 60 * 1000,
  });
}

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
      // The parent history endpoint returns each row with a BS/AD pair
      // (`date: { ad, bs }`), unlike the student `/me` endpoint's flat `dateAd`.
      // Normalise to the shared AttendanceHistoryItem shape the calendar reads.
      const payload = res.data.data as {
        data: Array<{ date?: { ad: string; bs: string }; dateAd?: string; status: string; remarks: string | null }>;
        meta: { page: number; limit: number; total: number };
      };
      return {
        data: (payload.data ?? []).map((it) => ({
          dateAd: it.date?.ad ?? it.dateAd ?? '',
          status: it.status,
          remarks: it.remarks ?? null,
        })),
        meta: payload.meta,
      };
    },
    enabled: !!childId && !!fromDate && !!toDate,
  });
}

// Slot rows as the backend returns them (no dayOfWeek — the day is the map key).
interface RawSlot {
  slotId: string;
  periodNumber: number;
  startTime: string;
  endTime: string;
  subject: { id: string; name: string; code: string | null };
  teacher: { id: string; fullName: string };
  room: string | null;
}

export function useChildTimetable(sectionId: string | null | undefined) {
  return useQuery<SectionTimetableSlot[]>({
    queryKey: ['parent', 'section', sectionId, 'timetable'],
    queryFn: async () => {
      const res = await api.get(`/timetable/section/${sectionId}`);
      // Backend returns { sectionId, sectionName, className, schedule } where
      // `schedule` is a day-keyed map (0=Sun … 6=Sat) of slot arrays. Flatten to
      // a flat SectionTimetableSlot[] and inject dayOfWeek from the key, which is
      // what the dashboard + timetable screens filter on.
      const raw = res.data.data as { schedule?: Record<string, RawSlot[]> } | SectionTimetableSlot[];
      if (Array.isArray(raw)) return raw;
      const schedule = raw?.schedule ?? {};
      const slots: SectionTimetableSlot[] = [];
      for (const [dow, daySlots] of Object.entries(schedule)) {
        for (const s of daySlots) slots.push({ ...s, dayOfWeek: Number(dow) });
      }
      return slots;
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

// Fee billing for a child. The ledger is the single source of payment status:
// it returns the child's invoices (each with status / amount / paid / balance /
// dueDate) plus a roll-up summary. `academicYearId` is required by the endpoint
// (omitting it 404s on the year lookup), so the query stays disabled until known.
export function useChildLedger(
  childId: string,
  academicYearId: string | null | undefined,
) {
  return useQuery<StudentLedger>({
    queryKey: ['parent', 'child', childId, 'ledger', academicYearId],
    queryFn: async () => {
      const res = await api.get(`/finance/reports/student/${childId}`, {
        params: { academicYearId },
      });
      return res.data.data as StudentLedger;
    },
    enabled: !!childId && !!academicYearId,
  });
}
