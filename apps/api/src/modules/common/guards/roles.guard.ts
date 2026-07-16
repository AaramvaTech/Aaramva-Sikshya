import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../../auth/auth.types';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { errorBody } from '../errors/error-codes';

/**
 * Checks that req.user.role is in the set of roles attached by @Roles().
 * Always run AFTER JwtAuthGuard so req.user is populated.
 *
 * If no @Roles() metadata is present the route is accessible to any
 * authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const { user } = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    if (!user) {
      throw new ForbiddenException(errorBody('FORBIDDEN_ROLE', 'No authenticated user'));
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        errorBody(
          'FORBIDDEN_ROLE',
          `Role ${user.role} is not allowed. Required: ${required.join(', ')}`,
        ),
      );
    }

    return true;
  }
}
