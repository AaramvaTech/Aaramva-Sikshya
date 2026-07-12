import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { isoDate, todayAdInNepal, toNum } from './report.util';

/**
 * REP-1 T3 — fee aging. An invoice ages when it has outstanding balance
 * (the GENERATED balance column: total − paid, so PARTIAL is naturally in at
 * its remaining amount — same population semantics as the defaulters report,
 * which lists per-student outstanding; aging adds the time dimension and the
 * web tab links to defaulters rather than duplicating it).
 *
 * Buckets (days past due as of the given date): 0–30 / 31–60 / 61–90 / 90+.
 * "0–30" starts at 1 day past due — an invoice due today or in the future is
 * CURRENT, not aged (excluded from buckets, reported separately).
 */
const BUCKETS = ['0-30', '31-60', '61-90', '90+'] as const;
export type AgingBucket = (typeof BUCKETS)[number];

export function bucketForDays(days: number): AgingBucket | null {
  if (days <= 0) return null; // current, not aged
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class FeeAgingReportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getAging(params: { asOf?: string; classId?: string }) {
    if (params.asOf && !ISO_DATE_RE.test(params.asOf)) {
      throw new BadRequestException('asOf must be an AD date in YYYY-MM-DD form.');
    }
    const asOf = params.asOf ?? todayAdInNepal();

    const rows = await this.tenantPrisma.query<{
      invoice_id: string;
      invoice_number: string;
      due_date: Date;
      balance: string;
      days_past_due: number;
      student_id: string;
      first_name: string;
      last_name: string;
      class_name: string | null;
      section_name: string | null;
    }>(
      // days_past_due in SQL is plain date subtraction (integer days) — no TZ
      // math; asOf itself is computed Kathmandu-side in the service.
      `SELECT i.id AS invoice_id, i.invoice_number, i.due_date, i.balance,
              ($1::date - i.due_date) AS days_past_due,
              s.id AS student_id, s.first_name, s.last_name, s.class_name, s.section_name
       FROM invoices i
       JOIN students s ON s.id = i.student_id AND s.deleted_at IS NULL
       WHERE i.deleted_at IS NULL AND i.balance > 0 AND i.due_date < $1::date
         AND ($2::uuid IS NULL OR s.class_id = $2::uuid)
       ORDER BY days_past_due DESC, i.invoice_number`,
      asOf,
      params.classId ?? null,
    );

    const totals: Record<AgingBucket, { amount: number; invoices: number }> = {
      '0-30': { amount: 0, invoices: 0 },
      '31-60': { amount: 0, invoices: 0 },
      '61-90': { amount: 0, invoices: 0 },
      '90+': { amount: 0, invoices: 0 },
    };
    const byClass = new Map<string, Record<AgingBucket, number> & { total: number }>();
    const detail: {
      bucket: AgingBucket;
      invoiceId: string;
      invoiceNumber: string;
      studentId: string;
      studentName: string;
      className: string | null;
      sectionName: string | null;
      dueDate: string;
      daysPastDue: number;
      balance: number;
    }[] = [];

    for (const r of rows) {
      const bucket = bucketForDays(r.days_past_due);
      if (!bucket) continue; // defensive; the WHERE already excludes current
      const balance = toNum(r.balance);
      totals[bucket].amount = Math.round((totals[bucket].amount + balance) * 100) / 100;
      totals[bucket].invoices += 1;

      const classKey = r.class_name ?? 'Unassigned';
      let c = byClass.get(classKey);
      if (!c) {
        c = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
        byClass.set(classKey, c);
      }
      c[bucket] = Math.round((c[bucket] + balance) * 100) / 100;
      c.total = Math.round((c.total + balance) * 100) / 100;

      detail.push({
        bucket,
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        studentId: r.student_id,
        studentName: `${r.first_name} ${r.last_name}`,
        className: r.class_name,
        sectionName: r.section_name,
        dueDate: isoDate(r.due_date),
        daysPastDue: r.days_past_due,
        balance,
      });
    }

    const totalOutstanding =
      Math.round(BUCKETS.reduce((s, b) => s + totals[b].amount, 0) * 100) / 100;

    return {
      asOf,
      buckets: BUCKETS.map((b) => ({ bucket: b, ...totals[b] })),
      totalOutstanding,
      byClass: [...byClass.entries()]
        .map(([className, v]) => ({ className, ...v }))
        .sort((a, b) => a.className.localeCompare(b.className)),
      invoices: detail,
    };
  }
}
