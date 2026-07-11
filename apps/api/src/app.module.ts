import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envValidationSchema } from './config/env.validation';
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
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { HealthModule } from './modules/health/health.module';
import { MailModule } from './modules/mail/mail.module';

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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Enforce rate limiting globally. Was configured but never bound before.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'api/v1/super-admin/(.*)', method: RequestMethod.ALL },
        { path: 'api/v1/tenants/verify/(.*)', method: RequestMethod.ALL },
        // eSewa browser-facing routes (pay page, callbacks, receipt): no auth
        // header, no X-Tenant-Slug — tenant comes from the path and is
        // resolved programmatically in EsewaPublicController.
        { path: 'api/v1/finance/payments/esewa/public/(.*)', method: RequestMethod.ALL },
        { path: 'health', method: RequestMethod.ALL },
      )
      .forRoutes('*');
  }
}
