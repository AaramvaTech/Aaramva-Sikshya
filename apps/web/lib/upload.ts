import axios from 'axios';
import { filesApi, type FileKind } from '@/lib/api/files.api';

/**
 * FILE-1 upload flow: presign → PUT the raw bytes straight to storage → hand
 * the returned key to the feature endpoint (photoFileKey / fileKey / …).
 *
 * When the server has storage disabled (presign 503s), falls back to the
 * legacy base64 data-URI so every upload UI keeps working through cutover.
 */
export type UploadResult =
  | { mode: 'key'; key: string; publicUrl?: string }
  | { mode: 'legacy'; dataUrl: string };

export function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function uploadFile(
  file: File,
  kind: FileKind,
  opts?: { tenantSlug?: string },
): Promise<UploadResult> {
  let presign;
  try {
    presign = await filesApi.presignUpload(
      { kind, filename: file.name, contentType: file.type, size: file.size },
      opts?.tenantSlug,
    );
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 503) {
      return { mode: 'legacy', dataUrl: await readAsDataURL(file) };
    }
    throw err;
  }

  // Plain axios on purpose: the presigned URL must NOT get our Authorization /
  // X-Tenant-Slug headers (they would break the signature).
  await axios.put(presign.uploadUrl, file, { headers: presign.headers });

  return { mode: 'key', key: presign.key, publicUrl: presign.publicUrl };
}
