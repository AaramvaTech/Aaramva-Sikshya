import api from '@/lib/api';
import type { ApiResponse, PaginatedResponse, ClassWithSections } from '@/types/api.types';

export const classesApi = {
  list: () => api.get<ApiResponse<PaginatedResponse<ClassWithSections>>>('/classes'),
};
