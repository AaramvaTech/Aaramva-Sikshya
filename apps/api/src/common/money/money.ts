import { Prisma } from '@prisma/client';

const Decimal = Prisma.Decimal;
type DecimalT = InstanceType<typeof Prisma.Decimal>;

/**
 * BILL-0 (R1): the only representation of money allowed to touch arithmetic
 * anywhere in the finance module. Wraps decimal.js (via Prisma's re-export —
 * never mutates its global config, so this can't affect Prisma's own Decimal
 * fields elsewhere). Arithmetic (add/sub/mul/div/percentOf) is carried at
 * full decimal.js precision; rounding to 2dp half-up happens in exactly one
 * place (`round`), invoked only by the two boundary conversions `toDb` and
 * `toNumber`. This mirrors where the old code's `Math.round(x * 100) / 100`
 * calls sat — same materialization points, exact arithmetic upstream of them.
 */
export class Money {
  private readonly value: DecimalT;

  private constructor(value: DecimalT) {
    if (!value.isFinite()) {
      throw new Error(`Money value must be finite, got: ${value.toString()}`);
    }
    this.value = value;
  }

  static zero(): Money {
    return new Money(new Decimal(0));
  }

  /** The only place a NUMERIC-string DB value becomes a Money. */
  static fromDb(value: string): Money {
    return new Money(new Decimal(value));
  }

  /** For DTO-boundary / literal values already known to be a valid JS number. */
  static fromNumber(value: number): Money {
    if (!Number.isFinite(value)) {
      throw new Error(`Money value must be finite, got: ${value}`);
    }
    return new Money(new Decimal(value));
  }

  add(other: Money): Money {
    return new Money(this.value.plus(other.value));
  }

  sub(other: Money): Money {
    return new Money(this.value.minus(other.value));
  }

  mul(factor: number): Money {
    return new Money(this.value.times(factor));
  }

  div(divisor: number): Money {
    return new Money(this.value.div(divisor));
  }

  /** This money value's X percent, e.g. Money(2000).percentOf(20) -> 400. */
  percentOf(percent: number): Money {
    return this.mul(percent).div(100);
  }

  compare(other: Money): -1 | 0 | 1 {
    return this.value.cmp(other.value) as -1 | 0 | 1;
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  negate(): Money {
    return new Money(this.value.negated());
  }

  /** The single rounding step: half-up (away from zero at the boundary) to 2dp. */
  private round(): DecimalT {
    return this.value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  /** The only conversion back to a NUMERIC-string DB value. */
  toDb(): string {
    return this.round().toFixed(2);
  }

  /** Boundary conversion for JS `number`-typed response DTOs / legacy call sites. */
  toNumber(): number {
    return this.round().toNumber();
  }

  toString(): string {
    return this.toDb();
  }
}

export function fromDb(value: string): Money {
  return Money.fromDb(value);
}

export function toDb(m: Money): string {
  return m.toDb();
}
