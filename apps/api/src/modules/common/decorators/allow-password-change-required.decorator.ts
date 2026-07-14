import { SetMetadata } from '@nestjs/common';

/** Metadata key: route stays reachable while must_change_password is set. */
export const ALLOW_PASSWORD_CHANGE_REQUIRED = 'allowPasswordChangeRequired';

/**
 * REG-1 §3 — mark a route as reachable by a user whose `must_change_password`
 * flag is set (i.e. change-password itself and logout). Every OTHER authenticated
 * route is blocked with 403 `PASSWORD_CHANGE_REQUIRED` by
 * PasswordChangeRequiredGuard.
 */
export const AllowPasswordChangeRequired = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED, true);
