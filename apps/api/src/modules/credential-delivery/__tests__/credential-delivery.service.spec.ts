import { CredentialDeliveryService } from '../credential-delivery.service';
import { encryptSecret } from '../credential-crypto.util';

const TEST_KEY =
  '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

interface TxOpts {
  dueRows: unknown[][]; // successive FOR UPDATE results
  secret: unknown[] | null; // credential_delivery_secrets SELECT result
  pendingCount?: number;
}

function makeHarness(opts: TxOpts) {
  const updates: { sql: string; args: unknown[] }[] = [];
  const deletes: { sql: string; args: unknown[] }[] = [];
  let dueIdx = 0;

  const tx = {
    $queryRawUnsafe: jest.fn((sql: string) => {
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        return Promise.resolve(opts.dueRows[dueIdx++] ?? []);
      }
      if (sql.includes('FROM credential_delivery_secrets')) {
        return Promise.resolve(opts.secret ?? []);
      }
      if (sql.includes('FROM users')) return Promise.resolve([{ email: 'u@x.z' }]);
      if (sql.includes('count(*)')) return Promise.resolve([{ n: opts.pendingCount ?? 0 }]);
      return Promise.resolve([]);
    }),
    $executeRawUnsafe: jest.fn((sql: string, ...args: unknown[]) => {
      if (sql.includes('UPDATE credential_deliveries')) updates.push({ sql, args });
      if (sql.includes('DELETE FROM credential_delivery_secrets')) deletes.push({ sql, args });
      return Promise.resolve(1);
    }),
  };

  const tenantPrisma = {
    run: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    query: jest.fn(),
  };
  const mail = { send: jest.fn().mockResolvedValue({ status: 'MOCK' }) };
  const service = new CredentialDeliveryService(
    tenantPrisma as never,
    mail as never,
  );
  return { service, tx, updates, deletes, mail };
}

describe('CredentialDeliveryService (REG-1 Phase 3)', () => {
  const prev = process.env.CREDENTIAL_SECRET_KEY;
  const prevDry = process.env.SMS_DRY_RUN;
  beforeAll(() => {
    process.env.CREDENTIAL_SECRET_KEY = TEST_KEY;
  });
  afterAll(() => {
    process.env.CREDENTIAL_SECRET_KEY = prev;
    process.env.SMS_DRY_RUN = prevDry;
  });

  const encSecret = () => {
    const e = encryptSecret('TempPw@123456');
    return [{ ciphertext: e.ciphertext, iv: e.iv, auth_tag: e.authTag }];
  };

  it('enqueueInTx writes the encrypted secret + one PENDING row per target', async () => {
    const inserts: string[] = [];
    const tx = {
      $executeRawUnsafe: jest.fn((sql: string) => {
        inserts.push(sql);
        return Promise.resolve(1);
      }),
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: 'row-x' }]),
    };
    const svc = new CredentialDeliveryService({} as never, {} as never);
    const ids = await svc.enqueueInTx(tx as never, {
      userId: 'u1',
      plaintext: 'TempPw@123456',
      targets: [
        { channel: 'EMAIL', recipient: 'a@b.c' },
        { channel: 'SMS', recipient: '+9779812345678' },
      ],
    });
    expect(ids).toEqual(['row-x', 'row-x']);
    expect(inserts.some((s) => s.includes('INSERT INTO credential_delivery_secrets'))).toBe(true);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(2); // two ledger inserts
    // the plaintext must never be a bind param on the ledger insert
    const ledgerArgs = (tx.$queryRawUnsafe as jest.Mock).mock.calls.flatMap((c) => c.slice(1));
    expect(ledgerArgs).not.toContain('TempPw@123456');
  });

  it('drain: EMAIL success → SENT + secret deleted when no PENDING remain', async () => {
    const { service, updates, deletes, mail } = makeHarness({
      dueRows: [[{ id: 'd1', user_id: 'u1', channel: 'EMAIL', recipient: 'a@b.c', attempts: 0 }], []],
      secret: encSecret(),
      pendingCount: 0,
    });
    const tally = await service.drainCurrentTenant();
    expect(tally).toMatchObject({ processed: 1, sent: 1, dry: 0, failed: 0 });
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(updates[0].sql).toContain('SET status = $1');
    expect(updates[0].args[0]).toBe('SENT');
    expect(deletes).toHaveLength(1); // secret removed
  });

  it('drain: SMS under SMS_DRY_RUN=true → SENT_DRY (Sparrow never called)', async () => {
    process.env.SMS_DRY_RUN = 'true';
    const { service, updates } = makeHarness({
      dueRows: [[{ id: 'd2', user_id: 'u1', channel: 'SMS', recipient: '+9779812345678', attempts: 0 }], []],
      secret: encSecret(),
      pendingCount: 0,
    });
    const tally = await service.drainCurrentTenant();
    expect(tally).toMatchObject({ processed: 1, dry: 1, sent: 0 });
    expect(updates[0].args[0]).toBe('SENT_DRY');
  });

  it('drain: delivery failure on the last attempt → FAILED + last_error', async () => {
    const { service, updates } = makeHarness({
      // attempts=2 → this attempt is #3 → FAILED. secret missing → decrypt throws.
      dueRows: [[{ id: 'd3', user_id: 'u1', channel: 'EMAIL', recipient: 'a@b.c', attempts: 2 }], []],
      secret: [], // missing → decrypt error
      pendingCount: 0,
    });
    const tally = await service.drainCurrentTenant();
    expect(tally).toMatchObject({ processed: 1, failed: 1 });
    expect(updates[0].sql).toContain("status = 'FAILED'");
    // last_error ($2) is populated
    expect(typeof updates[0].args[1]).toBe('string');
    expect(updates[0].args[1]).toMatch(/secret missing/);
  });

  it('drain: transient failure before the cap → backoff (attempts++ , next_attempt_at)', async () => {
    const { service, updates } = makeHarness({
      dueRows: [[{ id: 'd4', user_id: 'u1', channel: 'EMAIL', recipient: 'a@b.c', attempts: 0 }], []],
      secret: [], // decrypt throws → RETRY
      pendingCount: 1, // still pending → secret kept
    });
    const tally = await service.drainCurrentTenant();
    expect(tally).toMatchObject({ processed: 1, retried: 1, failed: 0 });
    expect(updates[0].sql).toContain('next_attempt_at = NOW()');
    expect(updates[0].args[0]).toBe(1); // attempts incremented to 1
  });
});
