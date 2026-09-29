import axios from 'axios';
import { filesApi, type FileKind } from '@/lib/api/files.api';

/**
 * FILE-1 upload flow: presign → PUT the raw bytes straight to storage → hand
 * the returned key to the feature endpoint (photoFileKey / fileKey / …).
 *
 * FILE-1-BLOB: no base64 fallback — the server refuses inline `data:` values.
 * A presign failure (e.g. 503 storage unavailable) is rethrown as-is so the
 * UI can show the server's message.
 */
export interface UploadResult {
  key: string;
  publicUrl?: string;
}

export async function uploadFile(
  file: File,
  kind: FileKind,
  opts?: { tenantSlug?: string },
): Promise<UploadResult> {
  const presign = await filesApi.presignUpload(
    { kind, filename: file.name, contentType: file.type, size: file.size },
    opts?.tenantSlug,
  );

  // Plain axios on purpose: the presigned URL must NOT get our Authorization /
  // X-Tenant-Slug headers (they would break the signature).
  await axios.put(presign.uploadUrl, file, { headers: presign.headers });

  return { key: presign.key, publicUrl: presign.publicUrl };
}
