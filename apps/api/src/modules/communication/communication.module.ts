import { Module } from '@nestjs/common';
import { CommunicationController } from './communication.controller';
import { SmsService } from './sms.service';
import { NoticeService } from './notice.service';
import { NotificationService } from './notification.service';
import { AttendanceListener } from './listeners/attendance.listener';
import { FinanceListener } from './listeners/finance.listener';

@Module({
  controllers: [CommunicationController],
  providers: [
    SmsService,
    NoticeService,
    NotificationService,
    AttendanceListener,
    FinanceListener,
  ],
  exports: [SmsService, NoticeService, NotificationService],
})
export class CommunicationModule {}
