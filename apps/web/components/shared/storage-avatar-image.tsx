'use client';

import { AvatarImage } from '@/components/ui/avatar';
import { useFileUrl } from '@/lib/hooks/use-file-url';

/**
 * AvatarImage that understands FILE-1 storage keys: keys resolve to a scoped
 * presigned GET; legacy data-URIs / URLs render as-is. Being a component (not
 * a bare hook call) it is safe inside DataTable cell renderers.
 */
export function StorageAvatarImage({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const src = useFileUrl(value);
  return <AvatarImage src={src} className={className} />;
}
