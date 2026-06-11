import api from '@/lib/api';
import type { ApiResponse, SchoolProfile, UpdateProfileData } from '@/types/api.types';

export const settingsApi = {
  getProfile: () => api.get<ApiResponse<SchoolProfile>>('/settings/profile'),
  updateProfile: (data: UpdateProfileData) =>
    api.patch<ApiResponse<SchoolProfile>>('/settings/profile', data),
};
