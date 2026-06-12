import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../../auth/auth.types';

/**
 * Pulls the authenticated user (or a single property of it) from the request.
 * Usage:  @CurrentUser() user: AuthUser
 *         @CurrentUser('userId') userId: string
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): AuthUser | unknown => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    const user = request.user;
    return data ? (user as unknown as Record<string, unknown>)[data] : user;
  },
);
