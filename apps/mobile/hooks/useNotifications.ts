import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { NotificationItem } from '../types';

/**
 * In-app notification inbox hooks (PUSH-1). All keys share the 'notifications'
 * prefix so a received push can invalidate everything with one call
 * (see PushBootstrap).
 */

export function useUnreadCount() {
  return useQuery<number>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const res = await api.get('/communication/notifications/unread-count');
      // Simple value → .data.data
      return (res.data.data ?? 0) as number;
    },
    staleTime: 15_000,
  });
}

export function useNotificationInbox() {
  return useQuery<NotificationItem[]>({
    queryKey: ['notifications', 'list'],
    queryFn: async () => {
      const res = await api.get('/communication/notifications', {
        params: { page: 1, limit: 50 },
      });
      // Paginated list → .data.data.data
      const payload = res.data.data;
      return (Array.isArray(payload) ? payload : payload?.data ?? []) as NotificationItem[];
    },
    staleTime: 15_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await api.patch(`/communication/notifications/${notificationId}/read`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.patch('/communication/notifications/read-all');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
