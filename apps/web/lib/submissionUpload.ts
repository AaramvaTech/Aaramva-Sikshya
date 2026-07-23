import axios from 'axios';
import { assignmentsApi } from '@/lib/api/assignments.api';
import type { PresignUploadResponse } from '@/lib/api/files.api';

// WEB-P Phase 4 — mirrors apps/mobile/lib/submissionUpload.ts's presign →
// raw PUT → confirm flow (EDU-2), rebuilt for a browser File instead of
// Expo's document picker. Deliberately does NOT use lib/upload.ts's
// uploadFile() helper: that calls the GENERIC POST /files/presign-upload,
// which the backend explicitly REJECTS for the submission-file kind
// (scopedOnly:true — see storage.policy.ts) regardless of role. The only
// legal presign path for a submission is the assignment-scoped one below.
const MAX_SUBMISSION_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export function validateSubmissionFile(file: File): string | null {
  if (file.size > MAX_SUBMISSION_BYTES) return 'File is too large — max 10 MB.';
  if (!ALLOWED_TYPES.includes(file.type)) return 'Unsupported file type — use an image, PDF, or Word document.';
  return null;
}

export async function uploadSubmissionFile(assignmentId: string, file: File): Promise<string> {
  const presign = (
    await assignmentsApi.presignSubmissionUpload(assignmentId, {
      filename: file.name,
      contentType: file.type,
      size: file.size,
    })
  ).data.data as PresignUploadResponse;

  // Plain axios on purpose — same reason as lib/upload.ts: the presigned
  // URL must not carry our Authorization / X-Tenant-Slug headers.
  await axios.put(presign.uploadUrl, file, { headers: presign.headers });

  return presign.key;
}
