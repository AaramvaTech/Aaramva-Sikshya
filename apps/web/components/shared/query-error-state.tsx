'use client';

import { CloudOff, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * POL-1 T7 — shared error state for failed GETs. Module pages early-return this
 * (after the loading check) instead of silently rendering an empty list:
 *
 *   const { data, isLoading, isError, refetch } = useStudents(...);
 *   if (isError) return <QueryErrorState onRetry={() => refetch()} />;
 */
export function QueryErrorState({
  onRetry,
  message = "Couldn't load this page's data. The server may be unreachable.",
}: {
  onRetry?: () => void;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" role="alert">
      <CloudOff className="h-12 w-12 text-gray-300 mb-4" strokeWidth={1.5} />
      <p className="text-sm font-medium text-black dark:text-white mb-1">Something went wrong</p>
      <p className="text-sm text-gray-500 max-w-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCw className="h-3.5 w-3.5 mr-1.5" /> Try again
        </Button>
      )}
    </div>
  );
}
