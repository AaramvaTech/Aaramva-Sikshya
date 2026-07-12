import type { GuardianProfile } from '../types';

/**
 * Email → "Ramesh Shrestha" fallback. POL-2 T5 replaced this as the PRIMARY
 * name source with GET /guardians/me; it survives only as the loading/failure
 * fallback in guardianDisplayName below.
 */
export function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1))
    .join(' ');
}

/**
 * POL-2 T5: the guardian's real display name from GET /guardians/me. Falls back
 * to the email-synthesized name only while the profile is loading or the request
 * failed — so a signed-in parent never sees a blank name.
 */
export function guardianDisplayName(
  guardian: GuardianProfile | undefined,
  email: string | undefined,
): string {
  if (guardian) {
    const full = `${guardian.firstName ?? ''}${guardian.lastName ? ` ${guardian.lastName}` : ''}`.trim();
    if (full) return full;
  }
  return email ? nameFromEmail(email) : 'Parent';
}

/** First two initials of a display name. */
export function guardianInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
