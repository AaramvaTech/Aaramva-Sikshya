import { Role } from '../common/enums/role.enum';

/**
 * FILE-1 kind-policy table — the single authority on what may be uploaded.
 *
 * Every presigned upload belongs to exactly one kind. The kind fixes the max
 * size, the content-type allow-list, who may request an upload presign, and
 * whether the object is public-read. Only `school-logo` is public-read: it
 * renders pre-auth (mobile school-code screen, login page), where presigning
 * is impossible. Public-read kinds persist their PUBLIC URL in the DB; every
 * private kind persists the storage KEY and is read via short-lived presigned
 * GETs behind object-level scoping (FileAccessService).
 *
 * Keys are ALWAYS server-generated: `tenant_<slug>/<kind>/<uuid>.<ext>` — the
 * extension comes from the validated content type, never from the client
 * filename (accepted in the DTO for logging/UX only).
 */

const MB = 1024 * 1024;

/** contentType → server-chosen key extension */
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface FileKindPolicy {
  maxBytes: number;
  contentTypes: Record<string, string>;
  /** roles allowed to request an upload presign for this kind */
  uploadRoles: Role[];
  /** served anonymously via bucket policy — persist publicUrl, not the key */
  publicRead: boolean;
  /** EDU-1: grantable ONLY through a feature-module endpoint that performs its
   *  own object-level eligibility check first (e.g. submission-file requires
   *  the student to be targeted by the assignment). The generic
   *  POST /files/presign-upload rejects these kinds. */
  scopedOnly?: boolean;
}

const SETTINGS_EDITORS = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL];
const STUDENT_MANAGERS = [...SETTINGS_EDITORS, Role.ACADEMIC_COORDINATOR];

/** EDU-1 document types (assignment attachments + submissions). */
const DOCUMENT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export const FILE_KIND_POLICIES = {
  'student-photo': {
    maxBytes: 2 * MB,
    contentTypes: IMAGE_TYPES,
    uploadRoles: STUDENT_MANAGERS,
    publicRead: false,
  },
  'staff-photo': {
    maxBytes: 2 * MB,
    contentTypes: IMAGE_TYPES,
    uploadRoles: SETTINGS_EDITORS,
    publicRead: false,
  },
  'school-logo': {
    maxBytes: 2 * MB,
    contentTypes: IMAGE_TYPES,
    uploadRoles: SETTINGS_EDITORS,
    publicRead: true,
  },
  'principal-signature': {
    maxBytes: 1 * MB,
    contentTypes: IMAGE_TYPES,
    uploadRoles: SETTINGS_EDITORS,
    publicRead: false,
  },
  'school-stamp': {
    maxBytes: 1 * MB,
    contentTypes: IMAGE_TYPES,
    uploadRoles: SETTINGS_EDITORS,
    publicRead: false,
  },
  // UI-7 — bill payment QR code (eSewa/bank). Modeled directly on
  // principal-signature/school-stamp: private (read via presigned GET at
  // render time, same as those two), not public like school-logo.
  'qr-image': {
    maxBytes: 1 * MB,
    contentTypes: IMAGE_TYPES,
    uploadRoles: SETTINGS_EDITORS,
    publicRead: false,
  },
  'staff-document': {
    maxBytes: 10 * MB,
    contentTypes: { ...IMAGE_TYPES, 'application/pdf': 'pdf' },
    uploadRoles: SETTINGS_EDITORS,
    publicRead: false,
  },
  // EDU-1: teacher homework attachments — presignable via the generic route.
  'assignment-attachment': {
    maxBytes: 10 * MB,
    contentTypes: { ...IMAGE_TYPES, ...DOCUMENT_TYPES },
    uploadRoles: [...STUDENT_MANAGERS, Role.TEACHER],
    publicRead: false,
  },
  // EDU-1: student submission files — scopedOnly: eligibility (student is
  // targeted by the published assignment) lives in AssignmentModule; presign
  // ONLY via POST /assignments/:id/submissions/presign-upload.
  'submission-file': {
    maxBytes: 10 * MB,
    contentTypes: { ...IMAGE_TYPES, ...DOCUMENT_TYPES },
    uploadRoles: [Role.STUDENT],
    publicRead: false,
    scopedOnly: true,
  },
} satisfies Record<string, FileKindPolicy>;

export type FileKind = keyof typeof FILE_KIND_POLICIES;

export const FILE_KIND_NAMES = Object.keys(FILE_KIND_POLICIES) as FileKind[];

/** Union of the NON-scopedOnly kinds' uploadRoles — the generic controller
 *  gate; per-kind narrowing happens in StorageService.presignUpload. scopedOnly
 *  kinds (submission-file) are excluded: their presign lives on the feature
 *  endpoint that performs the eligibility check. */
export const UPLOADER_ROLES = [
  ...new Set(
    Object.values(FILE_KIND_POLICIES as Record<string, FileKindPolicy>)
      .filter((p) => !p.scopedOnly)
      .flatMap((p) => p.uploadRoles),
  ),
];

export interface ParsedStorageKey {
  slug: string;
  kind: FileKind;
  basename: string;
}

/** Parses a storage key back into its parts; null if it is not one of ours. */
export function parseStorageKey(key: string): ParsedStorageKey | null {
  const m = /^tenant_([a-z0-9-]+)\/([a-z-]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+)$/.exec(
    key,
  );
  if (!m || !(m[2] in FILE_KIND_POLICIES)) return null;
  return { slug: m[1], kind: m[2] as FileKind, basename: m[3] };
}

/** True when a stored photo_url/file_url/… value is a FILE-1 storage key
 *  (as opposed to a legacy base64 data-URI or an absolute URL). */
export function isStorageKey(value: string | null | undefined): value is string {
  return !!value && parseStorageKey(value) !== null;
}
