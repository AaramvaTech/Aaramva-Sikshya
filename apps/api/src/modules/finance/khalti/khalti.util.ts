import { Prisma } from '@prisma/client';

const Decimal = Prisma.Decimal;
type DecimalT = InstanceType<typeof Prisma.Decimal>;

/**
 * Khalti amounts are integers in PAISA (PAY-2 invariant 2). The invoice
 * balance is a NUMERIC(10,2) rupee value that Prisma may hand us as a string —
 * naive `* 100` on floats produces 150049.99999999997-style values, and
 * off-by-100 (sending rupees where paisa is expected) is the classic Khalti
 * integration bug. All conversions go through here; khalti.service.spec.ts
 * pins the vectors.
 *
 * BILL-0: goes straight to decimal.js (the engine `Money` also wraps) rather
 * than through `Money` itself — paisa is a different decimal scale (0dp,
 * integer) than Money's fixed 2dp rupee scale, and Money's rounding is
 * deliberately hardcoded to 2dp only (BILL-SPEC §4).
 */

function toDecimalOrNaN(value: number | string): DecimalT {
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(NaN);
  }
}

/** Rupees (number or NUMERIC string) → integer paisa. */
export function toPaisa(rupees: number | string): number {
  const value = toDecimalOrNaN(rupees);
  if (!value.isFinite()) {
    throw new Error(`Cannot convert non-finite rupee value to paisa: ${rupees}`);
  }
  return value.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Integer paisa (Khalti lookup's total_amount) → rupees. */
export function paisaToRupees(paisa: number | string): number {
  const value = toDecimalOrNaN(paisa);
  if (!value.isFinite()) {
    throw new Error(`Cannot convert non-finite paisa value to rupees: ${paisa}`);
  }
  return value.div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Defensive paisa parse for the gateway's own JSON field (KhaltiLookupResponse
 * .total_amount — untyped/optional at the wire), never throws — unlike
 * toPaisa/paisaToRupees, which reject bad input outright. Returns NaN for
 * anything that doesn't parse, mirroring the old `Math.round(Number(x))`
 * fallback the amount-mismatch check already guards with Number.isFinite().
 */
export function parseGatewayPaisa(value: number | string | undefined): number {
  if (value == null) return NaN;
  const d = toDecimalOrNaN(value);
  return d.isFinite() ? d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber() : NaN;
}
