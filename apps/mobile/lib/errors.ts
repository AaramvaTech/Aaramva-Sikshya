// ERR-1 §1.4 — the ONE client error-display contract for mobile (mirror of
// apps/web/lib/errors.ts). Maps ANY thrown error — an axios envelope, a
// transport failure (offline/timeout — FIRST-CLASS on mobile, Nepal school
// connectivity is unreliable), a manufactured Error("CODE: message"), or one of
// our own controlled local throws — to a safe display. Raw axios/JS
// `error.message` is NEVER surfaced to the UI. Kept dependency-free so it is
// unit-testable in isolation and importable by lib/queryClient without a cycle.
//
// i18n note: error copy is English here — backend/error-string translation is a
// future pass (I18N-2, see CLAUDE.md). The `kind`/`code` structure makes a later
// code→t() mapping trivial without changing this contract.

export type ErrorKind = 'validation' | 'session-expired' | 'network' | 'server' | 'business';

export interface ErrorDisplay {
  kind: ErrorKind;
  /** Safe, human-readable message. Never a raw axios/JS string. */
  message: string;
  /** VALIDATION_FAILED only — per-field messages for inline rendering. */
  fields?: Record<string, string>;
  /** Server faults (5xx) — surfaced as "Ref: …" for support. */
  requestId?: string;
  /** True when a Retry affordance makes sense (network + server faults). */
  retryable: boolean;
}

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
  TENANT_NOT_FOUND: 'School not found. Check the school code.',
  TENANT_SUSPENDED: "This school's account is currently suspended.",
  PAYMENT_GATEWAY_UNAVAILABLE: 'The payment service is temporarily unavailable. Please try again shortly.',
  PAYMENT_VERIFICATION_FAILED: 'Payment could not be verified. If money was deducted, it will be reconciled — contact your school.',
  STORAGE_UNAVAILABLE: 'File storage is temporarily unavailable. Please try again shortly.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side.',
};

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
  // 1) Transport failure — first-class on mobile.
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
        retryable: true,
      };
    }
    return {
      kind: 'business',
      message: CODE_MESSAGES[code] ?? serverMessageOf(env) ?? GENERIC_MESSAGE,
      retryable: false,
    };
  }

  // 3) A response with a status but no cataloged code.
  if (status !== undefined) {
    if (status >= 500) {
      return { kind: 'server', message: CODE_MESSAGES.INTERNAL_ERROR, retryable: true };
    }
    return { kind: 'business', message: serverMessageOf(env) ?? GENERIC_MESSAGE, retryable: false };
  }

  // 4) Our OWN controlled local throws (file-pick / upload validation) opt in to
  //    surfacing their message via `userMessage` — a safe, user-facing string.
  const local = (error as { userMessage?: unknown } | undefined)?.userMessage;
  if (typeof local === 'string' && local) {
    return { kind: 'business', message: local, retryable: false };
  }

  // 5) Manufactured Error("CODE: message") from the 2xx success:false path.
  if (error instanceof Error && error.message) {
    const m = error.message.match(/^([A-Z][A-Z0-9_]+):\s*(.+)$/);
    if (m) {
      const [, parsedCode, parsedMsg] = m;
      return { kind: 'business', message: CODE_MESSAGES[parsedCode] ?? parsedMsg, retryable: false };
    }
  }

  // 6) Anything else — never surface the raw message.
  return { kind: 'server', message: GENERIC_MESSAGE, retryable: false };
}
