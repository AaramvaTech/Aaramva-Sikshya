import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envValidationSchema } from './config/env.validation';
import { OptionalJwtGuard } from './modules/common/guards/optional-jwt.guard';
import { TenantMatchGuard } from './modules/common/guards/tenant-match.guard';
import { PasswordChangeRequiredGuard } from './modules/common/guards/password-change-required.guard';
import { PrismaModule } from './prisma/prisma.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { TenantMiddleware } from './modules/tenant/tenant.middleware';
import { AuthModule } from './modules/auth/auth.module';
import { StudentModule } from './modules/student/student.module';
import { AcademicModule } from './modules/academic/academic.module';
import { CalendarModule } from './modules/calendar/calendar.module';
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
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { HealthModule } from './modules/health/health.module';
import { MailModule } from './modules/mail/mail.module';
import { StorageModule } from './modules/storage/storage.module';
import { AssignmentModule } from './modules/assignment/assignment.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CredentialDeliveryModule } from './modules/credential-delivery/credential-delivery.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    EventEmitterModule.forRoot(),
    // Global default: 100 req / 60s per IP. Strict per-route overrides live on
    // the sensitive endpoints via @Throttle (auth login/refresh/register, SMS).
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    TenantModule,
    AuthModule,
    StudentModule,
    AcademicModule,
    CalendarModule,
    AttendanceModule,
    FinanceModule,
    HrModule,
    // OPS-1 T4: unconditional — the fine cron runs on @nestjs/schedule now
    // (in-process, no Redis). The old Redis-gated conditional was one of the
    // two layers of the silently-dead-cron bug.
    JobsModule,
    ExaminationModule,
    CommunicationModule,
    DashboardModule,
    LibraryModule,
    SuperAdminModule,
    SettingsModule,
    OnboardingModule,
    HealthModule,
    MailModule,
    StorageModule,
    AssignmentModule,
    ReportsModule,
    CredentialDeliveryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Enforce rate limiting globally. Was configured but never bound before.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // QA-1 BUG-4: global guards, in order. OptionalJwtGuard populates req.user
    // from a valid token (never rejects — strict auth stays per-controller);
    // TenantMatchGuard then rejects any token whose tenant ≠ the resolved tenant.
    { provide: APP_GUARD, useClass: OptionalJwtGuard },
    { provide: APP_GUARD, useClass: TenantMatchGuard },
    // REG-1 §3: after tenant-match, block a must_change_password user from every
    // route except @AllowPasswordChangeRequired() (change-password, logout) with
    // 403 PASSWORD_CHANGE_REQUIRED. Fresh DB read → clears the moment they change.
    { provide: APP_GUARD, useClass: PasswordChangeRequiredGuard },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'api/v1/super-admin/(.*)', method: RequestMethod.ALL },
        { path: 'api/v1/tenants/verify/(.*)', method: RequestMethod.ALL },
        // Gateway browser-facing routes (pay page, callbacks, receipt): no auth
        // header, no X-Tenant-Slug — tenant comes from the path and is
        // resolved programmatically in the gateway's public controller.
        { path: 'api/v1/finance/payments/esewa/public/(.*)', method: RequestMethod.ALL },
        { path: 'api/v1/finance/payments/khalti/public/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
