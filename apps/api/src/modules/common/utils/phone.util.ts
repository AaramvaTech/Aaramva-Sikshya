// REG-1 §2 — Nepali mobile phone validation + E.164 storage.
//
// Input rule (registration): a bare 10-digit Nepali mobile matching
// ^9[678]\d{8}$ (starts 96 / 97 / 98). The stored form is E.164 with the +977
// country code: +977XXXXXXXXXX.
//
// This is intentionally SEPARATE from communication/sms `normaliseNepalPhone`,
// which is a send-time normaliser: tolerant of messy inbound formats and emits a
// bare `977…` (no leading +). REG-1 registration is strict and stores true E.164.

/** Strict bare Nepali mobile: 10 digits starting 96 / 97 / 98. */
export const NEPAL_MOBILE_REGEX = /^9[678]\d{8}$/;

/** E.164 form of a Nepali mobile: +977 followed by the 10-digit mobile. */
const NEPAL_E164_REGEX = /^\+977(9[678]\d{8})$/;

/** True when `input` is a bare valid Nepali mobile (no country code). */
export function isNepaliMobile(input: string): boolean {
  return NEPAL_MOBILE_REGEX.test(input);
}

/**
 * Convert a Nepali mobile to E.164 (+977XXXXXXXXXX).
 * - A valid bare mobile (`9812345678`) → `+9779812345678`.
 * - Already-E.164 input (`+9779812345678`) is returned unchanged, so the
 *   transform is idempotent on values already stored in E.164.
 * - Anything else → `null` (caller decides: store null, or reject).
 */
export function toE164Nepal(input: string | null | undefined): string | null {
  if (input == null) return null;
  const trimmed = String(input).trim();
  if (NEPAL_MOBILE_REGEX.test(trimmed)) return `+977${trimmed}`;
  if (NEPAL_E164_REGEX.test(trimmed)) return trimmed;
  return null;
}
