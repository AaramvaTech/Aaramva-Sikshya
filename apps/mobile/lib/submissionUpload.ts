import * as DocumentPicker from 'expo-document-picker';
// SDK 56's default expo-file-system is the new File/Paths API. uploadAsync —
// which we need for a raw presigned PUT with exact signed headers and a status
// code to branch on — ships in the legacy subpath (same pattern as
// useReportCardDownload).
import * as FileSystem from 'expo-file-system/legacy';
import api from './api';

/**
 * EDU-2: the app's FIRST upload path (student submission file).
 *
 * Flow (mirrors the FILE-1 server contract):
 *   pick → validate client-side → POST /assignments/:id/submissions/presign-upload
 *   (the SCOPED presign — the generic /files route 403s students by design)
 *   → PUT the raw bytes to storage with the signed headers → hand the key to
 *   the submissions endpoint (the caller does the confirm POST).
 */

/** Mirror of the api's submission-file kind policy (storage.policy.ts). */
export const SUBMISSION_MAX_BYTES = 10 * 1024 * 1024;
export const SUBMISSION_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

/**
 * Client-side pre-check so a bad pick fails instantly with a friendly message
 * instead of a server 400 after a wasted round-trip. Returns null when OK.
 * Exported for unit tests.
 */
export function validatePickedFile(file: {
  size?: number | null;
  mimeType?: string | null;
}): string | null {
  if (!file.mimeType || !SUBMISSION_MIME_TYPES.includes(file.mimeType)) {
    return 'That file type is not accepted — use an image, PDF or Word document.';
  }
  if (!file.size || file.size <= 0) {
    return 'Could not read the file size — try picking the file again.';
  }
  if (file.size > SUBMISSION_MAX_BYTES) {
    return 'The file is larger than 10 MB — choose a smaller file.';
  }
  return null;
}

/** Opens the system picker. Returns null when the user cancels. Throws with a
 *  user-friendly message when the picked file fails validation. */
export async function pickSubmissionFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: SUBMISSION_MIME_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const problem = validatePickedFile({ size: asset.size, mimeType: asset.mimeType });
  if (problem) throw new Error(problem);

  return {
    uri: asset.uri,
    name: asset.name,
    size: asset.size!,
    mimeType: asset.mimeType!,
  };
}

interface PresignResponse {
  key: string;
  uploadUrl: string;
  expiresIn: number;
  headers: Record<string, string>;
}

/**
 * presign → PUT. Returns the storage key to confirm with. Throws with a
 * user-friendly message on any failure (nothing is persisted server-side
 * until the caller confirms the key — an abandoned PUT is just a future
 * prune-orphans row).
 */
export async function uploadSubmissionFile(
  assignmentId: string,
  file: PickedFile,
): Promise<string> {
  const presignRes = await api.post(
    `/assignments/${assignmentId}/submissions/presign-upload`,
    { filename: file.name, contentType: file.mimeType, size: file.size },
  );
  const presign = presignRes.data.data as PresignResponse;

  // Raw PUT straight to storage — NO auth/tenant headers (they would break
  // the signature); only what the presign told us to send.
  const putRes = await FileSystem.uploadAsync(presign.uploadUrl, file.uri, {
    httpMethod: 'PUT',
    headers: presign.headers,
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });
  if (putRes.status !== 200) {
    throw new Error(`The file upload was rejected by storage (HTTP ${putRes.status}) — try again.`);
  }

  return presign.key;
}
