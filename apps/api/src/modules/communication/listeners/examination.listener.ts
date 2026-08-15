import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../notification.service';
import { PushService } from '../push.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { GuardianService } from '../../student/guardian.service';

export interface ResultPublishedEvent {
  tenantSlug: string;
  examTypeId: string;
  examTypeName: string;
  academicYearId: string;
}

/**
 * result.published fan-out (PUSH-1, NEW event from ExamTypeService.setPublished).
 * Audience = students who actually HAVE a computed result for that term
 * (student_results rows) with linked accounts, plus their guardians' PARENT
 * accounts. Mirror rule: in-app rows first, push second.
 */
@Injectable()
export class ExaminationListener {
  private readonly logger = new Logger(ExaminationListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushService: PushService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly guardianService: GuardianService,
  ) {}

  @OnEvent('result.published')
  async handleResultPublished(payload: ResultPublishedEvent): Promise<void> {
    try {
      const scoped = await this.tenantPrisma.query<{ student_id: string }>(
        `SELECT DISTINCT sr.student_id
         FROM student_results sr
         JOIN students s ON s.id = sr.student_id AND s.deleted_at IS NULL
         WHERE sr.exam_type_id = $1::uuid`,
        payload.examTypeId,
      );
      const studentUserRows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT DISTINCT u.id
         FROM student_results sr
         JOIN students s ON s.id = sr.student_id AND s.deleted_at IS NULL
         JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
         WHERE sr.exam_type_id = $1::uuid`,
        payload.examTypeId,
      );
      const parentUserIds = await this.guardianService.getActiveParentUserIds(scoped.map((s) => s.student_id));
      const userIds = Array.from(new Set([...studentUserRows.map((r) => r.id), ...parentUserIds]));
      if (userIds.length === 0) return;

      const title = 'Results Published';
      const body = `Results for ${payload.examTypeName} have been published.`;
      const data = { examTypeId: payload.examTypeId, route: 'results' };
      const created = await this.notificationService.createNotificationsBulk(
        userIds,
        title,
        body,
        'EXAM',
        data,
      );
      await this.pushService.sendToRecipients(
        created.map((c) => ({ userId: c.userId, notificationId: c.id })),
        { title, body, route: 'results', data: { examTypeId: payload.examTypeId } },
      );
    } catch (err) {
      // Never crash the publish request from the notification path.
      this.logger.error(
        `Result-published fan-out failed for exam type ${payload.examTypeId}: ${(err as Error).message}`,
      );
    }
  }
}
