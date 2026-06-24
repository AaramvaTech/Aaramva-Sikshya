import api from '@/lib/api';
import type { ApiResponse, OnboardingStatus } from '@/types/api.types';

export const onboardingApi = {
  getStatus: () => api.get<ApiResponse<OnboardingStatus>>('/onboarding/status'),
  complete: () => api.post<ApiResponse<OnboardingStatus>>('/onboarding/complete'),
};
