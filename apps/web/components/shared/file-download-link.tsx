'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { filesApi } from '@/lib/api/files.api';
import { isStorageKey } from '@/lib/hooks/use-file-url';

/**
 * Download/open link that understands FILE-1 storage keys: keys are resolved
 * to a scoped presigned GET on click (short-lived URLs must not be minted at
 * render time); legacy data-URIs / absolute URLs keep the plain <a> behavior.
 */
export function FileDownloadLink({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [resolving, setResolving] = useState(false);

  if (!isStorageKey(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }

  async function open() {
    setResolving(true);
    try {
      const { url } = await filesApi.presignRead(value);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not open the file');
    } finally {
      setResolving(false);
    }
  }

  return (
    <button type="button" onClick={open} disabled={resolving} className={className}>
      {children}
    </button>
  );
}
