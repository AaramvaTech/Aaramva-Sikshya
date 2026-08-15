import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../notification.service';
import { PushService } from '../push.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { GuardianService } from '../../student/guardian.service';

export interface AssignmentPublishedEvent {
  tenantSlug: string;
  assignmentId: string;
  title: string;
  dueDate: string;
  classId: string;
  sectionId: string | null;
  subjectName: string;
}

export interface SubmissionReviewedEvent {
  tenantSlug: string;
  assignmentId: string;
  assignmentTitle: string;
  studentId: string;
  marks: number | null;
}

/**
 * EDU-1 fan-outs (mirror rule: in-app notification rows FIRST, then push with
 * route + notificationId — same discipline as NoticeListener).
 *
 * assignment.published fires on the DRAFT→PUBLISHED edge only; audience =
 * the targeted section's (or whole class's) ACTIVE students with accounts +
 * their guardians' PARENT accounts. submission.reviewed → that one student +
 * their guardians.
 */
@Injectable()
export class AssignmentListener {
  private readonly logger = new Logger(AssignmentListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushService: PushService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly guardianService: GuardianService,
  ) {}

  @OnEvent('assignment.published')
  async handleAssignmentPublished(payload: AssignmentPublishedEvent): Promise<void> {
    try {
      const scoped = await this.tenantPrisma.query<{ id: string }>(
        `SELECT s.id
         FROM students s
         WHERE s.deleted_at IS NULL AND s.status = 'ACTIVE'
           AND s.class_id = $1::uuid
           AND ($2::uuid IS NULL OR s.section_id = $2::uuid)`,
        payload.classId,
        payload.sectionId,
      );
      const studentUserRows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT DISTINCT u.id
         FROM students s
         JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
         WHERE s.deleted_at IS NULL AND s.status = 'ACTIVE'
           AND s.class_id = $1::uuid
           AND ($2::uuid IS NULL OR s.section_id = $2::uuid)`,
        payload.classId,
        payload.sectionId,
      );
      const parentUserIds = await this.guardianService.getActiveParentUserIds(scoped.map((s) => s.id));
      const userIds = Array.from(new Set([...studentUserRows.map((r) => r.id), ...parentUserIds]));
      if (userIds.length === 0) return;

      const title = `New assignment: ${payload.title}`;
      const body = `${payload.subjectName} — due ${payload.dueDate}`;
      const created = await this.notificationService.createNotificationsBulk(
        userIds,
        title,
        body,
        'ASSIGNMENT',
        { assignmentId: payload.assignmentId, route: 'assignments' },
      );
      await this.pushService.sendToRecipients(
        created.map((c) => ({ userId: c.userId, notificationId: c.id })),
        { title, body, route: 'assignments', data: { assignmentId: payload.assignmentId } },
      );
    } catch (err) {
      // Never crash the publish request from the notification path.
      this.logger.error(
        `Assignment fan-out failed for ${payload.assignmentId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent('submission.reviewed')
  async handleSubmissionReviewed(payload: SubmissionReviewedEvent): Promise<void> {
    try {
      const studentUserRows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT u.id FROM students s
         JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
         WHERE s.id = $1::uuid`,
        payload.studentId,
      );
      const parentUserIds = await this.guardianService.getActiveParentUserIds([payload.studentId]);
      const userIds = Array.from(new Set([...studentUserRows.map((r) => r.id), ...parentUserIds]));
      if (userIds.length === 0) return;

      const title = `Assignment reviewed: ${payload.assignmentTitle}`;
      const body =
        payload.marks !== null
          ? `Marks: ${payload.marks} — feedback is available.`
          : 'Feedback is available.';
      const created = await this.notificationService.createNotificationsBulk(
        userIds,
        title,
        body,
        'ASSIGNMENT',
        { assignmentId: payload.assignmentId, route: 'assignments' },
      );
      await this.pushService.sendToRecipients(
        created.map((c) => ({ userId: c.userId, notificationId: c.id })),
        { title, body, route: 'assignments', data: { assignmentId: payload.assignmentId } },
      );
    } catch (err) {
      this.logger.error(
        `Review fan-out failed for submission of ${payload.studentId}: ${(err as Error).message}`,
      );
    }
  }
}
