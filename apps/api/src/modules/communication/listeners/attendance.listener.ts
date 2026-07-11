import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SmsService } from '../sms.service';
import { NotificationService } from '../notification.service';
import { PushService } from '../push.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';

interface AttendanceAbsentEvent {
  tenantSlug: string;
  date: string;
  absentStudents: Array<{ studentId: string }>;
}

/**
 * Absence fan-out (PUSH-1): the emit carries only studentIds — everything else
 * (student name, guardian phone, guardian PARENT accounts) is resolved here so
 * the audience is object-scoped per student: notifications go to THAT student's
 * linked guardians only. Mirror rule: in-app row first, push second.
 */
@Injectable()
export class AttendanceListener {
  private readonly logger = new Logger(AttendanceListener.name);

  constructor(
    private readonly smsService: SmsService,
    private readonly notificationService: NotificationService,
    private readonly pushService: PushService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  @OnEvent('attendance.absent')
  async handleAbsent(payload: AttendanceAbsentEvent): Promise<void> {
    for (const { studentId } of payload.absentStudents) {
      try {
        const students = await this.tenantPrisma.query<{ first_name: string; last_name: string }>(
          `SELECT first_name, last_name FROM students WHERE id = $1::uuid AND deleted_at IS NULL`,
          studentId,
        );
        if (!students[0]) continue;
        const studentName = `${students[0].first_name} ${students[0].last_name}`;

        // SMS to the primary-preferred guardian phone (same rule as FinanceListener).
        const phones = await this.tenantPrisma.query<{ phone: string | null }>(
          `SELECT phone FROM guardians
           WHERE student_id = $1::uuid AND phone IS NOT NULL
           ORDER BY is_primary DESC, created_at ASC
           LIMIT 1`,
          studentId,
        );
        if (phones[0]?.phone) {
          const message = `Aaramva Shikshya: ${studentName} was absent on ${payload.date}. Contact school for details.`;
          try {
            await this.smsService.send(phones[0].phone, message, 'ATTENDANCE_ABSENT', studentId);
          } catch {
            // Silently swallow — a failed SMS must not crash the attendance request
          }
        }

        // In-app rows + push for ALL of this student's linked PARENT accounts.
        const parents = await this.tenantPrisma.query<{ id: string }>(
          `SELECT DISTINCT u.id FROM guardians g
           JOIN users u ON u.id = g.user_id
           WHERE g.student_id = $1::uuid AND u.role = 'PARENT' AND u.deleted_at IS NULL`,
          studentId,
        );
        if (parents.length === 0) continue;

        const title = 'Absence Recorded';
        const body = `${studentName} was marked absent on ${payload.date}.`;
        const data = { studentId, date: payload.date, route: 'attendance' };
        const created = await this.notificationService.createNotificationsBulk(
          parents.map((p) => p.id),
          title,
          body,
          'ATTENDANCE',
          data,
        );
        await this.pushService.sendToRecipients(
          created.map((c) => ({ userId: c.userId, notificationId: c.id })),
          { title, body, route: 'attendance', data: { studentId, date: payload.date } },
        );
      } catch (err) {
        // Never crash the attendance request from the notification path.
        this.logger.error(`Absence fan-out failed for student ${studentId}: ${(err as Error).message}`);
      }
    }
  }
}
