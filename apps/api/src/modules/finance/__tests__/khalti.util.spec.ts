import { paisaToRupees, toPaisa } from '../khalti/khalti.util';

/**
 * PAY-2 invariant 2: Khalti speaks integer PAISA. These vectors pin the
 * rupee↔paisa conversion — the classic Khalti integration bugs are off-by-100
 * (sending rupees) and float drift (19.99 * 100 === 1998.9999999999998).
 */
describe('khalti.util — paisa conversion', () => {
  describe('toPaisa()', () => {
    it('converts whole rupees', () => {
      expect(toPaisa(600)).toBe(60000);
      expect(toPaisa(1)).toBe(100);
      expect(toPaisa(0)).toBe(0);
    });

    it('converts NUMERIC(10,2) string values (what Prisma hands us)', () => {
      expect(toPaisa('600.00')).toBe(60000);
      expect(toPaisa('1500.50')).toBe(150050);
      expect(toPaisa('0.07')).toBe(7);
    });

    it('survives binary float drift (the 19.99 trap)', () => {
      // 19.99 * 100 === 1998.9999999999998 in IEEE-754 — naive truncation loses a paisa.
      expect(toPaisa(19.99)).toBe(1999);
      expect(toPaisa(2090.55)).toBe(209055);
      expect(toPaisa(0.1 + 0.2)).toBe(30);
    });

    it('handles paisa-precision decimals', () => {
      expect(toPaisa(1500.5)).toBe(150050);
      expect(toPaisa(4111.11)).toBe(411111);
      expect(toPaisa('999999.99')).toBe(99999999);
    });

    it('is an integer, always', () => {
      expect(Number.isInteger(toPaisa(123.45))).toBe(true);
      expect(Number.isInteger(toPaisa('67.89'))).toBe(true);
    });

    it('throws on non-finite input instead of charging garbage', () => {
      expect(() => toPaisa(NaN)).toThrow();
      expect(() => toPaisa(Infinity)).toThrow();
      expect(() => toPaisa('not-a-number')).toThrow();
    });
  });

  describe('paisaToRupees()', () => {
    it('converts lookup total_amount (integer paisa) back to rupees', () => {
      expect(paisaToRupees(60000)).toBe(600);
      expect(paisaToRupees(150050)).toBe(1500.5);
      expect(paisaToRupees('1999')).toBe(19.99);
    });

    it('round-trips with toPaisa', () => {
      for (const rupees of [600, 1500.5, 19.99, 0.07, 999999.99]) {
        expect(paisaToRupees(toPaisa(rupees))).toBe(rupees);
      }
    });

    it('throws on non-finite input', () => {
      expect(() => paisaToRupees(NaN)).toThrow();
      expect(() => paisaToRupees('garbage')).toThrow();
    });
  });
});
