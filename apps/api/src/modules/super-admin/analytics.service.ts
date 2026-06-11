import { Injectable } from '@nestjs/common';
import { adToBs } from 'bs-calendar';
import { PublicPrismaService } from './public-prisma.service';

function toDateField(d: Date) {
  const bs = adToBs(d);
  return {
    ad: d.toISOString(),
    bs: `${bs.year}-${String(bs.month).padStart(2, '0')}-${String(bs.day).padStart(2, '0')}`,
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly publicPrisma: PublicPrismaService) {}

  async getOverview() {
    const [totals] = await this.publicPrisma.query<{
      total: string;
      active: string;
      suspended: string;
    }>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE "isActive" = true) AS active,
         COUNT(*) FILTER (WHERE "isActive" = false) AS suspended
       FROM tenants WHERE "deletedAt" IS NULL`,
    );

    const subRows = await this.publicPrisma.query<{ status: string; count: string }>(
      `SELECT s.status, COUNT(*) AS count
       FROM subscriptions s
       JOIN tenants t ON t.id = s."tenantId"
       WHERE t."deletedAt" IS NULL AND t."isActive" = true
       GROUP BY s.status`,
    );
    const subByStatus: Record<string, number> = {};
    for (const r of subRows) {
      subByStatus[r.status] = parseInt(r.count, 10);
    }

    const planRows = await this.publicPrisma.query<{ plan_name: string; count: string }>(
      `SELECT p.name AS plan_name, COUNT(*) AS count
       FROM subscriptions s
       JOIN plans p ON p.id = s."planId"
       JOIN tenants t ON t.id = s."tenantId"
       WHERE t."deletedAt" IS NULL AND t."isActive" = true
       GROUP BY p.name`,
    );
    const subByPlan: Record<string, number> = {};
    for (const r of planRows) {
      subByPlan[r.plan_name.toLowerCase()] = parseInt(r.count, 10);
    }

    const recentRows = await this.publicPrisma.query<{
      id: string;
      name: string;
      slug: string;
      created_at: Date;
      plan_name: string;
    }>(
      `SELECT t.id, t.name, t.slug, t."createdAt" AS created_at, p.name AS plan_name
       FROM tenants t
       LEFT JOIN subscriptions s ON s."tenantId" = t.id
       LEFT JOIN plans p ON p.id = s."planId"
       WHERE t."deletedAt" IS NULL
       ORDER BY t."createdAt" DESC
       LIMIT 5`,
    );

    const now = new Date();

    return {
      asOf: toDateField(now),
      totals: {
        schools: parseInt(totals?.total ?? '0', 10),
        activeSchools: parseInt(totals?.active ?? '0', 10),
        trialSchools: subByStatus['TRIAL'] ?? 0,
        suspendedSchools: parseInt(totals?.suspended ?? '0', 10),
      },
      subscriptions: {
        trial: subByStatus['TRIAL'] ?? 0,
        basic: subByPlan['basic'] ?? 0,
        pro: subByPlan['pro'] ?? 0,
        enterprise: subByPlan['enterprise'] ?? 0,
      },
      recentOnboarding: recentRows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        createdAt: toDateField(new Date(r.created_at)),
        planName: r.plan_name,
      })),
    };
  }

  async getRevenue() {
    const rows = await this.publicPrisma.query<{
      month: string;
      plan_name: string;
      active_count: string;
      monthly_revenue: string;
    }>(
      `SELECT
         TO_CHAR(s."startsAt", 'YYYY-MM') AS month,
         p.name AS plan_name,
         COUNT(*) AS active_count,
         SUM(p."monthlyPrice") AS monthly_revenue
       FROM subscriptions s
       JOIN plans p ON p.id = s."planId"
       WHERE s.status IN ('ACTIVE', 'TRIAL')
       GROUP BY TO_CHAR(s."startsAt", 'YYYY-MM'), p.name
       ORDER BY month DESC
       LIMIT 60`,
    );

    return rows.map((r) => ({
      month: r.month,
      planName: r.plan_name,
      activeSchools: parseInt(r.active_count, 10),
      revenue: parseFloat(r.monthly_revenue),
    }));
  }
}
