/**
 * MAIL-2 §2 — channel-generic rate-limit classifier for the credential-delivery
 * poller. It lives on the poller (NOT the email sender) so the future real-SMS
 * path inherits it unchanged.
 *
 * A rate-limit / greylist signal is RETRYABLE_NO_ATTEMPT: the poller reschedules
 * the row WITHOUT burning an `attempts` slot — a transient provider throttle must
 * never exhaust the 3-attempt budget and mark an otherwise-deliverable row FAILED.
 * Each such reschedule bumps `retry_holds` (observability); at MAX_RETRY_HOLDS the
 * poller gives up → FAILED with `last_error = 'retry hold cap exceeded'`.
 *
 * Signals recognised (spec §2):
 *   - SMTP 421 / 450 / 451 (service unavailable / mailbox busy / local error — the
 *     transient/greylist family; providers rate-limit with these codes)
 *   - HTTP 429 (Too Many Requests)
 *   - provider text: "too many requests", "rate limit", "quota", "throttle"
 */

const RATE_LIMIT_PATTERNS: RegExp[] = [
  /\b(?:421|450|451)\b/, // SMTP transient / greylist / rate-limit response codes
  /\b429\b/, // HTTP 429 Too Many Requests
  /too\s*many\s*requests?/i,
  /rate[\s._-]*limit/i,
  /\bquota\b/i,
  /throttl/i, // throttle / throttled / throttling
];

/** True when the error text carries a rate-limit / greylist signal (spec §2). */
export function isRateLimitError(message: string | null | undefined): boolean {
  if (!message) return false;
  return RATE_LIMIT_PATTERNS.some((re) => re.test(message));
}

/**
 * Cap on consecutive no-attempt rate-limit reschedules for one row. Reaching it
 * (a genuinely stuck row) ends the hold loop → FAILED. Kept observable via the
 * `retry_holds` column so operators can see a row that has been held repeatedly.
 */
export const MAX_RETRY_HOLDS = 50;

/**
 * Backoff (seconds) for a rate-limit hold. Escalates with the hold count and caps
 * at 10 minutes, so a long throttle window is spaced out without unbounded growth.
 * `attempts` is deliberately NOT used here — holds do not touch the attempt budget.
 */
export function rateLimitBackoffSeconds(holds: number): number {
  const steps = Math.min(Math.max(holds, 1), 10); // 1..10
  return steps * 60; // 1 min → 10 min ceiling
}
