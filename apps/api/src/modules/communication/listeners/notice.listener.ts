import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationService } from '../notification.service';
import { PushService } from '../push.service';
import { ROLE_AUDIENCES } from '../notice.service';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service';
import { GuardianService } from '../../student/guardian.service';

export interface NoticePostedEvent {
  tenantSlug: string;
  noticeId: string;
  title: string;
  body: string;
  audience: string;
  classId: string | null;
}

/** Push body cap — the full text lives in the notice itself. */
const PUSH_BODY_MAX = 180;

/**
 * notice.posted fan-out (PUSH-1, NEW event from NoticeService.publishNotice).
 *
 * ALL/STUDENTS/PARENTS/TEACHERS: recipients = users whose role's ROLE_AUDIENCES
 * entry contains the notice audience — exactly the set that can see the notice
 * in GET /notices, so a notification never points at an invisible notice.
 *
 * CLASS: the visibility matrix predates class-scoped delivery (students/parents
 * can't list CLASS notices yet — pre-existing gap, noted in CLAUDE.md); the
 * intended targets are unambiguous though, so we notify that class's students
 * with accounts + their guardians' PARENT accounts.
 */
@Injectable()
export class NoticeListener {
  private readonly logger = new Logger(NoticeListener.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushService: PushService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly guardianService: GuardianService,
  ) {}

  @OnEvent('notice.posted')
  async handleNoticePosted(payload: NoticePostedEvent): Promise<void> {
    try {
      const users = await this.resolveAudience(payload);
      if (users.length === 0) return;

      const pushBody =
        payload.body.length > PUSH_BODY_MAX
          ? `${payload.body.slice(0, PUSH_BODY_MAX - 1)}…`
          : payload.body;
      const data = { noticeId: payload.noticeId, route: 'notices' };
      const created = await this.notificationService.createNotificationsBulk(
        users,
        payload.title,
        pushBody,
        'NOTICE',
        data,
      );
      await this.pushService.sendToRecipients(
        created.map((c) => ({ userId: c.userId, notificationId: c.id })),
        { title: payload.title, body: pushBody, route: 'notices', data: { noticeId: payload.noticeId } },
      );
    } catch (err) {
      // Never crash the publish request from the notification path.
      this.logger.error(`Notice fan-out failed for notice ${payload.noticeId}: ${(err as Error).message}`);
    }
  }

  private async resolveAudience(payload: NoticePostedEvent): Promise<string[]> {
    if (payload.audience === 'CLASS') {
      if (!payload.classId) return [];
      const scoped = await this.tenantPrisma.query<{ id: string }>(
        `SELECT s.id
         FROM students s
         JOIN sections sec ON sec.id = s.section_id AND sec.class_id = $1::uuid
         WHERE s.deleted_at IS NULL`,
        payload.classId,
      );
      const studentUserRows = await this.tenantPrisma.query<{ id: string }>(
        `SELECT DISTINCT u.id
         FROM students s
         JOIN sections sec ON sec.id = s.section_id AND sec.class_id = $1::uuid
         JOIN users u ON u.id = s.user_id AND u.deleted_at IS NULL
         WHERE s.deleted_at IS NULL`,
        payload.classId,
      );
      const parentUserIds = await this.guardianService.getActiveParentUserIds(scoped.map((s) => s.id));
      return Array.from(new Set([...studentUserRows.map((r) => r.id), ...parentUserIds]));
    }

    const roles = Object.entries(ROLE_AUDIENCES)
      .filter(([, audiences]) => audiences.includes(payload.audience))
      .map(([role]) => role);
    if (roles.length === 0) return [];

    const rows = await this.tenantPrisma.query<{ id: string }>(
      `SELECT id FROM users WHERE role = ANY($1) AND deleted_at IS NULL`,
      roles,
    );
    return rows.map((r) => r.id);
  }
}
