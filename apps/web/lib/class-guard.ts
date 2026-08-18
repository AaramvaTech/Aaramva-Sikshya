import { apiErrorCode } from '@/lib/api-errors';
import type { BillFeeStructure, ClassWithSections } from '@/types/api.types';

/**
 * FEE-CLASS-GUARD (web half of spec §3) — the client-side mirror of the API's
 * `bill-class-guard.util.ts`, used to warn the admin BEFORE submit.
 *
 * This is ADVISORY ONLY. The server re-checks on every write and is the sole
 * authority; a UI that disagreed with it would still be corrected by a real
 * 422 CLASS_MISMATCH. Never treat a `false` here as permission.
 *
 * Comparison is by NAME, not id, because `StudentDetail` carries only
 * `className`/`sectionName` (no ids) — see the note in
 * `fee-structure-assignment-panel.tsx`. That is sound within a tenant: the
 * schema has UNIQUE(name) on classes and UNIQUE(class_id, name) on sections,
 * so name equality and id equality coincide.
 */

export interface ClassScope {
  className: string | null;
  sectionName: string | null;
}

/**
 * Mirrors the server rule exactly:
 *  - a structure with no section applies to the whole class (student's own
 *    section is then irrelevant);
 *  - a student with no class is a mismatch — it cannot be confirmed as a
 *    match, and the guard blocks rather than waves through (spec addendum A1).
 */
export function isClassMismatch(structure: ClassScope, student: ClassScope): boolean {
  if (!student.className || student.className !== structure.className) return true;
  return structure.sectionName !== null && student.sectionName !== structure.sectionName;
}

/**
 * Spec §3: "Do not silently submit with the override flag — the admin must see
 * the warning each time." One shared expression rather than the same ternary in
 * both forms, so the rule can be asserted once and cannot drift between them.
 *
 * Returns an EMPTY object (not `false`) when the flag doesn't apply — the API
 * treats absent and false identically, and spreading `{}` keeps the flag out of
 * the request body entirely, which is easier to verify in a network log.
 */
export function overrideFlag(
  mismatch: boolean,
  confirmed: boolean,
): { allowCrossClassAssignment?: true } {
  return mismatch && confirmed ? { allowCrossClassAssignment: true } : {};
}

/** "Grade 1" / "Grade 1 — A" / "(no class)" — matches the server's phrasing. */
export function describeScope(scope: ClassScope): string {
  if (!scope.className) return '(no class)';
  return scope.sectionName ? `${scope.className} — ${scope.sectionName}` : scope.className;
}

/**
 * Resolve a fee structure's classId/sectionId to names via the class list.
 *
 * Returns `null` when it cannot be resolved yet — `useClasses()` is async, and
 * a half-loaded list would otherwise resolve every structure to "no class" and
 * fire a warning on a perfectly matching assignment. Callers MUST treat null as
 * "don't know yet, show nothing", never as "mismatch". (Same async-gate
 * discipline as the WEB-P Phase 2/3 `enabled` fixes.)
 */
export function resolveStructureScope(
  classes: ClassWithSections[] | undefined,
  structure: Pick<BillFeeStructure, 'classId' | 'sectionId'> | undefined,
): ClassScope | null {
  if (!classes || !structure) return null;
  const cls = classes.find((c) => c.id === structure.classId);
  if (!cls) return null;
  if (!structure.sectionId) return { className: cls.name, sectionName: null };
  const section = cls.sections.find((s) => s.id === structure.sectionId);
  if (!section) return null;
  return { className: cls.name, sectionName: section.name };
}

/** Both sides of the server's 422 body, in the same shape the warning renders. */
export interface ServerClassMismatch {
  structure: ClassScope;
  target: ClassScope;
}

function readScope(raw: unknown): ClassScope {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    className: typeof o.className === 'string' ? o.className : null,
    sectionName: typeof o.sectionName === 'string' ? o.sectionName : null,
  };
}

/**
 * The client rule above is advisory and CAN miss — the student's class may
 * have changed since the page loaded, another admin may have re-scoped the
 * structure, or the two name lookups may simply be stale. When it misses, the
 * server answers `422 CLASS_MISMATCH` and the admin would otherwise be stuck
 * with a dead-end toast.
 *
 * This turns that response back into the same two scopes the inline warning
 * takes, so the form can offer the identical confirm-and-retry path. The
 * server's own account of the mismatch is authoritative and REPLACES whatever
 * the client thought — that is the whole point of the fallback.
 *
 * Returns non-null for ANY `CLASS_MISMATCH`, even one whose `details` are
 * missing or malformed: a usable path forward matters more than a pretty
 * label, and a mismatch with no path forward is the bug being fixed here.
 */
export function parseClassMismatchError(err: unknown): ServerClassMismatch | null {
  if (apiErrorCode(err) !== 'CLASS_MISMATCH') return null;
  const details = (err as {
    response?: { data?: { error?: { details?: { feeStructure?: unknown; target?: unknown } | null } } };
  })?.response?.data?.error?.details;
  return { structure: readScope(details?.feeStructure), target: readScope(details?.target) };
}
