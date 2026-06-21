import { ForbiddenException } from '@nestjs/common';
import { Role } from '../common/enums/role.enum';

/**
 * Roles allowed to read ANY staff member's confidential HR data
 * (leave balance, salary history). Everyone else may read only their own.
 */
const HR_READ_ANY: ReadonlyArray<Role> = [
  Role.PLATFORM_ADMIN,
  Role.SCHOOL_OWNER,
  Role.PRINCIPAL,
];

/**
 * BUG-2 confidentiality guard. Throws ForbiddenException unless the caller is
 * the target staff member themselves OR an admin/principal. Does not affect the
 * intentional teacher soft-scope for section actions — this is HR reads only.
 *
 * Defensive default: if caller context is missing, deny (fail closed).
 */
export function assertSelfOrHrAdmin(
  targetUserId: string,
  callerId?: string,
  callerRole?: Role,
): void {
  if (callerRole && HR_READ_ANY.includes(callerRole)) return;
  if (callerId && callerId === targetUserId) return;
  throw new ForbiddenException(
    'You may only view your own HR records unless you are an admin or principal',
  );
}
