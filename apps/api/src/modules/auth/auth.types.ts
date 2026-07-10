import { Role } from '../common/enums/role.enum';

/** The signed JWT access-token payload. */
export interface JwtPayload {
  sub: string; // userId
  email: string;
  role: Role;
  tenantId: string | null; // null for PLATFORM_ADMIN
  tenantSlug: string | null; // null for PLATFORM_ADMIN
  imp?: boolean; // true when minted via super-admin impersonation
  imp_by?: string; // super-admin user id that started the impersonation
}

/** The shape attached to req.user after JWT validation. */
export interface AuthUser {
  userId: string;
  email: string;
  role: Role;
  tenantId: string | null; // null for PLATFORM_ADMIN
  tenantSlug: string | null; // null for PLATFORM_ADMIN
  imp?: boolean; // present so future guards can distinguish impersonated sessions
  imp_by?: string;
}
