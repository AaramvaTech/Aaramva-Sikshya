import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { StudentAttendanceService } from './student-attendance.service';
import { StaffAttendanceService } from './staff-attendance.service';
import { LeaveService } from './leave.service';
import { CommunicationModule } from '../communication/communication.module';

@Module({
  imports: [CommunicationModule], // SmsService for leave-decision notify-back
  controllers: [AttendanceController],
  providers: [StudentAttendanceService, StaffAttendanceService, LeaveService],
  exports: [StudentAttendanceService, StaffAttendanceService, LeaveService],
})
export class AttendanceModule {}
