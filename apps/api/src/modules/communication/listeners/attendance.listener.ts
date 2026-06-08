import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SmsService } from '../sms.service';

interface AttendanceAbsentEvent {
  tenantSlug: string;
  date: string;
  absentStudents: Array<{
    studentId: string;
    studentName: string;
    parentPhone: string | null;
  }>;
}

@Injectable()
export class AttendanceListener {
  constructor(private readonly smsService: SmsService) {}

  @OnEvent('attendance.absent')
  async handleAbsent(payload: AttendanceAbsentEvent): Promise<void> {
    for (const student of payload.absentStudents) {
      if (!student.parentPhone) continue;
      const message = `Aaramva Shikshya: ${student.studentName} was absent on ${payload.date}. Contact school for details.`;
      try {
        await this.smsService.send(
          student.parentPhone,
          message,
          'ATTENDANCE_ABSENT',
          student.studentId,
        );
      } catch {
        // Silently swallow — a failed SMS must not crash the attendance request
      }
    }
  }
}
