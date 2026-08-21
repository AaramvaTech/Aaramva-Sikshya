// ERR-1 §1.4 — the ONE client error-display contract for web.
//
// getErrorDisplay() maps ANY thrown error — an axios envelope, a transport
// failure (offline/timeout), or a manufactured Error("CODE: message") — to a
// safe, user-facing display. The raw axios/JS `error.message` is NEVER
// surfaced. Keyed by `errorCode`; unknown codes fall back to the server
// `message`, then a generic default.
//
// NOTE (path): the spec named apps/web/src/lib/errors.ts; this app keeps its
// libs at apps/web/lib/, so it lives here (matches the @/lib/* alias). Kept
// dependency-free so it is unit-testable in isolation.

export type ErrorKind = 'validation' | 'session-expired' | 'network' | 'server' | 'business';

export interface ErrorDisplay {
  kind: ErrorKind;
  /** Safe, human-readable message. Never a raw axios/JS string. */
  message: string;
  /** VALIDATION_FAILED only — per-field messages for inline rendering. */
  fields?: Record<string, string>;
  /** Server faults (5xx) — surfaced as "Ref: …" so support can find the event. */
  requestId?: string;
  /** True when a Retry affordance makes sense (network + server faults). */
  retryable: boolean;
}

// Client code → display message. i18n-ready: swap for translated strings later
// without any API change (clients map errorCode → string).
const CODE_MESSAGES: Record<string, string> = {
  AUTH_INVALID_CREDENTIALS: 'Invalid email or password.',
  AUTH_SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  AUTH_TOKEN_INVALID: 'Your session is no longer valid. Please log in again.',
  AUTH_ACCOUNT_DISABLED: 'This account has been disabled. Contact your school administrator.',
  AUTH_TEMP_PASSWORD_EXPIRED: 'Your temporary password has expired. Contact your school administrator.',
  FORBIDDEN_ROLE: "You don't have permission to do this.",
  FORBIDDEN_SCOPE: "You don't have access to this record.",
  RESOURCE_NOT_FOUND: 'The requested record was not found.',
  CONFLICT_DUPLICATE: 'A record with this value already exists.',
  VALIDATION_FAILED: 'Please correct the highlighted fields.',
  TENANT_NOT_FOUND: 'School not found. Check the school address.',
  TENANT_SUSPENDED: "This school's account is currently suspended.",
  PAYMENT_GATEWAY_UNAVAILABLE: 'The payment service is temporarily unavailable. Please try again shortly.',
  PAYMENT_VERIFICATION_FAILED: 'Payment could not be verified. If money was deducted, it will be reconciled — contact your school.',
  STORAGE_UNAVAILABLE: 'File storage is temporarily unavailable. Please try again shortly.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side.',
  // ERR-MAP-1 ruling 6 — six catalog codes had drifted out of this map. Every
  // one is reachable, so every one is fixed here. Unknown codes already fell
  // back to the server `message`, so the symptom was a subtly different (and
  // untranslatable) string, not a crash.
  PASSWORD_CHANGE_REQUIRED: 'You must change your temporary password before continuing.',
  CLASS_MISMATCH: "This fee structure is for a different class than the student's.",
  RECEIPT_PAYMENT_BOUNCED:
    'This payment bounced, so no money was received. There is no receipt to print.',
  RECEIPT_PAYMENT_VOIDED:
    'This payment was voided, so it is not evidence of money received. No receipt can be printed.',
  BAD_REQUEST: 'The request could not be processed.',
  SERVICE_UNAVAILABLE: 'This service is temporarily unavailable. Please try again shortly.',
  // ERR-MAP-1: a foreign-key violation on a caller-supplied column.
  RELATED_RECORD_NOT_FOUND:
    'One of the records this refers to no longer exists. Refresh and try again.',
  // FEE-CLASS-GUARD-2: the referenced row exists but is retired or removed.
  // Per-path codes so the message can name the field the user has to change —
  // and so RELATED_RECORD_NOT_FOUND above keeps meaning "a guard is missing".
  STUDENT_UNAVAILABLE: 'That student has been removed and cannot be used here.',
  TRANSPORT_ROUTE_UNAVAILABLE:
    'That transport route is no longer available. Pick a current route.',
  DISCOUNT_REASON_UNAVAILABLE:
    'That discount reason is no longer available. Pick a current reason.',
  FEE_HEAD_UNAVAILABLE: 'That fee head is no longer available. Pick a current fee head.',
};

/**
 * ERR-MAP-1 ruling 3 — `retryable` is a property of the SPECIFIC error, and it
 * defaults to FALSE. Errors opt in.
 *
 * Previously every 5xx was `retryable: true`, which put a Retry affordance in
 * front of permanent failures: re-submitting the same request with the same bad
 * data fails identically, forever. That was harm across every 500, not only the
 * foreign-key case this ticket started from.
 *
 * Only errors that are genuinely transient — where the SAME request may succeed
 * later without the caller changing anything — belong here. `INTERNAL_ERROR` is
 * deliberately absent: a 500 is unexplained by definition, and offering Retry
 * asserts a transience nobody has established.
 */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'STORAGE_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'PAYMENT_GATEWAY_UNAVAILABLE',
  'RATE_LIMITED',
]);

/** Transport failures are always retryable — no request reached the server. */
export function isRetryableCode(code: string | undefined): boolean {
  return code !== undefined && RETRYABLE_CODES.has(code);
}

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';
const OFFLINE_MESSAGE =
  "Can't reach the server. Check your internet connection and try again.";

const SESSION_CODES = new Set(['AUTH_SESSION_EXPIRED', 'AUTH_TOKEN_INVALID']);

interface Envelope {
  code?: string;
  message?: string | string[];
  details?: { fields?: Record<string, string> } | null;
  requestId?: string;
}

function readEnvelope(error: unknown): { status?: number; env?: Envelope } {
  const e = error as
    | { response?: { status?: number; data?: { error?: Envelope } } }
    | undefined;
  return { status: e?.response?.status, env: e?.response?.data?.error };
}

/** Transport failure: no HTTP response was received (offline, DNS, timeout). */
export function isNetworkError(error: unknown): boolean {
  const e = error as
    | { code?: string; response?: unknown; request?: unknown; message?: string }
    | undefined;
  if (!e) return false;
  if (e.response) return false; // a response arrived → not a transport failure
  if (e.code === 'ERR_NETWORK' || e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') return true;
  if (typeof e.message === 'string' && /network error|timeout|timed out/i.test(e.message)) return true;
  if (e.request && !e.response) return true; // request sent, nothing came back
  return false;
}

function serverMessageOf(env?: Envelope): string | undefined {
  return typeof env?.message === 'string' && env.message ? env.message : undefined;
}

export function getErrorDisplay(error: unknown): ErrorDisplay {
  // 1) Transport failure — highest priority; mobile/Nepal connectivity is unreliable.
  if (isNetworkError(error)) {
    return { kind: 'network', message: OFFLINE_MESSAGE, retryable: true };
  }

  const { status, env } = readEnvelope(error);
  const code = env?.code;

  // 2) Cataloged server envelope.
  if (code) {
    if (code === 'VALIDATION_FAILED') {
      return {
        kind: 'validation',
        message: CODE_MESSAGES.VALIDATION_FAILED,
        fields: env?.details?.fields ?? {},
        retryable: false,
      };
    }
    if (SESSION_CODES.has(code)) {
      return { kind: 'session-expired', message: CODE_MESSAGES[code], retryable: false };
    }
    if (code === 'INTERNAL_ERROR' || (status !== undefined && status >= 500)) {
      const requestId = env?.requestId;
      const base = CODE_MESSAGES.INTERNAL_ERROR;
      return {
        kind: 'server',
        message: requestId ? `${base} Ref: ${requestId}` : base,
        requestId,
        // Ruling 3: opt-in only. A 500 is not known to be transient, so it does
        // not get a Retry the user can burn attempts on.
        retryable: isRetryableCode(code),
      };
    }
    return {
      kind: 'business',
      message: CODE_MESSAGES[code] ?? serverMessageOf(env) ?? GENERIC_MESSAGE,
      retryable: isRetryableCode(code),
    };
  }

  // 3) A response with a status but no cataloged code (pre-ERR-1 / non-enveloped).
  if (status !== undefined) {
    if (status >= 500) {
      // No cataloged code at all — nothing has opted in, so no Retry (ruling 3).
      return { kind: 'server', message: CODE_MESSAGES.INTERNAL_ERROR, retryable: false };
    }
    return { kind: 'business', message: serverMessageOf(env) ?? GENERIC_MESSAGE, retryable: false };
  }

  // 4) Manufactured Error("CODE: message") from the 2xx success:false path — parse
  //    OUR own safe encoding (never a raw axios "Request failed…" string).
  if (error instanceof Error && error.message) {
    const m = error.message.match(/^([A-Z][A-Z0-9_]+):\s*(.+)$/);
    if (m) {
      const [, parsedCode, parsedMsg] = m;
      return { kind: 'business', message: CODE_MESSAGES[parsedCode] ?? parsedMsg, retryable: false };
    }
  }

  // 5) Anything else — never surface the raw message.
  return { kind: 'server', message: GENERIC_MESSAGE, retryable: false };
}
