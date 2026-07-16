import { QueryClient } from '@tanstack/react-query';
import { getErrorDisplay } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ERR-1 §1.4: retry only transient failures (network / 5xx). getErrorDisplay
      // is the single classifier — a 4xx (validation / forbidden / not-found)
      // never retries. Query errors surface via the inline <ErrorState> (already
      // cloud-offline styled) on isError; mobile has no global toast.
      retry: (failureCount, error) => failureCount < 1 && getErrorDisplay(error).retryable,
      staleTime: 30_000,
    },
  },
});
