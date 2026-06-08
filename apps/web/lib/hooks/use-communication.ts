import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { communicationApi } from '@/lib/api/communication.api';
import { useTenantStore } from '@/store/tenant.store';
import type { CreateNoticeData } from '@/types/api.types';

export function useNotices(params?: { page?: number; limit?: number; type?: string; audience?: string }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['communication', 'notices', params],
    queryFn: () => communicationApi.listNotices(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useCreateNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateNoticeData) => communicationApi.createNotice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communication', 'notices'] });
    },
  });
}

export function usePublishNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communicationApi.publishNotice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communication', 'notices'] });
    },
  });
}

export function useDeleteNotice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communicationApi.deleteNotice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['communication', 'notices'] });
    },
  });
}

export function useSendSms() {
  return useMutation({
    mutationFn: (data: { toNumber: string; message: string; studentId?: string }) =>
      communicationApi.sendSms(data),
  });
}

export function useBulkSms() {
  return useMutation({
    mutationFn: (data: { audience: string; classId?: string; sectionId?: string; message: string }) =>
      communicationApi.bulkSms(data),
  });
}

export function useSmsLogs(params?: { page?: number; limit?: number; status?: string }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['communication', 'sms-logs', params],
    queryFn: () => communicationApi.getSmsLogs(params).then((r) => r.data.data),
    enabled: !!slug,
  });
}

export function useMyNotifications(params?: { page?: number; limit?: number }) {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['communication', 'notifications', params],
    queryFn: () =>
      communicationApi
        .getMyNotifications(params)
        .then((r) => r.data.data)
        .catch(() => ({ data: [] as import('@/types/api.types').AppNotification[], meta: { total: 0, page: 1, limit: 10 } })),
    enabled: !!slug,
  });
}

export function useUnreadCount() {
  const slug = useTenantStore((s) => s.slug);
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => communicationApi.getUnreadCount()
      .then((r) => r.data?.data?.count ?? 0)
      .catch(() => 0),
    enabled: !!slug,
    refetchInterval: 60 * 1000,
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => communicationApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['communication', 'notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => communicationApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['communication', 'notifications'] });
    },
  });
}
