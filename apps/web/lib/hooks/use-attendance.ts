import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attendanceApi } from '@/lib/api/attendance.api';
import { useTenantStore } from '@/store/tenant.store';
import type { BulkAttendanceData, ReviewLeaveData } from '@/types/api.types';

export function useSectionAttendance(
  sectionId: string,
  date: string,
  academicYearId?: string,
) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['attendance', 'section', sectionId, date, academicYearId],
    queryFn: () =>
      attendanceApi
        .getSectionAttendance({ sectionId, date, academicYearId })
        // /attendance/students is paginated → array lives at .data.data.data
        .then((r) => r.data.data.data),
    enabled: !!slug && !!sectionId && !!date,
  });
}

export function useBulkMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: BulkAttendanceData) => attendanceApi.bulkMark(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['attendance', 'section', variables.sectionId],
      });
      queryClient.invalidateQueries({ queryKey: ['attendance', 'school-summary'] });
    },
  });
}

export function useSchoolAttendanceSummary() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['attendance', 'school-summary'],
    queryFn: () => attendanceApi.getSchoolSummary().then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useStudentAttendanceSummary(
  studentId: string,
  academicYearId?: string,
) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['attendance', 'student', studentId, academicYearId],
    queryFn: () =>
      attendanceApi
        .getStudentSummary(studentId, academicYearId)
        .then((r) => r.data.data),
    // academicYearId is required by the API — don't fire until we have it
    enabled: !!slug && !!studentId && !!academicYearId,
  });
}

// WEB-P Phase 2 Task 1 — teacher's own staff-attendance summary for a given
// AD year/month (backend requires both, no default — caller passes the
// current AD month for "this month").
export function useMyStaffAttendanceSummary(year: number, month: number) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['attendance', 'staff-my-summary', year, month],
    queryFn: () =>
      attendanceApi.getMyStaffSummary({ year, month }).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useSectionAttendanceReport(
  sectionId: string | null,
  params: { fromDate: string; toDate: string; academicYearId?: string } | null,
) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['attendance', 'report', sectionId, params],
    queryFn: () =>
      attendanceApi.getSectionReport(sectionId!, params!).then((r) => r.data.data),
    enabled: !!slug && !!sectionId && !!params,
  });
}

// ── Student leave requests (review loop) ────────────────────────────────────

export function useLeaveRequests(params: { status?: string; page?: number; limit?: number }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['attendance', 'leave-requests', params],
    // /attendance/leave is paginated → { data: [], meta: {} } at .data.data
    queryFn: () => attendanceApi.listLeaveRequests(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useReviewLeaveRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReviewLeaveData }) =>
      attendanceApi.reviewLeave(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance', 'leave-requests'] });
      // an approval writes LEAVE rows → refresh attendance summaries too
      queryClient.invalidateQueries({ queryKey: ['attendance', 'school-summary'] });
    },
  });
}
