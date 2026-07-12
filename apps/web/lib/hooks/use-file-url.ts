import { useQuery } from '@tanstack/react-query';
import { filesApi } from '@/lib/api/files.api';

const STORAGE_KEY_RE =
  /^tenant_[a-z0-9-]+\/[a-z-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/;

/** True when a stored value is a FILE-1 storage key (vs data-URI / http URL). */
export function isStorageKey(value: string | null | undefined): value is string {
  return !!value && STORAGE_KEY_RE.test(value);
}

/**
 * Renderable src for a stored file value: legacy data-URIs and absolute URLs
 * pass through; FILE-1 storage keys resolve via the scoped presigned-GET
 * endpoint. Undefined while resolving (Avatar fallbacks cover that).
 */
export function useFileUrl(value: string | null | undefined): string | undefined {
  const key = isStorageKey(value) ? value : null;
  const { data } = useQuery({
    queryKey: ['file-url', key],
    queryFn: () => filesApi.presignRead(key!),
    enabled: !!key,
    staleTime: 4 * 60 * 1000, // presigned GETs live 5 min — refresh just before
    retry: 1,
  });
  if (!value) return undefined;
  return key ? data?.url : value;
}
