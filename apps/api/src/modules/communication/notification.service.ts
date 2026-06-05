import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';

export interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  read_at: Date | null;
  data: object | null;
  created_at: Date;
  total_count?: string;
}

function toNotificationResponse(row: NotificationRow) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    type: row.type,
    isRead: row.is_read,
    readAt: row.read_at ?? null,
    data: row.data ?? null,
    createdAt: row.created_at,
  };
}

@Injectable()
export class NotificationService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async createNotification(
    userId: string,
    title: string,
    body: string,
    type: string,
    data?: object,
  ): Promise<void> {
    await this.tenantPrisma.run((tx) =>
      tx.$executeRawUnsafe(
        `INSERT INTO notifications (user_id, title, body, type, data)
         VALUES ($1::uuid, $2, $3, $4, $5::jsonb)`,
        userId,
        title,
        body,
        type,
        JSON.stringify(data ?? {}),
      ),
    );
  }

  async getMyNotifications(
    userId: string,
    query: { page?: number; limit?: number },
  ): Promise<{ data: ReturnType<typeof toNotificationResponse>[]; meta: { page: number; limit: number; total: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const rows = await this.tenantPrisma.query<NotificationRow & { total_count: string }>(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM notifications
       WHERE user_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      userId,
      limit,
      offset,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return {
      data: rows.map(toNotificationResponse),
      meta: { page, limit, total },
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    const rows = await this.tenantPrisma.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1::uuid AND is_read = false`,
      userId,
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  }

  async markAsRead(notifId: string, userId: string): Promise<void> {
    const existing = await this.tenantPrisma.run((tx) =>
      tx.$queryRawUnsafe<{ id: string; user_id: string; is_read: boolean }[]>(
        `SELECT id, user_id, is_read FROM notifications WHERE id = $1::uuid`,
        notifId,
      ),
    );
    if (!existing[0]) throw new NotFoundException(`Notification ${notifId} not found`);

    await this.tenantPrisma.run((tx) =>
      tx.$executeRawUnsafe(
        `UPDATE notifications SET is_read = true, read_at = NOW()
         WHERE id = $1::uuid AND user_id = $2::uuid`,
        notifId,
        userId,
      ),
    );
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.tenantPrisma.execute(
      `UPDATE notifications SET is_read = true, read_at = NOW()
       WHERE user_id = $1::uuid AND is_read = false`,
      userId,
    );
  }
}
