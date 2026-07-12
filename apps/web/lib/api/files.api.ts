import api from '@/lib/api';

/** Mirror of the api's FILE-1 kind-policy table keys. */
export type FileKind =
  | 'student-photo'
  | 'staff-photo'
  | 'school-logo'
  | 'principal-signature'
  | 'school-stamp'
  | 'staff-document';

export interface PresignUploadResponse {
  key: string;
  uploadUrl: string;
  expiresIn: number;
  headers: Record<string, string>;
  /** only for public-read kinds (school-logo) */
  publicUrl?: string;
}

export const filesApi = {
  /** tenantSlug override is for the super-admin logo flow — /files routes are
   *  tenant-scoped, so a platform admin must name the target school. */
  presignUpload: (
    body: { kind: FileKind; filename: string; contentType: string; size: number },
    tenantSlug?: string,
  ) =>
    api
      .post('/files/presign-upload', body, tenantSlug ? { headers: { 'X-Tenant-Slug': tenantSlug } } : undefined)
      .then((r) => r.data.data as PresignUploadResponse),

  presignRead: (key: string) =>
    api
      .get('/files/presigned', { params: { key } })
      .then((r) => r.data.data as { url: string; expiresIn: number }),
};
