import { Module } from '@nestjs/common';
import { CommunicationController } from './communication.controller';
import { SmsService } from './sms.service';
import { NoticeService } from './notice.service';
import { NotificationService } from './notification.service';
import { PushService } from './push.service';
import { AttendanceListener } from './listeners/attendance.listener';
import { FinanceListener } from './listeners/finance.listener';
import { ExaminationListener } from './listeners/examination.listener';
import { NoticeListener } from './listeners/notice.listener';
import { AssignmentListener } from './listeners/assignment.listener';
import { DeviceTokenService } from './device-token.service';

@Module({
  controllers: [CommunicationController],
  providers: [
    SmsService,
    NoticeService,
    NotificationService,
    PushService,
    AttendanceListener,
    FinanceListener,
    ExaminationListener,
    NoticeListener,
    AssignmentListener,
    DeviceTokenService,
  ],
  exports: [SmsService, NoticeService, NotificationService, PushService],
})
export class CommunicationModule {}
