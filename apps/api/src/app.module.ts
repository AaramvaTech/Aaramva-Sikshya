import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { LibraryModule } from './modules/library/library.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';

const redisAvailable = process.env.REDIS_ENABLED !== 'false' &&
  !!(process.env.REDIS_URL || process.env.REDIS_HOST);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
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
    LibraryModule,
    SuperAdminModule,
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
      )
      .forRoutes('*');
  }
}
