import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/**
 * Attach required roles to a controller or route handler.
 * Must be combined with JwtAuthGuard + RolesGuard.
 *
 * Usage:
 *   @Roles(Role.PRINCIPAL, Role.SCHOOL_OWNER)
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Get('reports')
 *   getReports() { ... }
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
