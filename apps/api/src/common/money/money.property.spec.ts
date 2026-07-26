import { Money } from './money';

/**
 * BILL-0 property test: Money arithmetic must equal the same computation done
 * in Postgres NUMERIC — "the test that would have caught float drift".
 *
 * Needs a live Postgres connection, which CI does not provision (see
 * .github/workflows/ci.yml — the `api` job has no DATABASE_URL / no Postgres
 * service). Loads apps/api/.env directly (a standalone jest test doesn't go
 * through Nest's ConfigModule bootstrap) and skips cleanly when unavailable,
 * so this runs for real in local/dev sessions and no-ops (not fails) in CI.
 */
let DATABASE_URL: string | undefined;
try {
  process.loadEnvFile(`${__dirname}/../../../.env`);
  DATABASE_URL = process.env.DATABASE_URL;
} catch {
  DATABASE_URL = process.env.DATABASE_URL; // still allow an already-exported env var
}

const describeIfDb = DATABASE_URL ? describe : describe.skip;

describeIfDb('Money vs Postgres NUMERIC (property test, live DB)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client');
  const prisma = new (PrismaClient as new () => import('@prisma/client').PrismaClient)();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function randomMoney(): number {
    // Random 2dp value in [0.01, 999999.99] — the practical school-fee range.
    const cents = 1 + Math.floor(Math.random() * 99_999_998);
    return cents / 100;
  }

  function randomFactor(): number {
    // A plain scalar multiplier/divisor (e.g. a day count or a percent), 1-100.
    return 1 + Math.floor(Math.random() * 99);
  }

  const SAMPLES = 40;

  // Params are passed as DECIMAL STRINGS, never raw JS numbers: Prisma binds a
  // JS `number` query param as a float8 wire value, so Postgres's `::numeric`
  // cast inherits float64 noise (e.g. 1776701.52 arrives as
  // 1776701.5200000001) — exactly the bug class this whole module exists to
  // avoid. `Money.toDb()` never produces a raw-number SQL param for this
  // reason; the property test must mirror that discipline to be a fair
  // comparison, not reintroduce the float-param bug on the Postgres side.
  it(`add() matches Postgres (a::numeric + b::numeric) for ${SAMPLES} random pairs`, async () => {
    for (let i = 0; i < SAMPLES; i++) {
      const a = randomMoney();
      const b = randomMoney();
      const mine = Money.fromNumber(a).add(Money.fromNumber(b)).toDb();
      const [{ result }] = await prisma.$queryRawUnsafe<{ result: string }[]>(
        `SELECT ($1::numeric + $2::numeric)::text AS result`,
        a.toFixed(2),
        b.toFixed(2),
      );
      expect(mine).toBe(result);
    }
  });

  it(`sub() matches Postgres (a::numeric - b::numeric) for ${SAMPLES} random pairs`, async () => {
    for (let i = 0; i < SAMPLES; i++) {
      const a = randomMoney();
      const b = randomMoney();
      const mine = Money.fromNumber(a).sub(Money.fromNumber(b)).toDb();
      const [{ result }] = await prisma.$queryRawUnsafe<{ result: string }[]>(
        `SELECT ($1::numeric - $2::numeric)::text AS result`,
        a.toFixed(2),
        b.toFixed(2),
      );
      expect(mine).toBe(result);
    }
  });

  it(`mul() matches Postgres round(a::numeric * f, 2) for ${SAMPLES} random pairs`, async () => {
    for (let i = 0; i < SAMPLES; i++) {
      const a = randomMoney();
      const f = randomFactor();
      const mine = Money.fromNumber(a).mul(f).toDb();
      const [{ result }] = await prisma.$queryRawUnsafe<{ result: string }[]>(
        `SELECT round($1::numeric * $2::numeric, 2)::text AS result`,
        a.toFixed(2),
        f,
      );
      expect(mine).toBe(result);
    }
  });

  it(`div() matches Postgres round(a::numeric / f, 2) for ${SAMPLES} random pairs`, async () => {
    for (let i = 0; i < SAMPLES; i++) {
      const a = randomMoney();
      const f = randomFactor();
      const mine = Money.fromNumber(a).div(f).toDb();
      const [{ result }] = await prisma.$queryRawUnsafe<{ result: string }[]>(
        `SELECT round($1::numeric / $2::numeric, 2)::text AS result`,
        a.toFixed(2),
        f,
      );
      expect(mine).toBe(result);
    }
  });

  it(`percentOf() matches Postgres round(a::numeric * pct / 100, 2) for ${SAMPLES} random pairs`, async () => {
    for (let i = 0; i < SAMPLES; i++) {
      const a = randomMoney();
      const pct = randomFactor();
      const mine = Money.fromNumber(a).percentOf(pct).toDb();
      const [{ result }] = await prisma.$queryRawUnsafe<{ result: string }[]>(
        `SELECT round($1::numeric * $2::numeric / 100, 2)::text AS result`,
        a.toFixed(2),
        pct,
      );
      expect(mine).toBe(result);
    }
  });

  it('toNumber() round-trips exactly through a real fixed-scale NUMERIC(10,2) column', async () => {
    // Settles the .toNumber() vs .toDb() SQL-param question for R10-frozen
    // call sites (payment.service.ts / esewa.service.ts / khalti.service.ts),
    // which must keep passing plain JS numbers as SQL params to match their
    // pinned test assertions. Unlike the raw ::numeric cast above (unbounded
    // precision, so float8-wire noise leaks straight through), a column with
    // a DECLARED scale rounds any incoming value to that scale as part of the
    // insert — so a `.toNumber()` produced by exact Decimal math (never
    // accumulated in JS float space) round-trips correctly. The values here
    // include one built by chaining several Money.add() calls, mirroring how
    // `subtotal` accumulates across invoice line items.
    await prisma.$executeRawUnsafe(
      `CREATE TEMP TABLE IF NOT EXISTS money_roundtrip_check (v NUMERIC(10,2))`,
    );
    const chained = ['2000.00', '1500.50', '999.99', '0.01', '4231.17']
      .map((v) => Money.fromDb(v))
      .reduce((acc, m) => acc.add(m), Money.zero());

    const values = [
      Money.fromNumber(1000).mul(1), // simple passthrough
      Money.fromNumber(0.1).add(Money.fromNumber(0.2)), // the classic float trap
      chained,
      Money.fromNumber(2000).sub(Money.fromNumber(2000).percentOf(20)), // discount calc shape
    ];

    for (const m of values) {
      await prisma.$executeRawUnsafe(`DELETE FROM money_roundtrip_check`);
      await prisma.$executeRawUnsafe(
        `INSERT INTO money_roundtrip_check (v) VALUES ($1)`,
        m.toNumber(),
      );
      const [{ result }] = await prisma.$queryRawUnsafe<{ result: string }[]>(
        `SELECT v::text AS result FROM money_roundtrip_check`,
      );
      expect(result).toBe(m.toDb());
    }
  });

  it('round-half-up boundary values match Postgres round(x, 2) exactly', async () => {
    const vectors = [2.345, 2.005, -2.005, 1.004, 0.995, 1.005, -1.005];
    for (const v of vectors) {
      const mine = Money.fromNumber(v).mul(1).toDb();
      const [{ result }] = await prisma.$queryRawUnsafe<{ result: string }[]>(
        `SELECT round($1::numeric, 2)::text AS result`,
        String(v),
      );
      expect(mine).toBe(result);
    }
  });
});
