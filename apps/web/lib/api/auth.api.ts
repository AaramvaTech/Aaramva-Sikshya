import api from '@/lib/api';
import type { ApiResponse, LoginDto, LoginResponse, MeResponse } from '@/types/api.types';

export const authApi = {
  login: (data: LoginDto) =>
    api.post<ApiResponse<LoginResponse>>('/auth/login', data),

  logout: () =>
    api.post<ApiResponse<{ loggedOut: boolean }>>('/auth/logout'),

  me: () =>
    api.get<ApiResponse<MeResponse>>('/auth/me'),

  refresh: () =>
    api.post<ApiResponse<{ accessToken: string }>>('/auth/refresh'),
};
