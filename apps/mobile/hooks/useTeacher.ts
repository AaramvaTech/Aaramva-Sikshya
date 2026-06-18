import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type {
  StaffProfile,
  TeacherTimetable,
  MySection,
  StudentProfile,
  SectionAttendanceRecord,
  StaffAttendanceSummary,
  StaffAttendanceRecord,
  LeaveRequest,
  LeaveType,
  ExamSchedule,
  ExamMark,
  BulkMarkEntry,
} from '../types';

// ─── Staff profile ─────────────────────────────────────────────────────────────

export function useMyStaffProfile() {
  return useQuery<StaffProfile>({
    queryKey: ['teacher', 'staff-profile'],
    queryFn: async () => {
      const res = await api.get('/hr/staff/me');
      return res.data.data as StaffProfile;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Timetable ─────────────────────────────────────────────────────────────────

export function useMyTimetable() {
  return useQuery<TeacherTimetable>({
    queryKey: ['teacher', 'timetable'],
    queryFn: async () => {
      const res = await api.get('/timetable/my');
      return res.data.data as TeacherTimetable;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Sections ──────────────────────────────────────────────────────────────────

export function useMySections() {
  return useQuery<MySection[]>({
    queryKey: ['teacher', 'sections'],
    queryFn: async () => {
      const res = await api.get('/timetable/my/sections');
      return res.data.data as MySection[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Students in a section ─────────────────────────────────────────────────────

export function useSectionStudents(sectionId: string | null | undefined) {
  return useQuery<StudentProfile[]>({
    queryKey: ['teacher', 'section', sectionId, 'students'],
    queryFn: async () => {
      const res = await api.get('/students', { params: { sectionId, limit: 200 } });
      // paginated list → .data.data.data
      const raw = res.data.data;
      return (Array.isArray(raw) ? raw : (raw.data ?? [])) as StudentProfile[];
    },
    enabled: !!sectionId,
    staleTime: 2 * 60 * 1000,
  });
}

// ─── Existing attendance for section + date ────────────────────────────────────

export function useSectionAttendance(
  sectionId: string | null | undefined,
  date: string | null | undefined,
) {
  return useQuery<SectionAttendanceRecord[]>({
    queryKey: ['teacher', 'section', sectionId, 'attendance', date],
    queryFn: async () => {
      const res = await api.get('/attendance/students', {
        params: { sectionId, date, limit: 200 },
      });
      const raw = res.data.data;
      return (Array.isArray(raw) ? raw : (raw.data ?? [])) as SectionAttendanceRecord[];
    },
    enabled: !!sectionId && !!date,
  });
}

// ─── Staff attendance summary ──────────────────────────────────────────────────

export function useMyStaffSummary(year: number, month: number) {
  return useQuery<StaffAttendanceSummary>({
    queryKey: ['teacher', 'staff-summary', year, month],
    queryFn: async () => {
      const res = await api.get('/attendance/staff/my/summary', { params: { year, month } });
      return res.data.data as StaffAttendanceSummary;
    },
    enabled: !!year && !!month,
  });
}

// ─── Staff attendance history ──────────────────────────────────────────────────

export function useMyStaffAttendance({
  fromDate,
  toDate,
  limit = 35,
}: {
  fromDate: string;
  toDate: string;
  limit?: number;
}) {
  return useQuery<StaffAttendanceRecord[]>({
    queryKey: ['teacher', 'staff-attendance', fromDate, toDate],
    queryFn: async () => {
      const res = await api.get('/attendance/staff/my', { params: { fromDate, toDate, limit } });
      const raw = res.data.data;
      return (Array.isArray(raw) ? raw : (raw.data ?? [])) as StaffAttendanceRecord[];
    },
    enabled: !!fromDate && !!toDate,
  });
}

// ─── Leave requests ────────────────────────────────────────────────────────────

export function useMyLeaveRequests() {
  return useQuery<{ data: LeaveRequest[]; meta: { page: number; limit: number; total: number } }>({
    queryKey: ['teacher', 'leave', 'my'],
    queryFn: async () => {
      const res = await api.get('/hr/leave/my');
      return res.data.data as { data: LeaveRequest[]; meta: { page: number; limit: number; total: number } };
    },
  });
}

// ─── Leave types ───────────────────────────────────────────────────────────────

export function useLeaveTypes() {
  return useQuery<LeaveType[]>({
    queryKey: ['teacher', 'leave-types'],
    queryFn: async () => {
      const res = await api.get('/hr/leave-types');
      return res.data.data as LeaveType[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Mutations ─────────────────────────────────────────────────────────────────

export function useBulkMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      sectionId: string;
      academicYearId: string;
      date: string;
      records: { studentId: string; status: string }[];
    }) => {
      const res = await api.post('/attendance/students/bulk', payload);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['teacher', 'section', variables.sectionId, 'attendance', variables.date],
      });
    },
  });
}

// ─── Exam schedules ────────────────────────────────────────────────────────────

export function useMyExamSchedules() {
  return useQuery<ExamSchedule[]>({
    queryKey: ['teacher', 'exam-schedules'],
    queryFn: async () => {
      const res = await api.get('/exams/schedules/my');
      const raw = res.data.data;
      return (Array.isArray(raw) ? raw : (raw.data ?? [])) as ExamSchedule[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Existing marks for a schedule ────────────────────────────────────────────

export function useExamMarks(examScheduleId: string | null | undefined) {
  return useQuery<ExamMark[]>({
    queryKey: ['teacher', 'exam-marks', examScheduleId],
    queryFn: async () => {
      const res = await api.get('/exams/marks', { params: { examScheduleId } });
      const raw = res.data.data;
      return (Array.isArray(raw) ? raw : (raw.data ?? [])) as ExamMark[];
    },
    enabled: !!examScheduleId,
  });
}

// ─── Bulk marks submission ─────────────────────────────────────────────────────

export function useBulkSubmitMarks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      examScheduleId: string;
      marks: BulkMarkEntry[];
    }) => {
      const res = await api.post('/exams/marks/bulk', payload);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: ['teacher', 'exam-marks', variables.examScheduleId],
      });
    },
  });
}

export function useApplyLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      leaveTypeId: string;
      fromDate: string;
      toDate: string;
      reason?: string;
    }) => {
      const res = await api.post('/hr/leave', payload);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['teacher', 'leave'] });
    },
  });
}
