import { randomInt } from 'node:crypto';

// Ambiguous characters (0 O 1 l I) are excluded for legibility in emails.
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '!@#$%^&*';
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

/**
 * Generates a strong temporary password with at least one lowercase, uppercase,
 * digit, and symbol. Ambiguous characters are excluded.
 */
export function generateTemporaryPassword(length = 12): string {
  const required = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(ALL));
  const chars = [...required, ...rest];
  // Fisher–Yates shuffle so required chars aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
