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

  // MAIL-1: password reset + change
  forgotPassword: (data: { email: string }) =>
    api.post<ApiResponse<{ message: string }>>('/auth/forgot-password', data),

  resetPassword: (data: { token: string; newPassword: string }) =>
    api.post<ApiResponse<{ reset: boolean }>>('/auth/reset-password', data),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post<ApiResponse<{ changed: boolean }>>('/auth/change-password', data),
};
