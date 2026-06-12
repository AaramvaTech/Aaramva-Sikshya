'use client';

import { useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyNotifications, useMarkAsRead, useMarkAllRead } from '@/lib/hooks/use-communication';
import type { AppNotification } from '@/types/api.types';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const TYPE_STYLES: Record<string, string> = {
  ATTENDANCE: 'bg-blue-100 text-blue-700',
  PAYMENT: 'bg-green-100 text-green-700',
  INVOICE: 'bg-orange-100 text-orange-700',
  NOTICE: 'bg-purple-100 text-purple-700',
};

function NotificationItem({ notif, onRead }: { notif: AppNotification; onRead: (id: string) => void }) {
  return (
    <div
      className={`flex gap-4 p-4 border-b border-gray-100 dark:border-gray-800 transition-colors hover:bg-gray-50 dark:hover:bg-white/5 cursor-default ${
        notif.isRead ? '' : 'bg-brand-25 dark:bg-brand-500/[0.05]'
      }`}
    >
      <div className="flex-shrink-0 mt-0.5">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${notif.isRead ? 'bg-gray-100 dark:bg-gray-800' : 'bg-brand-100 dark:bg-brand-500/20'}`}>
          <Bell className={`h-4 w-4 ${notif.isRead ? 'text-gray-400' : 'text-brand-500'}`} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-sm font-medium leading-snug ${notif.isRead ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
              {notif.title}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
              {notif.body}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {notif.type && (
              <Badge className={`text-xs border-0 capitalize ${TYPE_STYLES[notif.type] ?? 'bg-gray-100 text-gray-600'}`}>
                {notif.type.toLowerCase()}
              </Badge>
            )}
            {!notif.isRead && (
              <button
                onClick={() => onRead(notif.id)}
                className="text-xs text-brand-500 hover:text-brand-600 dark:text-brand-400 whitespace-nowrap"
              >
                Mark read
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1">{timeAgo(notif.createdAt)}</p>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: response, isLoading } = useMyNotifications({ page, limit });
  const markAsRead = useMarkAsRead();
  const markAllRead = useMarkAllRead();

  const notifications: AppNotification[] = response?.data ?? [];
  const meta = response?.meta;
  const hasUnread = notifications.some((n) => !n.isRead);
  const totalPages = meta ? Math.ceil(meta.total / limit) : 1;

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Your recent alerts and updates"
        action={
          hasUnread ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4 p-4">
                <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">No notifications</p>
            <p className="text-xs text-gray-400 mt-1">You&apos;re all caught up.</p>
          </div>
        ) : (
          <div>
            {notifications.map((notif) => (
              <NotificationItem
                key={notif.id}
                notif={notif}
                onRead={(id) => markAsRead.mutate(id)}
              />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-500">
              {meta ? `${(page - 1) * limit + 1}–${Math.min(page * limit, meta.total)} of ${meta.total}` : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
