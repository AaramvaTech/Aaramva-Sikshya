import { Injectable } from '@nestjs/common';
import { PublicPrismaService } from './public-prisma.service';

export type AuditAction =
  | 'TENANT_CREATED'
  | 'TENANT_SUSPENDED'
  | 'TENANT_ACTIVATED'
  | 'TENANT_UPDATED'
  | 'PLAN_CREATED'
  | 'PLAN_UPDATED'
  | 'PLAN_DEACTIVATED'
  | 'SUBSCRIPTION_CHANGED'
  | 'IMPERSONATION';

@Injectable()
export class AuditService {
  constructor(private readonly publicPrisma: PublicPrismaService) {}

  async log(
    adminId: string,
    action: AuditAction,
    targetType: string | null,
    targetId: string | null,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.publicPrisma.execute(
      `INSERT INTO platform_audit_logs (admin_id, action, target_type, target_id, details)
       VALUES ($1::uuid, $2, $3, $4::uuid, $5::jsonb)`,
      adminId,
      action,
      targetType,
      targetId,
      JSON.stringify(details ?? {}),
    );
  }

  async listLogs(page: number, limit: number) {
    const offset = (page - 1) * limit;
    const [countRow] = await this.publicPrisma.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM platform_audit_logs`,
    );
    const total = parseInt(countRow?.count ?? '0', 10);

    const rows = await this.publicPrisma.query<{
      id: string;
      admin_id: string;
      admin_email: string;
      action: string;
      target_type: string | null;
      target_id: string | null;
      details: unknown;
      created_at: Date;
    }>(
      `SELECT pal.*, pa.email AS admin_email
       FROM platform_audit_logs pal
       JOIN platform_admins pa ON pa.id = pal.admin_id
       ORDER BY pal.created_at DESC
       LIMIT $1 OFFSET $2`,
      limit,
      offset,
    );

    return {
      data: rows.map((r) => ({
        id: r.id,
        adminId: r.admin_id,
        adminEmail: r.admin_email,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        details: r.details,
        createdAt: r.created_at,
      })),
      meta: { page, limit, total },
    };
  }
}
