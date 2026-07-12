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
}

const SETTINGS_EDITORS = [Role.PLATFORM_ADMIN, Role.SCHOOL_OWNER, Role.PRINCIPAL];
const STUDENT_MANAGERS = [...SETTINGS_EDITORS, Role.ACADEMIC_COORDINATOR];

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
  'staff-document': {
    maxBytes: 10 * MB,
    contentTypes: { ...IMAGE_TYPES, 'application/pdf': 'pdf' },
    uploadRoles: SETTINGS_EDITORS,
    publicRead: false,
  },
} satisfies Record<string, FileKindPolicy>;

export type FileKind = keyof typeof FILE_KIND_POLICIES;

export const FILE_KIND_NAMES = Object.keys(FILE_KIND_POLICIES) as FileKind[];

/** Union of all kinds' uploadRoles — the controller-level gate; the per-kind
 *  narrowing happens in StorageService.presignUpload. */
export const UPLOADER_ROLES = STUDENT_MANAGERS;

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
