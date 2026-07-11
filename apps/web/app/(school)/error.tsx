'use client';

import { useEffect } from 'react';
import { QueryErrorState } from '@/components/shared/query-error-state';

/**
 * POL-1 T7 — route-level error boundary for the whole school portal segment.
 * Catches render-time throws (the query-level failures are handled per page by
 * QueryErrorState). Next 16: `unstable_retry` re-fetches and re-renders the
 * segment; `reset` only clears the boundary — prefer the former when present.
 */
export default function SchoolError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error('[school-portal]', error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <QueryErrorState
        message="This page hit an unexpected error. Try again — if it keeps happening, sign out and back in."
        onRetry={() => (unstable_retry ?? reset)?.()}
      />
    </div>
  );
}
