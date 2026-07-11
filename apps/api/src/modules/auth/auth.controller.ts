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
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ClientType } from '../common/decorators/client-type.decorator';
import type { ClientType as ClientTypeValue } from '../common/decorators/client-type.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import type { AuthUser } from './auth.types';
import { CreateSchoolDto } from './dto/create-school.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/password.dto';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // Public tenant provisioning: CREATE SCHEMA + full DDL per call — the worst
  // abuse vector on the API. Hard cap: 3 per hour per IP.
  @Post('register-school')
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
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

  // 5/min per IP. Known tuning point: Nepal schools share NAT'd IPs, so a whole
  // staff logging in at 9:55am can burst against a single origin — revisit with
  // per-user throttling if legitimate logins start hitting 429 (not this session).
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
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
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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

  // ─── Password reset + change (MAIL-1 T3/T4) ────────────────────────────────

  // Public + oracle-free: identical generic 200 whether or not the account
  // exists. 3/hour per IP (SEC-1 discipline — this endpoint sends email).
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If an account exists for that email, a reset link has been sent.' };
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword);
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
