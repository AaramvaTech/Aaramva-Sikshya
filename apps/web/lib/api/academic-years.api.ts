import api from '@/lib/api';
import type { ApiResponse, PaginatedResponse, AcademicYear } from '@/types/api.types';

export interface CreateAcademicYearData {
  name: string;
  yearBs: number;
  startDate: string; // AD "YYYY-MM-DD"
  endDate: string;   // AD "YYYY-MM-DD"
  isCurrent?: boolean;
}

export const academicYearsApi = {
  getCurrent: () => api.get<ApiResponse<AcademicYear>>('/academic-years/current'),
  list: () => api.get<ApiResponse<PaginatedResponse<AcademicYear>>>('/academic-years'),
  create: (data: CreateAcademicYearData) =>
    api.post<ApiResponse<AcademicYear>>('/academic-years', data),
  setCurrent: (id: string) =>
    api.patch<ApiResponse<AcademicYear>>(`/academic-years/${id}/set-current`),
};
