import { apiErrorCode } from '@/lib/api-errors';

/**
 * BILL-8-UI — the rules that make print correct, kept out of components so
 * they can be tested without a browser (this repo has no browser automation;
 * see the spec's Proof §3).
 */

export type PrintLanguage = 'EN' | 'NE' | 'BOTH';

export const PRINT_LANGUAGES: readonly PrintLanguage[] = ['EN', 'NE', 'BOTH'];

export const PRINT_LANGUAGE_LABELS: Record<PrintLanguage, string> = {
  EN: 'English',
  NE: 'नेपाली',
  BOTH: 'Both',
};

/**
 * Spec §Language: the print-time choice defaults to the tenant setting.
 * `GET /settings/profile` carries `printLanguage` and is readable by every
 * role that can print (VIEWER_ROLES includes ACCOUNTANT), so no API change
 * was needed. A null/unknown stored value falls back to EN — matching the
 * server's own `resolvePrintLanguage`, which does the same.
 */
export function defaultPrintLanguage(stored: string | null | undefined): PrintLanguage {
  return PRINT_LANGUAGES.includes(stored as PrintLanguage) ? (stored as PrintLanguage) : 'EN';
}

/**
 * Addendum A5 — storage is a hard dependency of the whole print surface.
 * With S3 unconfigured every print 503s with STORAGE_UNAVAILABLE, and that
 * must not read as "this document is broken": it is a deployment problem,
 * and saying so is the difference between a clerk retrying forever and an
 * admin fixing the env.
 */
export function isStorageUnavailable(err: unknown): boolean {
  return apiErrorCode(err) === 'STORAGE_UNAVAILABLE';
}

export const STORAGE_UNAVAILABLE_MESSAGE =
  'Printing is unavailable because document storage is not configured. This is a server setup issue — contact your administrator.';

/** The message to surface for a failed print. Storage gets its own text. */
export function printErrorMessage(err: unknown, fallback: string): string {
  return isStorageUnavailable(err) ? STORAGE_UNAVAILABLE_MESSAGE : fallback;
}

/**
 * Addendum A4 — presigned read URLs live 300s (`READ_URL_TTL_SEC`). They are
 * fetched at click time and opened immediately; they are never cached in
 * TanStack Query, held in state, persisted, or pre-rendered into an `href`.
 *
 * `noopener,noreferrer` because the opened tab is a signed URL to object
 * storage — there is no reason to hand it a `window.opener` handle.
 *
 * Returns false when the browser blocked the popup, so the caller can tell
 * the user rather than appear to do nothing.
 */
export function openPresignedUrl(
  url: string,
  open: (u: string, target: string, features: string) => Window | null = (u, t, f) =>
    window.open(u, t, f),
): boolean {
  return open(url, '_blank', 'noopener,noreferrer') !== null;
}

export const POPUP_BLOCKED_MESSAGE =
  'Your browser blocked the print window. Allow pop-ups for this site and try again.';

/**
 * Spec §Thermal: the receipt PDF genuinely declares an 80mm-wide page
 * (226.77pt × computed height, `bill-receipt.service.ts`), so correct
 * printing IS possible from a browser — but every browser's print dialog
 * defaults to scaling a page to the selected paper, which would stretch an
 * 80mm receipt across A4. The user has to be told once, at the moment they
 * print, not in documentation nobody reads.
 */
export const THERMAL_SCALE_WARNING =
  'In the print dialog, set Scale to 100% (or "Actual size") — not "Fit to page". This receipt is 80mm wide.';
