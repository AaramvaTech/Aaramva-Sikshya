import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

const STORAGE_KEY_RE =
  /^tenant_[a-z0-9-]+\/[a-z-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/;

/** True when a stored value is a FILE-1 storage key (vs data-URI / http URL). */
export function isStorageKey(value: string | null | undefined): value is string {
  return !!value && STORAGE_KEY_RE.test(value);
}

/**
 * FILE-1 read flow: photo values that are storage keys resolve to a scoped,
 * short-lived presigned GET via the api; legacy data-URIs and absolute URLs
 * pass through unchanged. Returns null while a key is still resolving so the
 * initials-avatar fallbacks render meanwhile.
 */
export function useFileUrl(value: string | null | undefined): string | null {
  const key = isStorageKey(value) ? value : null;
  const { data } = useQuery({
    queryKey: ['file-url', key],
    queryFn: async () => {
      const res = await api.get('/files/presigned', { params: { key } });
      return res.data.data as { url: string; expiresIn: number };
    },
    enabled: !!key,
    staleTime: 4 * 60 * 1000, // presigned GETs live 5 min — refresh just before
    retry: 1,
  });
  if (!value) return null;
  return key ? (data?.url ?? null) : value;
}
