// REG-1 Phase 5 — surface server validation errors instead of swallowing them.
//
// The API error envelope is:
//   { success: false, error: { code: string, message: string | string[], details } }
// with HTTP 400/403. class-validator returns `message` as an ARRAY of field-level
// strings (e.g. ["phone must be a valid Nepali mobile number …", "email must be an email"]).
// The 401-only axios interceptor leaves this intact on the rejected error.

interface ApiErrorEnvelope {
  response?: { data?: { error?: { code?: string; message?: string | string[] } } };
}

/** Flatten the server's validation message(s) into a string[] (never empty). */
export function extractApiErrors(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string[] {
  const msg = (err as ApiErrorEnvelope)?.response?.data?.error?.message;
  if (Array.isArray(msg)) return msg.filter((m) => typeof m === 'string' && m.length > 0);
  if (typeof msg === 'string' && msg.length > 0) return [msg];
  return [fallback];
}

/** The machine-readable error code, if any (e.g. PASSWORD_CHANGE_REQUIRED). */
export function apiErrorCode(err: unknown): string | undefined {
  return (err as ApiErrorEnvelope)?.response?.data?.error?.code;
}
