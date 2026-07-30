import { Money, fromDb, toDb } from './money';

describe('Money', () => {
  describe('fromDb / toDb', () => {
    it('round-trips a NUMERIC string unchanged', () => {
      expect(toDb(fromDb('1234.56'))).toBe('1234.56');
    });

    it('normalises a whole-rupee DB value to 2dp', () => {
      expect(toDb(fromDb('500'))).toBe('500.00');
    });

    it('round-trips zero', () => {
      expect(toDb(fromDb('0.00'))).toBe('0.00');
    });

    it('round-trips a large value', () => {
      expect(toDb(fromDb('12550000.00'))).toBe('12550000.00');
    });
  });

  describe('fromNumber / toNumber', () => {
    it('round-trips a plain number', () => {
      expect(Money.fromNumber(1999.5).toNumber()).toBe(1999.5);
    });
  });

  describe('add', () => {
    it('adds two money values exactly (the 0.1 + 0.2 trap)', () => {
      // In raw JS floats, 0.1 + 0.2 === 0.30000000000000004.
      const result = Money.fromNumber(0.1).add(Money.fromNumber(0.2));
      expect(result.toNumber()).toBe(0.3);
      expect(result.toDb()).toBe('0.30');
    });

    it('sums a list of invoice items without drift', () => {
      const amounts = ['2000.00', '1500.50', '999.99', '0.01'];
      const total = amounts.reduce((acc, a) => acc.add(fromDb(a)), Money.zero());
      expect(total.toDb()).toBe('4500.50');
    });
  });

  describe('sub', () => {
    it('subtracts two money values', () => {
      expect(Money.fromNumber(2000).sub(Money.fromNumber(400)).toNumber()).toBe(1600);
    });

    it('can go negative', () => {
      expect(Money.fromNumber(100).sub(Money.fromNumber(150)).toNumber()).toBe(-50);
    });
  });

  describe('mul', () => {
    it('multiplies by a plain scalar', () => {
      expect(Money.fromNumber(5).mul(8).toNumber()).toBe(40);
    });

    it('rounds the result to 2dp half-up at materialization', () => {
      // 5.005 * 2 = 10.01 exactly, but the intermediate is carried unrounded —
      // only toNumber()/toDb() round.
      expect(Money.fromNumber(0.145).mul(1).toDb()).toBe('0.15');
    });
  });

  describe('div', () => {
    it('divides by a plain scalar', () => {
      expect(Money.fromNumber(100).div(4).toNumber()).toBe(25);
    });

    it('rounds a repeating decimal to 2dp half-up', () => {
      // 100 / 3 = 33.333... -> 33.33
      expect(Money.fromNumber(100).div(3).toDb()).toBe('33.33');
    });
  });

  describe('percentOf', () => {
    it('computes a percentage of a money value', () => {
      expect(Money.fromNumber(2000).percentOf(20).toNumber()).toBe(400);
    });

    it('supports the discount-then-subtract pattern used by invoice generation', () => {
      const original = Money.fromNumber(2000);
      const discount = original.percentOf(20);
      const discounted = original.sub(discount);
      expect(discount.toNumber()).toBe(400);
      expect(discounted.toNumber()).toBe(1600);
    });

    it('matches Math.round(x * (1 - pct/100) * 100) / 100 for the old 20% case', () => {
      // Old float formula for comparison — Money must agree with it here.
      const old = Math.round(2000 * (1 - 20 / 100) * 100) / 100;
      const money = Money.fromNumber(2000).sub(Money.fromNumber(2000).percentOf(20)).toNumber();
      expect(money).toBe(old);
    });
  });

  describe('compare', () => {
    it('returns -1, 0, 1', () => {
      expect(Money.fromNumber(100).compare(Money.fromNumber(200))).toBe(-1);
      expect(Money.fromNumber(200).compare(Money.fromNumber(100))).toBe(1);
      expect(Money.fromNumber(100).compare(Money.fromNumber(100))).toBe(0);
    });
  });

  describe('isZero', () => {
    it('is true for zero, false otherwise', () => {
      expect(Money.zero().isZero()).toBe(true);
      expect(Money.fromNumber(0).isZero()).toBe(true);
      expect(Money.fromNumber(0.01).isZero()).toBe(false);
    });
  });

  describe('negate', () => {
    it('flips the sign', () => {
      expect(Money.fromNumber(100).negate().toNumber()).toBe(-100);
      expect(Money.fromNumber(-100).negate().toNumber()).toBe(100);
    });
  });

  describe('half-up rounding at the boundary, both directions', () => {
    it('rounds .005 up to .01 (up-boundary)', () => {
      expect(Money.fromNumber(1.005).mul(1).toDb()).toBe('1.01');
    });

    it('rounds .004 down to .00 (down-boundary)', () => {
      expect(Money.fromNumber(1.004).mul(1).toDb()).toBe('1.00');
    });

    it('rounds .995 up to 1.00', () => {
      expect(Money.fromNumber(0.995).mul(1).toDb()).toBe('1.00');
    });

    it('rounds negative .005 away from zero to -.01', () => {
      expect(Money.fromNumber(-1.005).mul(1).toDb()).toBe('-1.01');
    });
  });

  describe('toDisplay — BILL-8 lakh-style thousands separators', () => {
    it('groups a lakh in the South Asian 2-3-2-2 pattern, not Western 3-3-3', () => {
      expect(Money.fromNumber(100000).toDisplay()).toBe('1,00,000.00');
    });

    it('groups a crore', () => {
      expect(Money.fromNumber(12345678).toDisplay()).toBe('1,23,45,678.00');
    });

    it('groups a mixed value with decimals', () => {
      expect(Money.fromNumber(1234567.89).toDisplay()).toBe('12,34,567.89');
    });

    it('below one thousand needs no separator', () => {
      expect(Money.fromNumber(450).toDisplay()).toBe('450.00');
    });

    it('always shows exactly 2dp, even for a whole number', () => {
      expect(Money.fromNumber(1350).toDisplay()).toBe('1,350.00');
    });

    it('formats a negative value with the separator preserved', () => {
      expect(Money.fromNumber(-100000).toDisplay()).toBe('-1,00,000.00');
    });

    it('formats zero', () => {
      expect(Money.zero().toDisplay()).toBe('0.00');
    });
  });

  describe('invalid input', () => {
    it('throws on non-finite fromNumber input', () => {
      expect(() => Money.fromNumber(NaN)).toThrow();
      expect(() => Money.fromNumber(Infinity)).toThrow();
    });

    it('throws on garbage fromDb input', () => {
      expect(() => fromDb('not-a-number')).toThrow();
    });
  });
});
