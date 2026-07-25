import { createHmac } from 'node:crypto';
import { Money } from '../../../common/money/money';

/**
 * eSewa ePay v2 signing (verified against developer.esewa.com.np 2026-07-11):
 * HMAC-SHA256 over `field=value` pairs joined by commas, in the exact order of
 * signed_field_names, base64-encoded. For requests the mandatory order is
 * total_amount,transaction_uuid,product_code.
 */
export function esewaSignature(message: string, secretKey: string): string {
  return createHmac('sha256', secretKey).update(message).digest('base64');
}

/** `"a,b" + {a:1,b:2}` → `"a=1,b=2"` — the string eSewa signs. */
export function buildSignedMessage(
  signedFieldNames: string,
  values: Record<string, string>,
): string {
  return signedFieldNames
    .split(',')
    .map((field) => `${field}=${values[field] ?? ''}`)
    .join(',');
}

/**
 * The amount string sent to eSewa. Must be byte-identical in the form field,
 * the signature message, and the status-check query — so it is produced in
 * exactly one place. Whole rupees stay integral ("1500"), paisa keep two
 * decimals ("1500.50"). Never thousands separators.
 */
export function formatEsewaAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : Money.fromNumber(amount).toDb();
}

/**
 * Parse an amount from an eSewa response. Status-check returns JSON numbers,
 * but redirect payloads are known to carry comma-grouped strings ("1,000.0")
 * — strip grouping before parsing.
 */
export function parseEsewaAmount(value: number | string): number {
  if (typeof value === 'number') return value;
  return Money.fromDb(String(value).replace(/,/g, '')).toNumber();
}
