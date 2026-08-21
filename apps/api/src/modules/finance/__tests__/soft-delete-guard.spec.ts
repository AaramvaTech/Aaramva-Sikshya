import { UnprocessableEntityException } from '@nestjs/common';
import { assertUsable, GuardedEntity } from '../soft-delete-guard.util';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { ERROR_CATALOG } from '../../common/errors/error-codes';

/**
 * FEE-CLASS-GUARD-2 — the shared rule behind all four INSERT blocks.
 *
 * A foreign key cannot express this: every guarded parent soft-deletes, and a
 * soft-deleted row still satisfies the FK. These tests pin the rule itself; the
 * per-service specs pin that each write path actually calls it.
 */
describe('assertUsable', () => {
  const prisma = () => {
    const query = jest.fn();
    return { svc: { query } as unknown as TenantPrismaService, query };
  };

  const CASES: [GuardedEntity, string][] = [
    ['students', 'STUDENT_UNAVAILABLE'],
    ['transport_routes', 'TRANSPORT_ROUTE_UNAVAILABLE'],
    ['discount_reasons', 'DISCOUNT_REASON_UNAVAILABLE'],
    ['fee_heads', 'FEE_HEAD_UNAVAILABLE'],
  ];

  describe('it FIRES', () => {
    it.each(CASES)('%s: no usable row → 422 %s', async (entity, code) => {
      const { svc, query } = prisma();
      query.mockResolvedValueOnce([]); // soft-deleted, or absent

      await expect(assertUsable(svc, entity, 'id-1')).rejects.toThrow(UnprocessableEntityException);

      const { svc: s2, query: q2 } = prisma();
      q2.mockResolvedValueOnce([]);
      await expect(assertUsable(s2, entity, 'id-1')).rejects.toMatchObject({ response: { code } });
    });

    it.each(CASES)('%s: the code is a real catalog entry at 422', (_entity, code) => {
      // Ruling 2 requires every new code to be cataloged; the completeness
      // test enforces that globally, this pins the status these guards rely on.
      expect(code in ERROR_CATALOG).toBe(true);
      expect(ERROR_CATALOG[code as keyof typeof ERROR_CATALOG].status).toBe(422);
    });
  });

  describe('the LEGITIMATE case passes', () => {
    it.each(CASES)('%s: a live row is accepted, silently', async (entity) => {
      const { svc, query } = prisma();
      query.mockResolvedValueOnce([{ id: 'id-1' }]);
      await expect(assertUsable(svc, entity, 'id-1')).resolves.toBeUndefined();
    });
  });

  it('asks for the row AND its liveness in one query', async () => {
    const { svc, query } = prisma();
    query.mockResolvedValueOnce([{ id: 'id-1' }]);
    await assertUsable(svc, 'fee_heads', 'head-1');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, param] = query.mock.calls[0];
    expect(sql).toContain('FROM fee_heads');
    expect(sql).toContain('deleted_at IS NULL'); // the whole point — the FK cannot see this
    expect(param).toBe('head-1');
  });

  it('never interpolates anything caller-supplied into the SQL', async () => {
    // Table names come from a literal map keyed by GuardedEntity; the id is
    // always a bound parameter. Belt-and-braces against the one injection
    // shape this helper could otherwise have.
    const { svc, query } = prisma();
    query.mockResolvedValueOnce([{ id: 'x' }]);
    await assertUsable(svc, 'students', "'; DROP TABLE students; --");

    const [sql, param] = query.mock.calls[0];
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).toContain('$1::uuid');
    expect(param).toBe("'; DROP TABLE students; --");
  });
});
