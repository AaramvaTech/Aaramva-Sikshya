import {
  CALLER_SUPPLIED_FK_CONSTRAINTS,
  SQLSTATE_FK_VIOLATION,
  constraintNameFrom,
  callerSuppliedFkViolation,
} from '../fk-constraints';

/**
 * ERR-MAP-1. The message strings below are the REAL Postgres wording, captured
 * from live probes against the dev database (Phase 0 §2) rather than invented —
 * the parser is only worth anything if it matches what actually arrives.
 */
const FK_MESSAGE = (constraint: string) =>
  `insert or update on table "assignments" violates foreign key constraint "${constraint}"`;

const rawMeta = (code: string, message: string) => ({ code, message });

describe('constraintNameFrom', () => {
  it('extracts the constraint from a real 23503 message', () => {
    expect(constraintNameFrom(FK_MESSAGE('assignments_class_id_fkey'))).toBe(
      'assignments_class_id_fkey',
    );
  });

  it('returns null for a message that is not a FK violation', () => {
    expect(constraintNameFrom('column "no_such_column" does not exist')).toBeNull();
    expect(constraintNameFrom(undefined)).toBeNull();
    expect(constraintNameFrom('')).toBeNull();
  });
});

describe('callerSuppliedFkViolation', () => {
  it('maps an allowlisted constraint', () => {
    const hit = callerSuppliedFkViolation(
      'P2010',
      rawMeta(SQLSTATE_FK_VIOLATION, FK_MESSAGE('assignments_academic_year_id_fkey')),
    );
    expect(hit).toEqual({ constraint: 'assignments_academic_year_id_fkey' });
  });

  // Ruling 4, the whole point of the allowlist. `created_by` is populated from
  // the token, so a violation there is our identity plumbing breaking — it must
  // stay a 500 rather than telling the caller to fix something they cannot.
  it('does NOT map a server-supplied column on the same table', () => {
    expect(
      callerSuppliedFkViolation(
        'P2010',
        rawMeta(SQLSTATE_FK_VIOLATION, FK_MESSAGE('assignments_created_by_fkey')),
      ),
    ).toBeNull();
    expect(CALLER_SUPPLIED_FK_CONSTRAINTS.has('assignments_created_by_fkey')).toBe(false);
    expect(CALLER_SUPPLIED_FK_CONSTRAINTS.has('assignments_updated_by_fkey')).toBe(false);
  });

  it('does not map a constraint that is simply unknown — the list fails closed', () => {
    expect(
      callerSuppliedFkViolation(
        'P2010',
        rawMeta(SQLSTATE_FK_VIOLATION, FK_MESSAGE('some_table_some_col_fkey')),
      ),
    ).toBeNull();
  });

  // Ruling 1, the hard rule. P2010 also carries query faults, and those are
  // ours. This is the assertion that stops the mapping from swallowing bugs.
  it.each([
    ['42703', 'column "no_such_column" does not exist'],
    ['42P01', 'relation "no_such_table" does not exist'],
    ['22P02', 'invalid input syntax for type uuid: "nope"'],
    ['23505', 'duplicate key value violates unique constraint "x_pkey"'],
  ])('does NOT map SQLSTATE %s — same Prisma code, our bug', (sqlstate, msg) => {
    expect(callerSuppliedFkViolation('P2010', rawMeta(sqlstate, msg))).toBeNull();
  });

  it('does not map P2003 — ruling 2 removed its call site instead', () => {
    expect(
      callerSuppliedFkViolation('P2003', {
        modelName: 'Subscription',
        constraint: 'subscriptions_planId_fkey',
      }),
    ).toBeNull();
  });

  it.each([['P2002'], ['P2025'], ['P2010']])(
    'tolerates a missing or malformed meta on %s',
    (code) => {
      expect(callerSuppliedFkViolation(code, undefined)).toBeNull();
      expect(callerSuppliedFkViolation(code, null)).toBeNull();
      expect(callerSuppliedFkViolation(code, {})).toBeNull();
      expect(callerSuppliedFkViolation(code, { code: 123, message: 456 })).toBeNull();
    },
  );

  it('does not map a 23503 whose message it cannot parse', () => {
    // Fails closed rather than guessing a constraint name.
    expect(
      callerSuppliedFkViolation('P2010', rawMeta(SQLSTATE_FK_VIOLATION, 'something unexpected')),
    ).toBeNull();
  });
});

describe('the allowlist itself', () => {
  it('contains only <table>_<column>_fkey names', () => {
    for (const name of CALLER_SUPPLIED_FK_CONSTRAINTS) {
      expect(name).toMatch(/^[a-z0-9_]+_fkey$/);
    }
  });

  it('excludes every known server-supplied column name', () => {
    // These are populated from the token or the tenant context, never a body.
    const serverSupplied = [
      'created_by', 'updated_by', 'marked_by', 'entered_by',
      'assigned_by', 'tenant_id', 'overridden_by_user_id', 'reviewed_by',
    ];
    for (const name of CALLER_SUPPLIED_FK_CONSTRAINTS) {
      for (const col of serverSupplied) {
        expect(name).not.toContain(col);
      }
    }
  });
});
