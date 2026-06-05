export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: { page: number; limit: number; total: number };
}

export interface TenantInfo {
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  tenantId: string | null;
  tenantSlug: string | null;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  tenant: TenantInfo;
}

export interface MeResponse extends AuthUser {
  phone: string | null;
  avatarUrl: string | null;
  tenant: TenantInfo | null;
}

export type LoginDto = { email: string; password: string };
