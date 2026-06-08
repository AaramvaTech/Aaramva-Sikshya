import api from '@/lib/api';
import type {
  ApiResponse,
  PaginatedResponse,
  Notice,
  SmsLog,
  AppNotification,
  CreateNoticeData,
} from '@/types/api.types';

export const communicationApi = {
  listNotices: (params?: { page?: number; limit?: number; type?: string; audience?: string }) =>
    api.get<ApiResponse<PaginatedResponse<Notice>>>('/communication/notices', { params }),
  createNotice: (data: CreateNoticeData) =>
    api.post<ApiResponse<Notice>>('/communication/notices', data),
  publishNotice: (id: string) =>
    api.patch<ApiResponse<Notice>>(`/communication/notices/${id}/publish`, {}),
  deleteNotice: (id: string) => api.delete(`/communication/notices/${id}`),

  sendSms: (data: { toNumber: string; message: string; studentId?: string }) =>
    api.post<ApiResponse<{ sent: boolean }>>('/communication/sms/send', data),
  getSmsLogs: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get<ApiResponse<PaginatedResponse<SmsLog>>>('/communication/sms/logs', { params }),
  bulkSms: (data: { audience: string; classId?: string; sectionId?: string; message: string }) =>
    api.post<ApiResponse<{ sent: number; failed: number; skipped: number }>>('/communication/sms/bulk', data),

  getMyNotifications: (params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<AppNotification>>>('/communication/notifications', { params }),
  getUnreadCount: () =>
    api.get<ApiResponse<{ count: number }>>('/communication/notifications/unread-count'),
  markAsRead: (id: string) =>
    api.patch(`/communication/notifications/${id}/read`, {}),
  markAllAsRead: () =>
    api.patch('/communication/notifications/read-all', {}),
};
