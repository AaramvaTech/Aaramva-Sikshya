# Session 19 — Mobile Backend Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the NestJS API mobile-ready: mobile-aware auth, public tenant verify, device token registry, and parent↔child linkage — without changing any web behavior.

**Architecture:** All protocol differences (cookie vs. body token) are handled entirely in controllers via a `@ClientType()` decorator. Services stay pure — they receive plain arguments, no request objects. New tenant schema tables are added via `tenant-schema.sql` (the existing migration mechanism); a JSONB→relational migration for guardians is included for existing dev tenants.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 17, `@nestjs/throttler` (new install), class-validator, existing TenantPrismaService/TenantContextService patterns.

---

## Pre-flight: codebase state going into this plan

- `guardians` is a JSONB column on `students` (not a table) — we create the table and migrate
- `@nestjs/throttler` not installed — Task 1 installs it
- No `TenantController` exists — Task 5 creates it
- `AuthService.logout(token)` takes one arg — Task 4 adds optional `{ expoPushToken, userId }`
- The `tenant-schema.sql` is the migration mechanism for tenant schemas — append `CREATE TABLE IF NOT EXISTS` blocks

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `apps/api/src/modules/common/decorators/client-type.decorator.ts` | `@ClientType()` param decorator → `'web' \| 'mobile'` |
| `apps/api/src/modules/auth/dto/mobile-refresh.dto.ts` | `MobileRefreshDto` |
| `apps/api/src/modules/auth/dto/mobile-logout.dto.ts` | `MobileLogoutDto` |
| `apps/api/src/modules/tenant/tenant.controller.ts` | `GET /api/v1/tenants/verify/:slug` |
| `apps/api/src/modules/communication/device-token.service.ts` | Upsert/delete device tokens |
| `apps/api/src/modules/communication/dto/device-token.dto.ts` | `RegisterDeviceDto` |
| `apps/api/src/modules/student/guardian.service.ts` | Create guardian account + my-children |
| `apps/api/src/modules/student/dto/create-guardian-account.dto.ts` | Admin creates parent login |
| `apps/api/src/modules/auth/__tests__/auth-mobile.service.spec.ts` | 6 mobile auth test scenarios |
| `apps/api/src/modules/tenant/__tests__/tenant.controller.spec.ts` | 3 tenant verify test scenarios |
| `apps/api/src/modules/communication/__tests__/device-token.service.spec.ts` | 5 device token test scenarios |
| `apps/api/src/modules/student/__tests__/guardian.service.spec.ts` | 5 guardian/parent test scenarios |

### Modified files
| File | What changes |
|------|-------------|
| `apps/api/src/modules/auth/auth.controller.ts` | All 3 auth endpoints get `@ClientType()` logic |
| `apps/api/src/modules/auth/auth.service.ts` | `logout()` gains optional `expoPushToken`+`userId` |
| `apps/api/src/modules/tenant/tenant.module.ts` | Add `TenantController` |
| `apps/api/src/modules/tenant/tenant-schema.sql` | Add `guardians` + `device_tokens` + migration |
| `apps/api/src/modules/communication/communication.controller.ts` | Add device endpoints |
| `apps/api/src/modules/communication/communication.module.ts` | Add `DeviceTokenService` |
| `apps/api/src/modules/student/student.service.ts` | `admitStudent()` dual-writes to `guardians` table |
| `apps/api/src/modules/student/student.controller.ts` | Add guardian account + my-children routes |
| `apps/api/src/modules/student/student.module.ts` | Add `GuardianService` |
| `apps/api/src/app.module.ts` | `ThrottlerModule`, exclude tenant verify from TenantMiddleware |
| `CLAUDE.md` | Document X-Client-Type, DeviceToken hard-delete, Guardian.userId |
| `LEARNING-GUIDE.md` | Append Session 19 section |

---

## Task 1: Install throttler + update AppModule exclusions

**Files:**
- Modify: `apps/api/package.json` (via npm install)
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Install @nestjs/throttler**

```bash
cd apps/api && npm install @nestjs/throttler
```

Expected: installs cleanly, added to `dependencies` in `package.json`.

- [ ] **Step 2: Update app.module.ts — add ThrottlerModule and exclude tenant verify from middleware**

Replace the current AppModule:

```typescript
// apps/api/src/app.module.ts
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { TenantMiddleware } from './modules/tenant/tenant.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { StudentModule } from './modules/student/student.module';
import { AcademicModule } from './modules/academic/academic.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { FinanceModule } from './modules/finance/finance.module';
import { JobsModule } from './jobs/jobs.module';
import { HrModule } from './modules/hr/hr.module';
import { ExaminationModule } from './modules/examination/examination.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { LibraryModule } from './modules/library/library.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { SettingsModule } from './modules/settings/settings.module';

const redisAvailable = process.env.REDIS_ENABLED !== 'false' &&
  !!(process.env.REDIS_URL || process.env.REDIS_HOST);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    PrismaModule,
    TenantModule,
    AuthModule,
    StudentModule,
    AcademicModule,
    AttendanceModule,
    FinanceModule,
    HrModule,
    ...(redisAvailable ? [JobsModule] : []),
    ExaminationModule,
    CommunicationModule,
    DashboardModule,
    LibraryModule,
    SuperAdminModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'api/v1/super-admin/(.*)', method: RequestMethod.ALL },
        { path: 'api/v1/tenants/verify/(.*)', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
cd apps/api && npm test -- --testPathPattern=auth.service.spec --no-coverage
```

Expected: all existing auth tests pass.

---

## Task 2: `@ClientType()` param decorator

**Files:**
- Create: `apps/api/src/modules/common/decorators/client-type.decorator.ts`

- [ ] **Step 1: Create the decorator**

```typescript
// apps/api/src/modules/common/decorators/client-type.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type ClientType = 'web' | 'mobile';

export const ClientType = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientType => {
    const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    return request.headers['x-client-type'] === 'mobile' ? 'mobile' : 'web';
  },
);
```

> Note: `ClientType` is both the type and the decorator (same name) — NestJS uses this pattern exactly as `@CurrentUser()` does. TypeScript can distinguish them by context.

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

---

## Task 3: Mobile auth DTOs

**Files:**
- Create: `apps/api/src/modules/auth/dto/mobile-refresh.dto.ts`
- Create: `apps/api/src/modules/auth/dto/mobile-logout.dto.ts`

- [ ] **Step 1: Create MobileRefreshDto**

```typescript
// apps/api/src/modules/auth/dto/mobile-refresh.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class MobileRefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
```

- [ ] **Step 2: Create MobileLogoutDto**

```typescript
// apps/api/src/modules/auth/dto/mobile-logout.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MobileLogoutDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @IsString()
  @IsOptional()
  expoPushToken?: string;
}
```

---

## Task 4: Modify AuthService + AuthController for mobile

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`
- Modify: `apps/api/src/modules/auth/auth.controller.ts`

### 4a: Update AuthService.logout()

- [ ] **Step 1: Add optional logout options to AuthService**

Change the `logout` method signature and body (keep everything else unchanged):

```typescript
// In auth.service.ts — replace the logout method only
async logout(
  refreshToken: string | undefined,
  options?: { expoPushToken?: string; userId?: string },
): Promise<void> {
  this.tenantContext.getOrThrow();
  if (refreshToken) {
    const tokenHash = this.hashToken(refreshToken);
    await this.tenantPrisma.execute(
      `DELETE FROM refresh_tokens WHERE token_hash = $1`,
      tokenHash,
    );
  }
  if (options?.expoPushToken && options?.userId) {
    await this.tenantPrisma.execute(
      `DELETE FROM device_tokens WHERE token = $1 AND user_id = $2::uuid`,
      options.expoPushToken,
      options.userId,
    );
  }
}
```

### 4b: Update AuthController — full replacement

- [ ] **Step 2: Replace auth.controller.ts with mobile-aware version**

```typescript
// apps/api/src/modules/auth/auth.controller.ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientType } from '../common/decorators/client-type.decorator';
import type { ClientType as ClientTypeValue } from '../common/decorators/client-type.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { CreateSchoolDto } from './dto/create-school.dto';
import { LoginDto } from './dto/login.dto';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register-school')
  async registerSchool(
    @Body() dto: CreateSchoolDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return {
      accessToken: result.accessToken,
      school: result.school,
      user: result.user,
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @ClientType() clientType: ClientTypeValue,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    if (clientType === 'mobile') {
      return {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: result.user,
        tenant: result.tenant,
      };
    }
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken, user: result.user, tenant: result.tenant };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @ClientType() clientType: ClientTypeValue,
    @Res({ passthrough: true }) res: Response,
  ) {
    let token: string | undefined;
    if (clientType === 'mobile') {
      token = typeof body?.refreshToken === 'string' ? body.refreshToken : undefined;
    } else {
      token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    }

    const result = await this.authService.refresh(token);

    if (clientType === 'mobile') {
      return { accessToken: result.accessToken, refreshToken: result.refreshToken };
    }
    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logout(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
    @ClientType() clientType: ClientTypeValue,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      clientType === 'mobile'
        ? (typeof body?.refreshToken === 'string' ? body.refreshToken : undefined)
        : (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];

    const expoPushToken =
      typeof body?.expoPushToken === 'string' ? body.expoPushToken : undefined;

    await this.authService.logout(token, { expoPushToken, userId: user?.userId });

    if (clientType === 'web') {
      res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    }
    return { loggedOut: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthUser) {
    return this.authService.getMe(user);
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: expiresAt.getTime() - Date.now(),
      path: REFRESH_COOKIE_PATH,
    });
  }
}
```

- [ ] **Step 3: Verify types compile**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

---

## Task 5: Write mobile auth unit tests (6 scenarios)

**Files:**
- Create: `apps/api/src/modules/auth/__tests__/auth-mobile.service.spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// apps/api/src/modules/auth/__tests__/auth-mobile.service.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantProvisioningService } from '../../super-admin/tenant-provisioning.service';

const mockTenantCtx = { tenantId: 'tid-1', slug: 'testschool', schemaName: 'tenant_testschool' };

const mockUser = {
  id: 'uid-1',
  email: 'ram@test.edu.np',
  role: 'SCHOOL_OWNER',
  password_hash: '',
  is_active: true,
};

const mockTenant = { name: 'Test School', logoUrl: null };

describe('AuthService — mobile client behaviour', () => {
  let authService: AuthService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: TenantProvisioningService, useValue: { provision: jest.fn() } },
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        {
          provide: TenantContextService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(mockTenantCtx),
            run: jest.fn().mockImplementation((_ctx: unknown, fn: () => unknown) => fn()),
          },
        },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('mock.jwt.token') } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('test-secret') } },
      ],
    }).compile();

    authService = module.get(AuthService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
  });

  // Test 1: login returns refresh token in response (service layer always returns it)
  it('login() always returns refreshToken in result (controller decides delivery)', async () => {
    const hash = await bcrypt.hash('Secret123', 1);
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([{ ...mockUser, password_hash: hash }])
      .mockResolvedValueOnce([mockTenant]);
    (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

    const result = await authService.login({ email: 'ram@test.edu.np', password: 'Secret123' });

    expect(result.refreshToken).toBeTruthy();
    expect(result.accessToken).toBe('mock.jwt.token');
  });

  // Test 2: refresh() always returns refreshToken in result (rotation)
  it('refresh() always returns new refreshToken (rotation — controller decides delivery)', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
      id: 'rt-1',
      user_id: 'uid-1',
      expires_at: new Date(Date.now() + 60_000),
      email: 'ram@test.edu.np',
      role: 'SCHOOL_OWNER',
    }]);
    (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

    const result = await authService.refresh('some-valid-uuid');

    expect(result.refreshToken).toBeTruthy();
    expect(result.accessToken).toBe('mock.jwt.token');
  });

  // Test 3: refresh() with undefined token → 401 (missing body token on mobile = hard 401)
  it('refresh() throws 401 when token is undefined (no fallback)', async () => {
    await expect(authService.refresh(undefined)).rejects.toThrow(UnauthorizedException);
  });

  // Test 4: refresh() with expired token → 401
  it('refresh() throws 401 for expired token', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([{
      id: 'rt-1',
      user_id: 'uid-1',
      expires_at: new Date(Date.now() - 1000),
      email: 'ram@test.edu.np',
      role: 'SCHOOL_OWNER',
    }]);

    await expect(authService.refresh('expired-token')).rejects.toThrow(UnauthorizedException);
  });

  // Test 5: logout() revokes token (web behaviour unchanged)
  it('logout() revokes the refresh token', async () => {
    (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

    await authService.logout('some-refresh-token');

    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM refresh_tokens'),
      expect.any(String),
    );
  });

  // Test 6: logout() with expoPushToken deletes device token row
  it('logout() with expoPushToken deletes the matching device token for the user', async () => {
    (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

    await authService.logout('some-refresh-token', {
      expoPushToken: 'ExponentPushToken[abc123]',
      userId: 'uid-1',
    });

    expect(tenantPrisma.execute).toHaveBeenCalledTimes(2);
    const secondCall = (tenantPrisma.execute as jest.Mock).mock.calls[1];
    expect(secondCall[0]).toContain('DELETE FROM device_tokens');
    expect(secondCall[1]).toBe('ExponentPushToken[abc123]');
    expect(secondCall[2]).toBe('uid-1');
  });
});
```

- [ ] **Step 2: Run the new tests**

```bash
cd apps/api && npm test -- --testPathPattern=auth-mobile.service.spec --no-coverage
```

Expected: 6 tests pass.

- [ ] **Step 3: Run all auth tests to confirm no regression**

```bash
cd apps/api && npm test -- --testPathPattern=auth --no-coverage
```

Expected: all auth tests pass.

---

## Task 6: Public tenant verify endpoint

**Files:**
- Create: `apps/api/src/modules/tenant/tenant.controller.ts`
- Modify: `apps/api/src/modules/tenant/tenant.module.ts`

### 6a: Create TenantController

- [ ] **Step 1: Create tenant.controller.ts**

```typescript
// apps/api/src/modules/tenant/tenant.controller.ts
import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('tenants')
export class TenantController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public endpoint — no auth, no tenant middleware.
   * Returns school name/logo for mobile "school code" screen.
   * Identical 404 for nonexistent, suspended, and deleted schools
   * (prevents slug enumeration revealing platform state).
   */
  @Get('verify/:slug')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifySlug(@Param('slug') rawSlug: string) {
    const slug = rawSlug.toLowerCase();

    const tenant = await this.prisma.tenant.findFirst({
      where: { slug, isActive: true, deletedAt: null },
      select: { slug: true, name: true, logoUrl: true, address: true },
    });

    if (!tenant) {
      throw new NotFoundException('School not found');
    }

    return {
      slug: tenant.slug,
      name: tenant.name,
      logoUrl: tenant.logoUrl ?? null,
      address: tenant.address ?? null,
    };
  }
}
```

### 6b: Update TenantModule

- [ ] **Step 2: Add TenantController to TenantModule**

```typescript
// apps/api/src/modules/tenant/tenant.module.ts
import { Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { TenantMiddleware } from './tenant.middleware';
import { TenantPrismaService } from './tenant-prisma.service';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';

@Module({
  controllers: [TenantController],
  providers: [TenantService, TenantContextService, TenantPrismaService, TenantMiddleware],
  exports: [TenantService, TenantContextService, TenantPrismaService],
})
export class TenantModule {}
```

- [ ] **Step 3: Verify compilation**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

---

## Task 7: Write tenant verify unit tests (3 scenarios)

**Files:**
- Create: `apps/api/src/modules/tenant/__tests__/tenant.controller.spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// apps/api/src/modules/tenant/__tests__/tenant.controller.spec.ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TenantController } from '../tenant.controller';
import { PrismaService } from '../../../prisma/prisma.service';

const mockActiveTenant = {
  slug: 'sunrise-ktm',
  name: 'Sunrise Secondary School',
  logoUrl: 'https://cdn.example.com/sunrise.png',
  address: 'Kathmandu',
};

describe('TenantController.verifySlug()', () => {
  let controller: TenantController;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      tenant: { findFirst: jest.fn() },
    };

    const module = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(TenantController);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  // Test 7: active slug → 200 with name/logo
  it('returns 200 with tenant info for an active slug', async () => {
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValueOnce(mockActiveTenant);

    const result = await controller.verifySlug('sunrise-ktm');

    expect(result.slug).toBe('sunrise-ktm');
    expect(result.name).toBe('Sunrise Secondary School');
    expect(result.logoUrl).toBe('https://cdn.example.com/sunrise.png');
    expect(result.address).toBe('Kathmandu');
  });

  // Test 8: suspended/nonexistent slug → same 404
  it('throws 404 for a nonexistent slug (same as suspended — no leaking)', async () => {
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValueOnce(null);

    await expect(controller.verifySlug('no-such-school')).rejects.toThrow(NotFoundException);
  });

  // Test 9: uppercase input → normalized to lowercase, still 200
  it('normalizes uppercase slug to lowercase before lookup', async () => {
    (prisma.tenant.findFirst as jest.Mock).mockResolvedValueOnce(mockActiveTenant);

    await controller.verifySlug('SUNRISE-KTM');

    expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ slug: 'sunrise-ktm' }) }),
    );
  });
});
```

- [ ] **Step 2: Run the new tests**

```bash
cd apps/api && npm test -- --testPathPattern=tenant.controller.spec --no-coverage
```

Expected: 3 tests pass.

---

## Task 8: Update tenant-schema.sql — add guardians + device_tokens tables

**Files:**
- Modify: `apps/api/src/modules/tenant/tenant-schema.sql`

- [ ] **Step 1: Append guardians table + JSONB migration to tenant-schema.sql**

Append the following to the END of `tenant-schema.sql`:

```sql
-- ─── GUARDIANS (normalized — replaces JSONB guardians column on students) ────
-- IDs preserved from existing JSONB data so guardianId URL params still work.
CREATE TABLE IF NOT EXISTS guardians (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relation    VARCHAR(50) NOT NULL,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100),
  phone       VARCHAR(20),
  email       VARCHAR(255),
  is_primary  BOOLEAN     NOT NULL DEFAULT false,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guardians_student ON guardians(student_id);
CREATE INDEX IF NOT EXISTS idx_guardians_user    ON guardians(user_id) WHERE user_id IS NOT NULL;

-- Migrate existing JSONB guardian data into the new table.
-- Uses the 'id' field already embedded in each JSONB element so URL params stay valid.
-- ON CONFLICT (id) DO NOTHING makes this idempotent (safe to re-run).
INSERT INTO guardians (id, student_id, relation, first_name, last_name, phone, email, is_primary)
SELECT
  COALESCE((g->>'id')::uuid, gen_random_uuid()),
  s.id,
  COALESCE(g->>'relation', 'GUARDIAN'),
  COALESCE(g->>'firstName', ''),
  g->>'lastName',
  g->>'phone',
  g->>'email',
  COALESCE((g->>'isPrimary')::boolean, false)
FROM students s,
     jsonb_array_elements(s.guardians) g
WHERE s.guardians IS NOT NULL
  AND jsonb_typeof(s.guardians) = 'array'
ON CONFLICT (id) DO NOTHING;

-- ─── DEVICE TOKENS ───────────────────────────────────────────────────────────
-- Hard delete (no deletedAt) — deliberate convention exception.
-- Stale tokens cause failed push sends with zero audit value.
-- See CLAUDE.md for the documented exception.
CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(200) NOT NULL UNIQUE,
  platform    VARCHAR(10)  NOT NULL CHECK (platform IN ('ANDROID', 'IOS')),
  device_name VARCHAR(100),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
```

- [ ] **Step 2: Run the migration on the local dev tenant schema**

This must be run once against each existing tenant schema in your dev database. Replace `tenant_yourslug` with your actual schema name(s).

```sql
-- Run in psql or pgAdmin, connected to aaramva_shikshya:
SET search_path TO tenant_yourslug;

CREATE TABLE IF NOT EXISTS guardians (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  relation    VARCHAR(50) NOT NULL,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100),
  phone       VARCHAR(20),
  email       VARCHAR(255),
  is_primary  BOOLEAN     NOT NULL DEFAULT false,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guardians_student ON guardians(student_id);
CREATE INDEX IF NOT EXISTS idx_guardians_user    ON guardians(user_id) WHERE user_id IS NOT NULL;

INSERT INTO guardians (id, student_id, relation, first_name, last_name, phone, email, is_primary)
SELECT
  COALESCE((g->>'id')::uuid, gen_random_uuid()),
  s.id,
  COALESCE(g->>'relation', 'GUARDIAN'),
  COALESCE(g->>'firstName', ''),
  g->>'lastName',
  g->>'phone',
  g->>'email',
  COALESCE((g->>'isPrimary')::boolean, false)
FROM students s, jsonb_array_elements(s.guardians) g
WHERE s.guardians IS NOT NULL AND jsonb_typeof(s.guardians) = 'array'
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS device_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       VARCHAR(200) NOT NULL UNIQUE,
  platform    VARCHAR(10)  NOT NULL CHECK (platform IN ('ANDROID', 'IOS')),
  device_name VARCHAR(100),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
```

---

## Task 9: DeviceTokenService + DTO

**Files:**
- Create: `apps/api/src/modules/communication/dto/device-token.dto.ts`
- Create: `apps/api/src/modules/communication/device-token.service.ts`
- Modify: `apps/api/src/modules/communication/communication.module.ts`
- Modify: `apps/api/src/modules/communication/communication.controller.ts`

### 9a: DTO

- [ ] **Step 1: Create device-token.dto.ts**

```typescript
// apps/api/src/modules/communication/dto/device-token.dto.ts
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @Matches(/^ExponentPushToken\[.+\]$/, {
    message: 'token must be in ExponentPushToken[xxx] format',
  })
  token!: string;

  @IsIn(['ANDROID', 'IOS'])
  platform!: 'ANDROID' | 'IOS';

  @IsOptional()
  @IsString()
  deviceName?: string;
}

export interface DeviceTokenRow {
  id: string;
  user_id: string;
  token: string;
  platform: string;
  device_name: string | null;
  last_seen_at: Date | string;
  created_at: Date | string;
}
```

### 9b: DeviceTokenService

- [ ] **Step 2: Create device-token.service.ts**

```typescript
// apps/api/src/modules/communication/device-token.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { RegisterDeviceDto, DeviceTokenRow } from './dto/device-token.dto';

@Injectable()
export class DeviceTokenService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Upsert by token value.
   * - New token → INSERT for current user.
   * - Existing token, same user → update lastSeenAt/platform/deviceName.
   * - Existing token, different user → reassign to current user.
   * All three cases handled by a single UPSERT.
   */
  async register(userId: string, dto: RegisterDeviceDto) {
    const rows = await this.tenantPrisma.query<DeviceTokenRow>(
      `INSERT INTO device_tokens (user_id, token, platform, device_name, last_seen_at)
       VALUES ($1::uuid, $2, $3, $4, NOW())
       ON CONFLICT (token) DO UPDATE
         SET user_id      = EXCLUDED.user_id,
             platform     = EXCLUDED.platform,
             device_name  = EXCLUDED.device_name,
             last_seen_at = NOW()
       RETURNING *`,
      userId,
      dto.token,
      dto.platform,
      dto.deviceName ?? null,
    );

    const row = rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      token: row.token,
      platform: row.platform,
      deviceName: row.device_name,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    };
  }

  /**
   * Delete a device token only if it belongs to the requesting user.
   * Returns 404 (not 403) when token belongs to someone else — avoids confirming
   * whether the token exists under a different account.
   */
  async remove(userId: string, token: string): Promise<void> {
    const affected = await this.tenantPrisma.execute(
      `DELETE FROM device_tokens WHERE token = $1 AND user_id = $2::uuid`,
      token,
      userId,
    );
    if (affected === 0) {
      throw new NotFoundException('Device token not found');
    }
  }
}
```

### 9c: Update CommunicationModule

- [ ] **Step 3: Add DeviceTokenService to CommunicationModule**

```typescript
// apps/api/src/modules/communication/communication.module.ts
import { Module } from '@nestjs/common';
import { CommunicationController } from './communication.controller';
import { SmsService } from './sms.service';
import { NoticeService } from './notice.service';
import { NotificationService } from './notification.service';
import { AttendanceListener } from './listeners/attendance.listener';
import { FinanceListener } from './listeners/finance.listener';
import { DeviceTokenService } from './device-token.service';

@Module({
  controllers: [CommunicationController],
  providers: [
    SmsService,
    NoticeService,
    NotificationService,
    AttendanceListener,
    FinanceListener,
    DeviceTokenService,
  ],
  exports: [SmsService, NoticeService, NotificationService, DeviceTokenService],
})
export class CommunicationModule {}
```

### 9d: Add device routes to CommunicationController

- [ ] **Step 4: Add device endpoints to communication.controller.ts**

Add these imports at the top of the existing controller:

```typescript
import { DeviceTokenService } from './device-token.service';
import { RegisterDeviceDto } from './dto/device-token.dto';
```

Inject `DeviceTokenService` in the constructor:

```typescript
constructor(
  private readonly noticeService: NoticeService,
  private readonly smsService: SmsService,
  private readonly notificationService: NotificationService,
  private readonly deviceTokenService: DeviceTokenService,
) {}
```

Add these routes after the notifications section (before the class closing brace):

```typescript
  // ─── Device Tokens ────────────────────────────────────────────────────────

  @Post('devices')
  @Roles(...ALL_ROLES)
  registerDevice(
    @Body() dto: RegisterDeviceDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.deviceTokenService.register(user.userId, dto);
  }

  @Delete('devices/:token')
  @HttpCode(204)
  @Roles(...ALL_ROLES)
  removeDevice(
    @Param('token') token: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.deviceTokenService.remove(user.userId, token);
  }
```

Also add `HttpCode` to the imports at the top of the controller:

```typescript
import {
  Body, Controller, Delete, Get, HttpCode, Param,
  ParseUUIDPipe, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
```

- [ ] **Step 5: Verify compilation**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

---

## Task 10: Write device token unit tests (5 scenarios)

**Files:**
- Create: `apps/api/src/modules/communication/__tests__/device-token.service.spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// apps/api/src/modules/communication/__tests__/device-token.service.spec.ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DeviceTokenService } from '../device-token.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

const mockRow = {
  id: 'dt-uuid-1',
  user_id: 'uid-1',
  token: 'ExponentPushToken[abc123]',
  platform: 'ANDROID',
  device_name: 'Pixel 7',
  last_seen_at: new Date(),
  created_at: new Date(),
};

describe('DeviceTokenService', () => {
  let service: DeviceTokenService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DeviceTokenService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
      ],
    }).compile();

    service = module.get(DeviceTokenService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
  });

  // Test 10: new token → created for current user
  it('register() inserts a new token for the current user', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([mockRow]);

    const result = await service.register('uid-1', {
      token: 'ExponentPushToken[abc123]',
      platform: 'ANDROID',
      deviceName: 'Pixel 7',
    });

    expect(result.token).toBe('ExponentPushToken[abc123]');
    expect(result.userId).toBe('uid-1');
    // UPSERT query used
    const sql: string = (tenantPrisma.query as jest.Mock).mock.calls[0][0];
    expect(sql).toContain('ON CONFLICT (token) DO UPDATE');
  });

  // Test 11: same token, same user → updates lastSeenAt (no duplicate)
  it('register() updates lastSeenAt when token already belongs to the same user', async () => {
    const updatedRow = { ...mockRow, last_seen_at: new Date(Date.now() + 1000) };
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([updatedRow]);

    const result = await service.register('uid-1', {
      token: 'ExponentPushToken[abc123]',
      platform: 'ANDROID',
    });

    expect(result.token).toBe('ExponentPushToken[abc123]');
    // Only one DB call (UPSERT handles both cases)
    expect(tenantPrisma.query).toHaveBeenCalledTimes(1);
  });

  // Test 12: token owned by another user → reassigned (user_id updated)
  it('register() reassigns token from another user to current user', async () => {
    const reassignedRow = { ...mockRow, user_id: 'uid-2' };
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([reassignedRow]);

    const result = await service.register('uid-2', {
      token: 'ExponentPushToken[abc123]',
      platform: 'IOS',
    });

    expect(result.userId).toBe('uid-2');
    // Same UPSERT — ON CONFLICT DO UPDATE sets user_id = EXCLUDED.user_id
    const sql: string = (tenantPrisma.query as jest.Mock).mock.calls[0][0];
    expect(sql).toContain('user_id      = EXCLUDED.user_id');
  });

  // Test 13: invalid token format → DTO validation (test via DTO + class-validator)
  it('RegisterDeviceDto rejects a token that does not match ExponentPushToken[xxx] format', async () => {
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');
    const { RegisterDeviceDto } = await import('../dto/device-token.dto');

    const dto = plainToInstance(RegisterDeviceDto, {
      token: 'invalid-token-format',
      platform: 'ANDROID',
    });

    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });

  // Test 14: delete own token → success; delete someone else's → 404
  it('remove() throws NotFoundException when token does not belong to current user', async () => {
    (tenantPrisma.execute as jest.Mock).mockResolvedValueOnce(0); // 0 rows deleted

    await expect(
      service.remove('uid-1', 'ExponentPushToken[otherstoken]'),
    ).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the new tests**

```bash
cd apps/api && npm test -- --testPathPattern=device-token.service.spec --no-coverage
```

Expected: 5 tests pass.

---

## Task 11: GuardianService + update StudentService + StudentController

**Files:**
- Create: `apps/api/src/modules/student/dto/create-guardian-account.dto.ts`
- Create: `apps/api/src/modules/student/guardian.service.ts`
- Modify: `apps/api/src/modules/student/student.service.ts`
- Modify: `apps/api/src/modules/student/student.controller.ts`
- Modify: `apps/api/src/modules/student/student.module.ts`

### 11a: CreateGuardianAccountDto

- [ ] **Step 1: Create create-guardian-account.dto.ts**

```typescript
// apps/api/src/modules/student/dto/create-guardian-account.dto.ts
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateGuardianAccountDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password!: string;
}
```

### 11b: GuardianService

- [ ] **Step 2: Create guardian.service.ts**

```typescript
// apps/api/src/modules/student/guardian.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { CreateGuardianAccountDto } from './dto/create-guardian-account.dto';
import { Role } from '../common/enums/role.enum';

const BCRYPT_ROUNDS = 12;

interface GuardianRow {
  id: string;
  student_id: string;
  relation: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  user_id: string | null;
}

interface ChildRow {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  relation: string;
  class_name: string | null;
  section_name: string | null;
  roll_number: number | null;
}

@Injectable()
export class GuardianService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Creates (or links) a PARENT user account for a guardian row.
   * Admin-only; guarded at controller level.
   *
   * Cases:
   * 1. Guardian already has userId → 409
   * 2. Email belongs to existing PARENT → link that user (second-child case)
   * 3. Email belongs to non-PARENT user → 409
   * 4. Email not found → create new PARENT user, link
   */
  async createGuardianAccount(
    studentId: string,
    guardianId: string,
    dto: CreateGuardianAccountDto,
  ) {
    this.tenantContext.getOrThrow();

    // 1. Confirm guardian exists for this student
    const guardians = await this.tenantPrisma.query<GuardianRow>(
      `SELECT id, user_id FROM guardians WHERE id = $1::uuid AND student_id = $2::uuid`,
      guardianId,
      studentId,
    );
    if (!guardians[0]) {
      throw new NotFoundException('Guardian not found for this student');
    }
    const guardian = guardians[0];

    // 2. Already linked
    if (guardian.user_id) {
      throw new ConflictException('Guardian already has a user account');
    }

    // 3. Check if email already exists
    const existingUsers = await this.tenantPrisma.query<{ id: string; role: string }>(
      `SELECT id, role FROM users WHERE email = $1 AND deleted_at IS NULL`,
      dto.email,
    );
    const existing = existingUsers[0];

    let userId: string;

    if (existing) {
      if (existing.role !== Role.PARENT) {
        throw new ConflictException(
          'Email belongs to an existing non-PARENT user account',
        );
      }
      // Second-child case: link this guardian to the existing PARENT user
      userId = existing.id;
    } else {
      // Create new PARENT user
      const hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      const rows = await this.tenantPrisma.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, first_name, last_name, role)
         SELECT $1, $2,
           (SELECT first_name FROM guardians WHERE id = $3::uuid),
           (SELECT last_name  FROM guardians WHERE id = $3::uuid),
           $4
         RETURNING id`,
        dto.email,
        hash,
        guardianId,
        Role.PARENT,
      );
      userId = rows[0].id;
    }

    // 4. Link guardian → user
    await this.tenantPrisma.execute(
      `UPDATE guardians SET user_id = $1::uuid, updated_at = NOW() WHERE id = $2::uuid`,
      userId,
      guardianId,
    );

    return {
      userId,
      guardianId,
      email: dto.email,
      linked: true,
    };
  }

  /**
   * Returns all students where a guardian row has user_id = currentUser.id.
   * Excludes soft-deleted students.
   * Simple list (no pagination — parents won't have hundreds of children).
   */
  async getMyChildren(userId: string) {
    this.tenantContext.getOrThrow();

    const rows = await this.tenantPrisma.query<ChildRow>(
      `SELECT
         s.id,
         s.student_id,
         s.first_name,
         s.last_name,
         s.photo_url,
         g.relation,
         s.class_name,
         s.section_name,
         s.roll_number
       FROM guardians g
       JOIN students s ON s.id = g.student_id
       WHERE g.user_id = $1::uuid
         AND s.deleted_at IS NULL
       ORDER BY s.first_name`,
      userId,
    );

    return rows.map((r) => ({
      id: r.id,
      admissionNumber: r.student_id,
      firstName: r.first_name,
      lastName: r.last_name,
      photoUrl: r.photo_url,
      relation: r.relation,
      currentEnrollment:
        r.class_name
          ? {
              className: r.class_name,
              sectionName: r.section_name,
              rollNumber: r.roll_number,
            }
          : null,
    }));
  }
}
```

### 11c: Update StudentService.admitStudent() for dual-write

- [ ] **Step 3: Update admitStudent() in student.service.ts**

In the `admitStudent()` method, find the section that builds the guardian JSONB:
```typescript
dto.guardians?.length
  ? JSON.stringify(dto.guardians.map((g) => ({ id: randomUUID(), ...g })))
  : null,
```

Change the `admitStudent()` to dual-write. Replace the inner transaction block:

```typescript
// Before the INSERT, build guardian data with IDs
const guardianData = (dto.guardians ?? []).map((g) => ({
  id: randomUUID(),
  ...g,
}));

const rows = await tx.$queryRawUnsafe<StudentRow[]>(
  `INSERT INTO students (
     tenant_id, student_id, first_name, last_name, date_of_birth, gender,
     blood_group, religion, ethnicity, nationality, mother_tongue,
     phone, email, permanent_address, temporary_address, guardians,
     class_id, section_id, class_name, section_name, roll_number,
     admission_date, academic_year, previous_school, created_by
   ) VALUES (
     $1::uuid, $2, $3, $4, $5::date, $6,
     $7, $8, $9, $10, $11,
     $12, $13, $14::jsonb, $15::jsonb, $16::jsonb,
     $17::uuid, $18::uuid, $19, $20, $21,
     $22::date, $23, $24, $25::uuid
   ) RETURNING *`,
  tenantId, studentId,
  dto.firstName, dto.lastName, dto.dateOfBirth, dto.gender,
  dto.bloodGroup ?? null, dto.religion ?? null, dto.ethnicity ?? null,
  dto.nationality ?? 'Nepali', dto.motherTongue ?? null,
  dto.phone ?? null, dto.email ?? null,
  dto.permanentAddress ? JSON.stringify(dto.permanentAddress) : null,
  dto.temporaryAddress ? JSON.stringify(dto.temporaryAddress) : null,
  guardianData.length ? JSON.stringify(guardianData) : null,
  classIdToInsert, sectionIdToInsert,
  classNameToInsert, sectionNameToInsert, dto.rollNumber ?? null,
  dto.admissionDate, academicYearToInsert,
  dto.previousSchool ?? null, createdById,
);

const student = rows[0];

// Dual-write: insert each guardian into the relational table
for (const g of guardianData) {
  await tx.$queryRawUnsafe(
    `INSERT INTO guardians (id, student_id, relation, first_name, last_name, phone, email, is_primary)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING`,
    g.id,
    student.id,
    g.relation,
    g.firstName,
    g.lastName,
    g.phone,
    g.email ?? null,
    g.isPrimary,
  );
}

return student;
```

> Note: The `const row = rows[0]; return toStudentResponse(row);` at the outer level must now reference `student` returned from the inner block. The outer `catch` and retry logic stays the same.

The full updated `admitStudent` try-block becomes:

```typescript
const row = await this.tenantPrisma.run(async (tx) => {
  const admissionDate = new Date(dto.admissionDate);
  if (isNaN(admissionDate.getTime())) {
    throw new BadRequestException('Invalid admission date');
  }
  const minAdDate = new Date('1943-04-14');
  const maxAdDate = new Date('2043-04-13');
  if (admissionDate < minAdDate || admissionDate > maxAdDate) {
    throw new BadRequestException('Admission date must be within BS calendar range (2000–2100 BS)');
  }

  const studentId = await this.generateStudentId(tx, admissionDate);

  let classIdToInsert: string | null = null;
  let sectionIdToInsert: string | null = null;
  let classNameToInsert: string | null = dto.className ?? null;
  let sectionNameToInsert: string | null = dto.sectionName ?? null;
  let academicYearToInsert: string | null = dto.academicYear ?? null;

  if (dto.classId && dto.sectionId) {
    const classRows = await tx.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM classes WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.classId,
    );
    if (!classRows[0]) throw new NotFoundException('Class not found');

    const sectionRows = await tx.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sections WHERE id = $1::uuid AND class_id = $2::uuid AND deleted_at IS NULL`,
      dto.sectionId, dto.classId,
    );
    if (!sectionRows[0]) throw new NotFoundException('Section not found');

    classIdToInsert = dto.classId;
    sectionIdToInsert = dto.sectionId;
    classNameToInsert = classRows[0].name;
    sectionNameToInsert = sectionRows[0].name;
  }

  if (dto.academicYearId) {
    const yearRows = await tx.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM academic_years WHERE id = $1::uuid AND deleted_at IS NULL`,
      dto.academicYearId,
    );
    if (yearRows[0]) academicYearToInsert = yearRows[0].name;
  }

  const guardianData = (dto.guardians ?? []).map((g) => ({ id: randomUUID(), ...g }));

  const studentRows = await tx.$queryRawUnsafe<StudentRow[]>(
    `INSERT INTO students (
       tenant_id, student_id, first_name, last_name, date_of_birth, gender,
       blood_group, religion, ethnicity, nationality, mother_tongue,
       phone, email, permanent_address, temporary_address, guardians,
       class_id, section_id, class_name, section_name, roll_number,
       admission_date, academic_year, previous_school, created_by
     ) VALUES (
       $1::uuid, $2, $3, $4, $5::date, $6,
       $7, $8, $9, $10, $11,
       $12, $13, $14::jsonb, $15::jsonb, $16::jsonb,
       $17::uuid, $18::uuid, $19, $20, $21,
       $22::date, $23, $24, $25::uuid
     ) RETURNING *`,
    tenantId, studentId,
    dto.firstName, dto.lastName, dto.dateOfBirth, dto.gender,
    dto.bloodGroup ?? null, dto.religion ?? null, dto.ethnicity ?? null,
    dto.nationality ?? 'Nepali', dto.motherTongue ?? null,
    dto.phone ?? null, dto.email ?? null,
    dto.permanentAddress ? JSON.stringify(dto.permanentAddress) : null,
    dto.temporaryAddress ? JSON.stringify(dto.temporaryAddress) : null,
    guardianData.length ? JSON.stringify(guardianData) : null,
    classIdToInsert, sectionIdToInsert,
    classNameToInsert, sectionNameToInsert, dto.rollNumber ?? null,
    dto.admissionDate, academicYearToInsert,
    dto.previousSchool ?? null, createdById,
  );

  const student = studentRows[0];

  for (const g of guardianData) {
    await tx.$queryRawUnsafe(
      `INSERT INTO guardians (id, student_id, relation, first_name, last_name, phone, email, is_primary)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO NOTHING`,
      g.id, student.id, g.relation, g.firstName, g.lastName,
      g.phone, g.email ?? null, g.isPrimary,
    );
  }

  return student;
});
return toStudentResponse(row);
```

### 11d: Update StudentController — add guardian account + my-children routes

- [ ] **Step 4: Add routes to student.controller.ts**

Add imports:

```typescript
import { GuardianService } from './guardian.service';
import { CreateGuardianAccountDto } from './dto/create-guardian-account.dto';
```

Inject in constructor:

```typescript
constructor(
  private readonly studentService: StudentService,
  private readonly guardianService: GuardianService,
) {}
```

Add routes at the end of the class (before closing brace):

```typescript
  @Get('my-children')
  @Roles(Role.PARENT)
  getMyChildren(@CurrentUser() user: AuthUser) {
    return this.guardianService.getMyChildren(user.userId);
  }

  @Post(':studentId/guardians/:guardianId/account')
  @Roles(Role.SCHOOL_OWNER, Role.PRINCIPAL, Role.ACADEMIC_COORDINATOR)
  createGuardianAccount(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('guardianId', ParseUUIDPipe) guardianId: string,
    @Body() dto: CreateGuardianAccountDto,
  ) {
    return this.guardianService.createGuardianAccount(studentId, guardianId, dto);
  }
```

### 11e: Update StudentModule

- [ ] **Step 5: Add GuardianService to StudentModule**

```typescript
// apps/api/src/modules/student/student.module.ts
import { Module } from '@nestjs/common';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { GuardianService } from './guardian.service';

@Module({
  controllers: [StudentController],
  providers: [StudentService, GuardianService],
  exports: [StudentService],
})
export class StudentModule {}
```

- [ ] **Step 6: Verify compilation**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

---

## Task 12: Write guardian/parent unit tests (5 scenarios)

**Files:**
- Create: `apps/api/src/modules/student/__tests__/guardian.service.spec.ts`

- [ ] **Step 1: Write the test file**

```typescript
// apps/api/src/modules/student/__tests__/guardian.service.spec.ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { GuardianService } from '../guardian.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';

const mockCtx = { tenantId: 'tid-1', slug: 'test', schemaName: 'tenant_test' };

const mockGuardian = {
  id: 'g-uuid-1',
  student_id: 's-uuid-1',
  relation: 'FATHER',
  first_name: 'Ram',
  last_name: 'Shrestha',
  phone: '9841000001',
  email: null,
  is_primary: true,
  user_id: null,
};

describe('GuardianService', () => {
  let service: GuardianService;
  let tenantPrisma: jest.Mocked<TenantPrismaService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GuardianService,
        { provide: TenantPrismaService, useValue: { query: jest.fn(), execute: jest.fn() } },
        {
          provide: TenantContextService,
          useValue: { getOrThrow: jest.fn().mockReturnValue(mockCtx) },
        },
      ],
    }).compile();

    service = module.get(GuardianService);
    tenantPrisma = module.get(TenantPrismaService) as jest.Mocked<TenantPrismaService>;
  });

  // Test 15: create account for guardian → PARENT user created, linked
  it('createGuardianAccount() creates a PARENT user and links them to the guardian', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockGuardian])       // find guardian
      .mockResolvedValueOnce([])                   // no existing user with that email
      .mockResolvedValueOnce([{ id: 'new-uid-1' }]); // INSERT user
    (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

    const result = await service.createGuardianAccount('s-uuid-1', 'g-uuid-1', {
      email: 'ram@parent.np',
      password: 'ParentPass1!',
    });

    expect(result.linked).toBe(true);
    expect(result.userId).toBe('new-uid-1');
    expect(result.guardianId).toBe('g-uuid-1');

    // UPDATE guardians SET user_id was called
    expect(tenantPrisma.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE guardians SET user_id'),
      'new-uid-1',
      'g-uuid-1',
    );
  });

  // Test 16: guardian already linked → 409
  it('createGuardianAccount() throws 409 when guardian already has a userId', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
      { ...mockGuardian, user_id: 'existing-uid' },
    ]);

    await expect(
      service.createGuardianAccount('s-uuid-1', 'g-uuid-1', {
        email: 'ram@parent.np',
        password: 'ParentPass1!',
      }),
    ).rejects.toThrow(ConflictException);
  });

  // Test 17: email belongs to existing PARENT → link without creating new user
  it('createGuardianAccount() links existing PARENT user (second-child case)', async () => {
    (tenantPrisma.query as jest.Mock)
      .mockResolvedValueOnce([mockGuardian])                    // find guardian
      .mockResolvedValueOnce([{ id: 'parent-uid-1', role: 'PARENT' }]); // existing PARENT
    (tenantPrisma.execute as jest.Mock).mockResolvedValue(1);

    const result = await service.createGuardianAccount('s-uuid-1', 'g-uuid-1', {
      email: 'existingparent@school.np',
      password: 'ignored-because-user-exists',
    });

    expect(result.userId).toBe('parent-uid-1');
    expect(result.linked).toBe(true);
    // No INSERT users — only the UPDATE guardians call
    expect(tenantPrisma.query).toHaveBeenCalledTimes(2);
    expect(tenantPrisma.execute).toHaveBeenCalledTimes(1);
  });

  // Test 18: my-children returns only linked students, excludes soft-deleted
  it('getMyChildren() returns students linked via guardians.user_id, excludes deleted', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
      {
        id: 's-uuid-1',
        student_id: '2082-0001',
        first_name: 'Aarav',
        last_name: 'Shrestha',
        photo_url: null,
        relation: 'FATHER',
        class_name: 'Class 8',
        section_name: 'B',
        roll_number: 12,
      },
    ]);

    const result = await service.getMyChildren('parent-uid-1');

    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe('Aarav');
    expect(result[0].relation).toBe('FATHER');
    expect(result[0].currentEnrollment?.className).toBe('Class 8');

    const sql: string = (tenantPrisma.query as jest.Mock).mock.calls[0][0];
    expect(sql).toContain('g.user_id = $1::uuid');
    expect(sql).toContain('s.deleted_at IS NULL');
  });

  // Test 19: my-children returns null currentEnrollment when student not enrolled
  it('getMyChildren() sets currentEnrollment to null when class_name is null', async () => {
    (tenantPrisma.query as jest.Mock).mockResolvedValueOnce([
      {
        id: 's-uuid-2',
        student_id: '2082-0002',
        first_name: 'Sita',
        last_name: 'Sharma',
        photo_url: null,
        relation: 'MOTHER',
        class_name: null,
        section_name: null,
        roll_number: null,
      },
    ]);

    const result = await service.getMyChildren('parent-uid-2');

    expect(result[0].currentEnrollment).toBeNull();
  });
});
```

- [ ] **Step 2: Run the new tests**

```bash
cd apps/api && npm test -- --testPathPattern=guardian.service.spec --no-coverage
```

Expected: 5 tests pass.

---

## Task 13: Run the full test suite

- [ ] **Step 1: Run all tests**

```bash
cd apps/api && npm test -- --no-coverage
```

Expected output: **183+ tests passing, 0 failures.** The 164 existing tests plus the ~19 new ones.

If any existing test fails, investigate and fix before proceeding. Do not move to Task 14 until all tests are green.

---

## Task 14: Update CLAUDE.md + LEARNING-GUIDE.md

**Files:**
- Modify: `CLAUDE.md` (root of monorepo)
- Modify: `LEARNING-GUIDE.md` (root of monorepo)

### 14a: CLAUDE.md additions

- [ ] **Step 1: Add Session 19 items to CLAUDE.md**

Find the "Code patterns to always follow" section (or create a "Mobile API conventions" section after the existing code patterns). Add:

```markdown
## Mobile API conventions (added Session 19)

- `X-Client-Type: mobile` header switches auth delivery from httpOnly cookie to response body.
  - Login: returns `{ accessToken, refreshToken, user, tenant }` (no Set-Cookie)
  - Refresh: reads token from JSON body `{ refreshToken }` — missing body token = hard 401, NO cookie fallback
  - Logout: reads token from `{ refreshToken }` body; optionally deletes device token if `expoPushToken` provided
  - Web behavior (no header or any other value): unchanged byte-for-byte
- `@ClientType()` param decorator in `apps/api/src/modules/common/decorators/client-type.decorator.ts` — use in controllers, not services
- Services receive `clientType` as a plain argument when needed (so unit tests don't mock requests)
```

Also find the "What's built so far" checklist and mark Session 19 modules, and add to the existing notes:

```markdown
- **DeviceToken hard-delete exception**: `device_tokens` table has no `deletedAt` column. Deliberate exception to the soft-delete convention. Stale push tokens cause failed sends with zero audit value. Never add `deletedAt` to this table.
- **Guardian.userId linkage**: `guardians` table (Session 19) has a nullable `user_id` FK. Indexed but NOT unique (one parent user can be guardian to multiple students). Used by `GET /api/v1/students/my-children`.
```

And in the endpoints list add:
```markdown
- ✅ **Session 19 endpoints**:
  - `GET  /api/v1/tenants/verify/:slug` — public, no auth, throttled 10/min
  - `POST /api/v1/communication/devices` — register Expo device token (any role)
  - `DELETE /api/v1/communication/devices/:token` — deregister device token (any role)
  - `POST /api/v1/students/:studentId/guardians/:guardianId/account` — create parent login (SCHOOL_OWNER/PRINCIPAL/ACADEMIC_COORDINATOR)
  - `GET /api/v1/students/my-children` — parent's children list (PARENT role only)
```

### 14b: LEARNING-GUIDE.md — append Session 19 section

- [ ] **Step 2: Append Session 19 section to LEARNING-GUIDE.md**

Add at the end of the file:

```markdown
## Session 19 — Mobile Backend Prep

### (a) Why mobile gets the refresh token in the body, and why SecureStore makes that safe

Web browsers have a native cookie jar with solid httpOnly + SameSite protections. A JavaScript
attacker running in the browser page cannot read httpOnly cookies — the browser enforces this
in hardware. React Native has no equivalent cookie jar: cookies you set from a server response
are silently dropped or inconsistently handled depending on the HTTP client library.

Mobile apps instead store secrets in the OS keychain (`expo-secure-store` on Expo). This is
the mobile equivalent of httpOnly: other apps cannot read keychain items (enforced by iOS
Secure Enclave and Android Keystore). So returning the refresh token in the JSON body and
immediately writing it to `SecureStore` is equally secure to the cookie approach — the only
difference is the storage layer.

### (b) Why the refresh endpoint never falls back from body → cookie on mobile

The spec requires: if `X-Client-Type: mobile` is set and the body has no `refreshToken`, return
401 immediately. No cookie fallback.

This is intentional. A hybrid fallback would mean that if a mobile client forgets to send the
body token, it silently authenticates via a cookie that may belong to a different session (or
even a different user on a shared device). Silent fallback hides bugs. The hard 401 forces the
mobile client to be explicit: you opted into mobile mode, so you own the token — if it's missing,
you need to prompt the user to log in again. The invariant is: in mobile mode, the body token
is the only valid source.

### (c) Why the tenant verify endpoint returns identical 404s for suspended and nonexistent schools

The mobile app shows a "enter your school code" screen before login. If we returned a different
error for "school exists but is suspended" vs. "school doesn't exist", an unauthenticated caller
could enumerate which school slugs exist on the platform and which are active. This leaks
platform-level business information (e.g., "sunrise-ktm is a real school, it's just suspended"),
which a competitor or bad actor could exploit.

Returning the same generic 404 "School not found" regardless of the reason makes slug-scanning
useless — the attacker learns nothing from the response. Rate-limiting (10/min per IP) further
prevents automated enumeration.

### (d) Why device tokens are reassigned between users instead of rejected

In Nepal, it is common for multiple family members to share one phone (low smartphone
penetration, multi-generational households). A parent logs in, registers the device token.
Their student child logs in on the same phone — the token is the same hardware token, but
the logged-in user changed.

If we rejected the registration ("this token is already taken"), the student's app would
silently fail to register and would never receive push notifications. Instead, we reassign
the token to whoever is currently logged in. The token identifies a hardware device; whoever
is active on that device *now* owns the notification channel. When push notifications are
implemented (Session 24), they are sent to the user linked to the token at send time — which
is always the most recent logged-in user. This is the correct behaviour for a shared-device
culture.
```

- [ ] **Step 3: Final verification — run full suite one more time**

```bash
cd apps/api && npm test -- --no-coverage
```

Expected: 183+ tests, all green.

---

## Self-review: spec coverage check

| Spec requirement | Covered in task |
|---|---|
| `X-Client-Type: mobile` → refresh in body, no cookie | Task 4, tested Task 5 |
| Web login/refresh unchanged (regression) | Task 5 (tests 1–5) |
| Mobile refresh: missing body token = hard 401, no cookie fallback | Task 5 test 3 |
| Mobile logout: body token + optional expoPushToken | Task 4, test 6 |
| `@ClientType()` param decorator | Task 2 |
| `GET /tenants/verify/:slug` — public, no auth | Task 6 |
| Slug normalization to lowercase | Task 7 test 9 |
| Identical 404 for suspended/nonexistent | Task 7 test 8 |
| Throttle 10/min per IP | Task 1 + Task 6 |
| `device_tokens` table — hard delete, no `deletedAt` | Task 8 |
| Expo token format validation | Task 9 DTO + test 13 |
| Upsert-by-token: new / same user / cross-user reassignment | Task 9 service + tests 10–12 |
| `DELETE /communication/devices/:token` → 404 for other's token | Test 14 |
| `guardians` relational table + JSONB migration | Task 8 |
| `admitStudent()` dual-writes to guardians table | Task 11c |
| Admin: create PARENT account for guardian | Task 11, test 15 |
| 409 when guardian already linked | Test 16 |
| Link existing PARENT (second-child case) | Test 17 |
| 409 when email belongs to non-PARENT | Covered in `createGuardianAccount()` ConflictException path |
| `GET /students/my-children` — PARENT role, excludes soft-deleted | Task 11d, tests 18–19 |
| `currentEnrollment: null` when not enrolled | Test 19 |
| All 164 existing tests still pass | Task 13 |
| 183+ total passing | Task 13 |
| CLAUDE.md updated | Task 14a |
| LEARNING-GUIDE.md Session 19 section | Task 14b |
