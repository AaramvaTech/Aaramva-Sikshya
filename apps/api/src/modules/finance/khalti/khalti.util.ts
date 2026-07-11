/**
 * Khalti amounts are integers in PAISA (PAY-2 invariant 2). The invoice
 * balance is a NUMERIC(10,2) rupee value that Prisma may hand us as a string —
 * naive `* 100` on floats produces 150049.99999999997-style values, and
 * off-by-100 (sending rupees where paisa is expected) is the classic Khalti
 * integration bug. All conversions go through here; khalti.service.spec.ts
 * pins the vectors.
 */

/** Rupees (number or NUMERIC string) → integer paisa. */
export function toPaisa(rupees: number | string): number {
  const value = typeof rupees === 'string' ? Number(rupees) : rupees;
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot convert non-finite rupee value to paisa: ${rupees}`);
  }
  return Math.round(value * 100);
}

/** Integer paisa (Khalti lookup's total_amount) → rupees. */
export function paisaToRupees(paisa: number | string): number {
  const value = typeof paisa === 'string' ? Number(paisa) : paisa;
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot convert non-finite paisa value to rupees: ${paisa}`);
  }
  return Math.round(value) / 100;
}
