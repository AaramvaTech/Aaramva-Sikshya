'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { QueryErrorState } from '@/components/shared/query-error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { BsDate } from '@/components/shared/bs-date';
import { Button } from '@/components/ui/button';
import { useNotices } from '@/lib/hooks/use-communication';

const LIMIT = 10;

export default function ParentNoticesPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useNotices({ page, limit: LIMIT });
  const notices = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-5">
      <PageHeader title="Notices" description="School announcements" />
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : isError ? (
        <QueryErrorState onRetry={() => refetch()} />
      ) : notices.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500">
          No notices yet.
        </div>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <div key={n.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-white">{n.title}</h3>
                <span className="text-xs text-gray-400"><BsDate date={n.publishedAt ?? n.createdAt} /></span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}
        </div>
      )}
      {meta && meta.total > LIMIT && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-xs text-gray-400">Page {page} of {Math.ceil(meta.total / LIMIT)}</span>
          <Button variant="outline" size="sm" disabled={page * LIMIT >= meta.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
