import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/enums/role.enum';
import type { AuthUser } from '../auth/auth.types';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformChangePasswordDto, PlatformLoginDto } from './dto/platform-login.dto';
import { PlanService } from './plan.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { TenantAdminService } from './tenant-admin.service';
import {
  ManualOnboardTenantDto,
  UpdateSubscriptionDto,
  UpdateTenantDto,
  ListTenantsQueryDto,
} from './dto/tenant-admin.dto';
import { ImpersonationService } from './impersonation.service';
import { AnalyticsService } from './analytics.service';
import { AuditService } from './audit.service';
import { PlatformSettingsService, PlatformSettingsDto } from './platform-settings.service';

/**
 * Platform session cookie. Deliberately a DIFFERENT name + path from the school's
 * `refresh_token` (/api/v1/auth) so the two never collide in one browser, and so
 * it is only ever sent to the platform auth routes.
 */
const PLATFORM_REFRESH_COOKIE = 'platform_refresh_token';
const PLATFORM_REFRESH_COOKIE_PATH = '/api/v1/super-admin/auth';

@Controller('super-admin')
export class SuperAdminController {
  constructor(
    private readonly platformAuth: PlatformAuthService,
    private readonly config: ConfigService,
    private readonly planService: PlanService,
    private readonly tenantAdmin: TenantAdminService,
    private readonly impersonation: ImpersonationService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  // ─── Auth ──────────────────────────────────────────────────────────────────

  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() dto: PlatformLoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.platformAuth.login(dto);
    this.setPlatformRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken, admin: result.admin };
  }

  /**
   * Platform sessions survive a reload: the access JWT lives in memory only, so
   * the web app exchanges this httpOnly cookie for a fresh pair on boot (and on
   * a 401 mid-session). Rotating + throttled like the school refresh.
   */
  @Post('auth/refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[PLATFORM_REFRESH_COOKIE];
    const result = await this.platformAuth.refresh(token);
    this.setPlatformRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken, admin: result.admin };
  }

  // MAIL-1 T4: platform-admin change-password (closes the OPS-1 script gap).
  @Post('auth/change-password')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: PlatformChangePasswordDto) {
    return this.platformAuth.changePassword(user.userId, dto.currentPassword, dto.newPassword);
  }

  @Post('auth/logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[PLATFORM_REFRESH_COOKIE];
    await this.platformAuth.logout(token);
    res.clearCookie(PLATFORM_REFRESH_COOKIE, { path: PLATFORM_REFRESH_COOKIE_PATH });
    return { loggedOut: true };
  }

  private setPlatformRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(PLATFORM_REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'strict',
      maxAge: expiresAt.getTime() - Date.now(),
      path: PLATFORM_REFRESH_COOKIE_PATH,
    });
  }

  // ─── Plans ─────────────────────────────────────────────────────────────────

  @Post('plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  async createPlan(@Body() dto: CreatePlanDto, @CurrentUser() user: AuthUser) {
    const plan = await this.planService.create(dto);
    await this.audit.log(user.userId, 'PLAN_CREATED', 'PLAN', plan.id, { name: dto.name });
    return plan;
  }

  @Get('plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  listPlans() {
    return this.planService.list();
  }

  @Patch('plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  async updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentUser() user: AuthUser,
  ) {
    const plan = await this.planService.update(id, dto);
    await this.audit.log(user.userId, 'PLAN_UPDATED', 'PLAN', id);
    return plan;
  }

  @Delete('plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  async deactivatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    const plan = await this.planService.deactivate(id);
    await this.audit.log(user.userId, 'PLAN_DEACTIVATED', 'PLAN', id);
    return plan;
  }

  // ─── Tenants ───────────────────────────────────────────────────────────────

  @Post('tenants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  onboardTenant(
    @Body() dto: ManualOnboardTenantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenantAdmin.onboardTenant(dto, user.userId);
  }

  @Get('tenants')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  listTenants(@Query() query: ListTenantsQueryDto) {
    return this.tenantAdmin.listTenants(query);
  }

  // MAIL-1 resend: regenerate the school owner's temp password + email it.
  @Post('tenants/:id/resend-owner-credentials')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  resendOwnerCredentials(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenantAdmin.resendOwnerCredentials(id, user.userId);
  }

  @Get('tenants/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  getTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.tenantAdmin.getTenantDetail(id);
  }

  @Patch('tenants/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenantAdmin.updateTenant(id, dto, user.userId);
  }

  @Patch('tenants/:id/activate')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  activateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenantAdmin.activateTenant(id, user.userId);
  }

  @Patch('tenants/:id/suspend')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  suspendTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenantAdmin.suspendTenant(id, user.userId);
  }

  @Patch('tenants/:id/subscription')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  updateSubscription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenantAdmin.updateSubscription(id, dto, user.userId);
  }

  // ─── Impersonation ─────────────────────────────────────────────────────────

  @Post('tenants/:id/impersonate')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  impersonate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.impersonation.impersonate(id, user.userId, user.email);
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  @Get('analytics/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  getOverview() {
    return this.analytics.getOverview();
  }

  @Get('analytics/revenue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  getRevenue() {
    return this.analytics.getRevenue();
  }

  // ─── Audit logs ────────────────────────────────────────────────────────────

  @Get('audit-logs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  getAuditLogs(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.audit.listLogs(Number(page), Number(limit));
  }

  // ─── Platform Settings ─────────────────────────────────────────────────────

  @Get('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  getSettings() {
    return this.platformSettings.getSettings();
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PLATFORM_ADMIN)
  updateSettings(@Body() dto: PlatformSettingsDto) {
    return this.platformSettings.updateSettings(dto);
  }
}
