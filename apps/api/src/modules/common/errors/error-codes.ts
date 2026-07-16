/**
 * ERR-1 — the ONE source of truth for machine-readable error codes.
 *
 * Every error the API returns carries one of these `code` values inside the
 * (unchanged, nested) envelope:
 *   { success: false, error: { code, message, details, requestId } }
 *
 * Clients key off `code`, never off `message` (§1.1). `message` is a safe,
 * human-readable English default; Nepali is added client-side later by mapping
 * code → string, so no API change is needed for i18n.
 *
 * NOTE (path): the spec named `src/common/errors/`; this repo keeps all shared
 * building blocks under `src/modules/common/`, so the catalog lives here to
 * match the existing filters/guards/interceptors layout.
 */

export interface CatalogEntry {
  /** Canonical HTTP status for this code (the actual response status still
   *  comes from the thrown HttpException's class, which must agree with this). */
  readonly status: number;
  /** Safe default English message. */
  readonly message: string;
}

export const ERROR_CATALOG = {
  // ── Auth ────────────────────────────────────────────────────────────────
  AUTH_INVALID_CREDENTIALS: { status: 401, message: 'Invalid email or password.' },
  AUTH_SESSION_EXPIRED: { status: 401, message: 'Your session has expired. Please log in again.' },
  AUTH_TOKEN_INVALID: { status: 401, message: 'Your session is no longer valid. Please log in again.' },
  AUTH_ACCOUNT_DISABLED: { status: 403, message: 'This account has been disabled. Contact your school administrator.' },
  AUTH_TEMP_PASSWORD_EXPIRED: { status: 401, message: 'Your temporary password has expired. Contact your school administrator.' },
  // ── Authorization ───────────────────────────────────────────────────────
  FORBIDDEN_ROLE: { status: 403, message: "You don't have permission to do this." },
  FORBIDDEN_SCOPE: { status: 403, message: "You don't have access to this record." },
  PASSWORD_CHANGE_REQUIRED: { status: 403, message: 'You must change your temporary password before continuing.' },
  // ── Resource / conflict / validation ─────────────────────────────────────
  RESOURCE_NOT_FOUND: { status: 404, message: 'The requested record was not found.' },
  CONFLICT_DUPLICATE: { status: 409, message: 'A record with this value already exists.' },
  VALIDATION_FAILED: { status: 422, message: 'Please correct the highlighted fields.' },
  // ── Tenant ──────────────────────────────────────────────────────────────
  TENANT_NOT_FOUND: { status: 404, message: 'School not found. Check the school address (slug).' },
  TENANT_SUSPENDED: { status: 403, message: "This school's account is currently suspended." },
  // ── Payments ────────────────────────────────────────────────────────────
  PAYMENT_GATEWAY_UNAVAILABLE: { status: 502, message: 'The payment service is temporarily unavailable. Please try again shortly.' },
  PAYMENT_VERIFICATION_FAILED: { status: 400, message: 'Payment could not be verified. If money was deducted, it will be reconciled — contact your school.' },
  // ── Infrastructure ──────────────────────────────────────────────────────
  STORAGE_UNAVAILABLE: { status: 503, message: 'File storage is temporarily unavailable. Please try again shortly.' },
  RATE_LIMITED: { status: 429, message: 'Too many attempts. Please wait a moment and try again.' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong on our side. Ref: {requestId}' },
  // ── ERR-1 generic fallbacks (extensions) ─────────────────────────────────
  // Not distinct product concepts — they exist so EVERY HTTP status the API
  // emits still maps to a catalog code when a throw carries no explicit one.
  BAD_REQUEST: { status: 400, message: 'The request could not be processed.' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'This service is temporarily unavailable. Please try again shortly.' },
} as const satisfies Record<string, CatalogEntry>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

/** Default code for a bare HttpException that carries no explicit `code`. */
const STATUS_DEFAULT_CODE: Readonly<Record<number, ErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'AUTH_SESSION_EXPIRED',
  403: 'FORBIDDEN_ROLE',
  404: 'RESOURCE_NOT_FOUND',
  409: 'CONFLICT_DUPLICATE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  502: 'PAYMENT_GATEWAY_UNAVAILABLE',
  503: 'SERVICE_UNAVAILABLE',
};

export function defaultCodeForStatus(status: number): ErrorCode {
  return STATUS_DEFAULT_CODE[status] ?? 'INTERNAL_ERROR';
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_CATALOG, value);
}

/**
 * Build the response body an HttpException carries so the filter emits a
 * cataloged `code`. Keep the exception CLASS at the call site — that preserves
 * both the HTTP status and the exception type existing `toThrow(XException)`
 * tests assert on:
 *
 *   throw new ForbiddenException(errorBody('FORBIDDEN_SCOPE'));
 *   throw new UnauthorizedException(errorBody('AUTH_INVALID_CREDENTIALS'));
 */
export function errorBody(
  code: ErrorCode,
  message?: string,
  details?: unknown,
): { code: ErrorCode; message: string; details?: unknown } {
  return {
    code,
    message: message ?? ERROR_CATALOG[code].message,
    ...(details !== undefined ? { details } : {}),
  };
}
