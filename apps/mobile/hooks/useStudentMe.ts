import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import type {
  StudentProfile,
  TimetableResponse,
  AttendanceSummary,
  AttendanceHistoryItem,
  NoticeItem,
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
