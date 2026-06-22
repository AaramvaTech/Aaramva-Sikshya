import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import type {
  StudentProfile,
  TimetableResponse,
  AttendanceSummary,
  AttendanceHistoryItem,
  NoticeItem,
  StudentResults,
} from '../types';

export function useMyProfile() {
  return useQuery<StudentProfile>({
    queryKey: ['student', 'me', 'profile'],
    queryFn: async () => {
      const res = await api.get('/students/me');
      return res.data.data as StudentProfile;
    },
  });
}

export function useMyTimetable() {
  return useQuery<TimetableResponse>({
    queryKey: ['student', 'me', 'timetable'],
    queryFn: async () => {
      const res = await api.get('/students/me/timetable/today');
      return res.data.data as TimetableResponse;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useMyAttendanceSummary() {
  return useQuery<AttendanceSummary>({
    queryKey: ['student', 'me', 'attendance', 'summary'],
    queryFn: async () => {
      const res = await api.get('/students/me/attendance/summary');
      return res.data.data as AttendanceSummary;
    },
  });
}

export function useMyAttendanceHistory(page = 1) {
  return useQuery<{ data: AttendanceHistoryItem[]; meta: { page: number; limit: number; total: number } }>({
    queryKey: ['student', 'me', 'attendance', 'history', page],
    queryFn: async () => {
      const res = await api.get('/students/me/attendance/history', {
        params: { page, limit: 31 },
      });
      return res.data.data as { data: AttendanceHistoryItem[]; meta: { page: number; limit: number; total: number } };
    },
  });
}

export function useAttendanceHistory({
  fromDate,
  toDate,
  page = 1,
  limit = 32,
}: {
  fromDate: string;
  toDate: string;
  page?: number;
  limit?: number;
}) {
  return useQuery<{ data: AttendanceHistoryItem[]; meta: { page: number; limit: number; total: number } }>({
    queryKey: ['student', 'me', 'attendance', 'history', fromDate, toDate, page],
    queryFn: async () => {
      const res = await api.get('/students/me/attendance/history', {
        params: { fromDate, toDate, page, limit },
      });
      return res.data.data as { data: AttendanceHistoryItem[]; meta: { page: number; limit: number; total: number } };
    },
    enabled: !!fromDate && !!toDate,
  });
}

// ─── Results / report-card (SESSION-M6.1, live) ───────────────────────────────
//
// Wired to GET /students/me/report-card (self-scoped — studentId resolved
// server-side from token.userId; no client id, server enforces 403 for any other
// student). Verified shape (R2 demo, 2026-06): the ResponseInterceptor wraps as
// { success, data, meta }, so the payload is at `res.data.data`:
//
//   data = { student, examResults[], annualResult }
//   student      : { fullName, className, sectionName, rollNumber, admissionNumber, … }
//   examResults  : [{ examType:{name,orderIndex}, gpa, grade, rankInSection, subjects[] }]
//   subjects     : [{ subjectName, theoryMarks, practicalMarks, marksObtained, grade }]
//   annualResult : { finalGpa, finalGrade, … } — both null until year-end, → null here.
//
// Live field names differ from the `StudentResults` contract, so mapReportCard()
// reconciles them (no screen change). examResults are sorted by examType.orderIndex
// so the term selector reads chronologically and "default to most recent" holds.

interface LiveReportCard {
  student: {
    id: string;
    admissionNumber: string;
    fullName: string;
    rollNumber: number | null;
    className: string;
    sectionName: string;
    academicYear: string;
  };
  examResults: {
    examType: { id: string; name: string; weightPercent: number; orderIndex: number };
    percentage: number;
    grade: string | null;
    gpa: number | null;
    rankInSection: number | null;
    rankInClass: number | null;
    isPassed: boolean;
    status: string;
    subjects: {
      subjectId: string;
      subjectName: string;
      fullMarks: number;
      marksObtained: number | null;
      theoryMarks: number | null;
      practicalMarks: number | null;
      percentage: number | null;
      grade: string | null;
      isPassed: boolean;
      isAbsent: boolean;
    }[];
  }[];
  annualResult: {
    weightedPercentage: number;
    finalGrade: string | null;
    finalGpa: number | null;
    division: string;
    isPassed: boolean;
  } | null;
}

function mapReportCard(rc: LiveReportCard): StudentResults {
  const examResults = [...(rc.examResults ?? [])]
    .sort((a, b) => a.examType.orderIndex - b.examType.orderIndex)
    .map((er) => ({
      examName: er.examType.name,
      gpa: er.gpa ?? 0,
      grade: er.grade ?? '—',
      rank: er.rankInSection ?? er.rankInClass ?? 0,
      subjects: (er.subjects ?? []).map((s) => ({
        name: s.subjectName,
        theory: s.theoryMarks,
        practical: s.practicalMarks,
        total: s.marksObtained ?? 0,
        grade: s.grade ?? '—',
      })),
    }));

  // Annual is only meaningful once the school closes the year (finalGpa/finalGrade
  // populated); the live endpoint returns both null otherwise → treat as absent.
  const annual = rc.annualResult;
  const annualResult =
    annual && (annual.finalGpa !== null || annual.finalGrade !== null)
      ? { gpa: annual.finalGpa ?? 0, grade: annual.finalGrade ?? '—' }
      : null;

  return {
    student: {
      name: rc.student.fullName,
      grade: rc.student.className,
      section: rc.student.sectionName,
      roll: rc.student.rollNumber ?? 0,
      admissionNo: rc.student.admissionNumber,
    },
    examResults,
    annualResult,
  };
}

/**
 * Student's own results / report card (self-scoped). Loading / error / empty
 * (examResults: []) states are all driven straight off this query.
 */
export function useMyResults() {
  return useQuery<StudentResults>({
    queryKey: ['student', 'me', 'results'],
    queryFn: async () => {
      const res = await api.get('/students/me/report-card');
      return mapReportCard(res.data.data as LiveReportCard);
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useNotices() {
  return useQuery<NoticeItem[]>({
    queryKey: ['notices'],
    queryFn: async () => {
      const res = await api.get('/communication/notices', {
        params: { page: 1, limit: 20 },
      });
      // Paginated list → .data.data.data
      const payload = res.data.data;
      return (Array.isArray(payload) ? payload : payload?.data ?? []) as NoticeItem[];
    },
    staleTime: 2 * 60 * 1000,
  });
}
