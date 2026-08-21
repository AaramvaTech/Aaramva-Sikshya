/**
 * ERR-MAP-1 — which foreign-key violations are the CALLER's fault.
 *
 * Ruling 1 (the hard rule of the ticket): key on the Postgres SQLSTATE `23503`,
 * NEVER on Prisma's `P2010`. `P2010` means "raw query failed" and nothing more
 * — the same code carries `42703` (undefined column), `42P01` (undefined
 * table) and `22P02` (invalid text). Mapping P2010 would turn our own SQL bugs
 * into 4xx client errors. See ERR-MAP-1-phase0.md §2 for the measured shapes.
 *
 * Ruling 4: an explicit allowlist decides fault. A violation is mapped to 4xx
 * ONLY when its constraint appears below; everything else stays a 500.
 *
 *   "Our bug reported as 400 tells a caller to fix something they can't, and
 *    gets closed as user error. A caller error reported as 500 is merely a poor
 *    message."
 *
 * The two directions are not symmetric, so this list FAILS CLOSED: an unlisted
 * constraint stays 5xx even when it probably was the caller's fault. Adding an
 * entry is a deliberate act — see the checklist at the bottom.
 */

/**
 * Keyed on CONSTRAINT NAME, not column name, because the constraint name is
 * what the error actually carries. Postgres's `23503` primary message is
 * `…violates foreign key constraint "<name>"`; the `Key (col)=(val)` DETAIL
 * line is NOT included in Prisma's `meta.message`. Postgres's default naming
 * (`<table>_<column>_fkey`) already encodes the column, so nothing is lost —
 * and a list of literal names is greppable and reviewable in a way a derived
 * column never is.
 */
export const CALLER_SUPPLIED_FK_CONSTRAINTS: ReadonlySet<string> = new Set([
  // assignments — the worked example from Phase 0 §4. Four of its six FKs come
  // straight from CreateAssignmentDto; `created_by` and `updated_by` come from
  // the token and are deliberately ABSENT, because a violation there means our
  // identity plumbing is broken, not that the caller sent a bad id.
  'assignments_class_id_fkey',
  'assignments_section_id_fkey',
  'assignments_subject_id_fkey',
  'assignments_academic_year_id_fkey',
]);

/** Postgres SQLSTATE for foreign_key_violation. The only code this maps. */
export const SQLSTATE_FK_VIOLATION = '23503';

/**
 * Pulls the constraint name out of a Postgres `23503` message. Returns null
 * when the message is not in the expected shape — in which case the caller
 * must fall back to 500 rather than guess.
 */
export function constraintNameFrom(message: string | undefined): string | null {
  if (!message) return null;
  const m = /violates foreign key constraint "([^"]+)"/.exec(message);
  return m ? m[1] : null;
}

/**
 * The whole decision, in one place: is this Prisma error a foreign-key
 * violation on a column the caller supplied?
 *
 * Handles the raw-SQL shape only (`P2010` + `meta.code === '23503'`). The typed
 * client's `P2003` is deliberately NOT handled: ruling 2 removed its single
 * reachable call site (an unchecked `planId` in super-admin onboard) with a
 * real existence check instead. There is no second P2003 site to justify
 * filter-level work, and adding speculative handling here would imply coverage
 * that does not exist.
 */
export function callerSuppliedFkViolation(
  prismaCode: string,
  meta: unknown,
): { constraint: string } | null {
  if (prismaCode !== 'P2010') return null;
  const m = meta as { code?: unknown; message?: unknown } | undefined;
  if (!m || m.code !== SQLSTATE_FK_VIOLATION) return null;
  const constraint = constraintNameFrom(
    typeof m.message === 'string' ? m.message : undefined,
  );
  if (!constraint || !CALLER_SUPPLIED_FK_CONSTRAINTS.has(constraint)) return null;
  return { constraint };
}

/**
 * ── Adding to the allowlist ──────────────────────────────────────────────────
 *
 * Before adding a constraint, confirm ALL of:
 *
 *  1. The column is populated from the REQUEST (a DTO field or a path param) —
 *     never from `@CurrentUser()`, the tenant context, or a server-computed id.
 *     `created_by` / `updated_by` / `marked_by` / `entered_by` / `assigned_by` /
 *     `tenant_id` / `overridden_by_user_id` never qualify.
 *  2. The violation is reachable on an INSERT or UPDATE. A `23503` raised by a
 *     DELETE is a different failure (a parent still has children) and is NOT
 *     covered here — Phase 0 §11 Q5 found no request path hard-deletes a
 *     parent, so that case is deliberately unbuilt.
 *  3. You have ALSO added or confirmed a real existence check at the call site.
 *     Per Phase 0 §11 Q2 this mapping is a BACKSTOP, not a replacement: the
 *     guard produces the specific, useful message ("Subject not found"), while
 *     this produces a generic one. An allowlist entry with no guard behind it
 *     is a worse outcome dressed up as a better one.
 */
