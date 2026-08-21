import { UnprocessableEntityException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { errorBody, ErrorCode } from '../common/errors/error-codes';

/**
 * FEE-CLASS-GUARD-2 — the one rule behind all four INSERT blocks.
 *
 * A foreign key cannot express this. Every one of these parents soft-deletes,
 * and a soft-deleted row still satisfies the FK, so `deleted_at` has to be
 * checked in application code or not at all (FEE-CLASS-GUARD-2-phase0.md §0).
 *
 * ONE helper rather than four copies, for the reason FEE-CLASS-GUARD already
 * recorded about its own shared rule: a rule duplicated in four places is a
 * rule that eventually disagrees with itself.
 *
 * NOTE ON SCOPE: this guards WRITES only. It does not touch the billing read
 * path, where the same blindness produces wrong bills today — that is
 * BILL-SOFTDEL-1, which runs first and is deliberately out of scope here.
 */

/**
 * The only tables this may query, and the code each raises. Table names come
 * from this literal map and never from a caller-supplied string, so nothing
 * interpolated into the SQL below is reachable from a request.
 */
const GUARDED = {
  students: 'STUDENT_UNAVAILABLE',
  transport_routes: 'TRANSPORT_ROUTE_UNAVAILABLE',
  discount_reasons: 'DISCOUNT_REASON_UNAVAILABLE',
  fee_heads: 'FEE_HEAD_UNAVAILABLE',
} as const satisfies Record<string, ErrorCode>;

export type GuardedEntity = keyof typeof GUARDED;

/**
 * Throws unless `id` names a row that exists AND is not soft-deleted.
 *
 * Both failures raise the same per-path code. They are one thing from the
 * caller's side — "this reference is not usable" — and splitting them would
 * force a second code per path for no client benefit. It also keeps
 * RELATED_RECORD_NOT_FOUND untouched, which ruling 2 requires: that code has to
 * keep meaning "a guard is missing", so a guard must never raise it.
 *
 * Side effect worth knowing: a nonexistent id used to reach the INSERT and
 * surface as an opaque FK 500. It is now a 422 naming the field. That is a
 * strict improvement and it lowers the ERR-MAP-1 backstop's rate rather than
 * hiding anything — see the deviation note in the Phase 1 report.
 */
export async function assertUsable(
  tenantPrisma: TenantPrismaService,
  entity: GuardedEntity,
  id: string,
): Promise<void> {
  const rows = await tenantPrisma.query<{ id: string }>(
    `SELECT id FROM ${entity} WHERE id = $1::uuid AND deleted_at IS NULL`,
    id,
  );
  if (!rows[0]) {
    throw new UnprocessableEntityException(errorBody(GUARDED[entity]));
  }
}
