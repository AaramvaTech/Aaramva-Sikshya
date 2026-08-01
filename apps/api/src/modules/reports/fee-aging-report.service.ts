import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { isoDate, todayAdInNepal } from './report.util';
import { toMoney } from '../finance/entities/finance.entity';

/**
 * REP-1 T3 — fee aging. BILL-9 B9-1/B9-7 extension: re-sourced from the
 * new-system `bill_invoices` rail (old-rail `invoices` is pre-BILL-4 test
 * junk, per B9-7) — same response shape and roles, so the existing
 * `/reports/finance/aging` web consumer (`app/(school)/reports/page.tsx`)
 * is untouched. B9-6: every total is a SQL SUM/window aggregation, never a
 * JS `reduce`/`Math.round` accumulator (the pre-BILL-9 version of this file
 * did exactly that — replaced here).
 *
 * An invoice's outstanding balance is the same formula BillPaymentService
 * already treats as ground truth for "how much is left on this invoice"
 * (fetchUnpaidInvoicesOldestFirst / recomputeInvoiceStatus): total_receivable
 * minus the SUM of allocations whose parent bill_payment is CLEARED — a
 * PENDING/BOUNCED/VOIDED payment's allocations never reduce the balance.
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

/** Shared CTE: every overdue, still-outstanding bill_invoice as of $1, with
 *  its SQL-computed balance, days past due, and aging bucket. Repeated
 *  verbatim across the two top-level queries below (Postgres CTEs don't
 *  survive across separate round trips) — kept as one constant so the two
 *  copies can't drift. */
const AGED_INVOICES_CTE = `
  WITH aged AS (
    SELECT bi.id AS invoice_id, bi.invoice_number, bi.due_date,
           (bi.total_receivable - COALESCE(paid.paid_amount, 0)) AS balance,
           ($1::date - bi.due_date) AS days_past_due,
           s.id AS student_id, s.first_name, s.last_name, s.class_name, s.section_name
    FROM bill_invoices bi
    JOIN students s ON s.id = bi.student_id AND s.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT SUM(bpa.amount) AS paid_amount
      FROM bill_payment_allocations bpa
      JOIN bill_payments bp ON bp.id = bpa.bill_payment_id AND bp.status = 'CLEARED'
      WHERE bpa.bill_invoice_id = bi.id
    ) paid ON true
    WHERE bi.deleted_at IS NULL AND bi.status IN ('POSTED', 'PARTIALLY_PAID')
      AND bi.due_date < $1::date
      AND ($2::uuid IS NULL OR s.class_id = $2::uuid)
  ),
  bucketed AS (
    SELECT *,
      CASE WHEN days_past_due <= 30 THEN '0-30'
           WHEN days_past_due <= 60 THEN '31-60'
           WHEN days_past_due <= 90 THEN '61-90'
           ELSE '90+' END AS bucket
    FROM aged
    WHERE balance > 0
  )
`;

interface AgedInvoiceRow {
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
  bucket: AgingBucket;
  bucket_total: string;
  bucket_count: string;
  grand_total: string;
}

interface ByClassRow {
  class_name: string | null;
  bucket: AgingBucket | null; // NULL = the GROUPING SETS per-class total row
  amount: string;
}

@Injectable()
export class FeeAgingReportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getAging(params: { asOf?: string; classId?: string }) {
    if (params.asOf && !ISO_DATE_RE.test(params.asOf)) {
      throw new BadRequestException('asOf must be an AD date in YYYY-MM-DD form.');
    }
    const asOf = params.asOf ?? todayAdInNepal();
    const classId = params.classId ?? null;

    // Detail rows, each carrying its own bucket's SUM/COUNT and the grand
    // total via window functions — SQL-side (B9-6), one round trip.
    const rows = await this.tenantPrisma.query<AgedInvoiceRow>(
      `${AGED_INVOICES_CTE}
       SELECT *,
              SUM(balance) OVER (PARTITION BY bucket) AS bucket_total,
              COUNT(*) OVER (PARTITION BY bucket) AS bucket_count,
              SUM(balance) OVER () AS grand_total
       FROM bucketed
       ORDER BY days_past_due DESC, invoice_number`,
      asOf,
      classId,
    );

    // Per-class rollup — GROUPING SETS gets both the per-bucket breakdown
    // AND the per-class grand total (bucket IS NULL row) from ONE SQL SUM,
    // so the class total is never a JS addition of the four bucket sums.
    const byClassRows = await this.tenantPrisma.query<ByClassRow>(
      `${AGED_INVOICES_CTE}
       SELECT class_name, bucket, SUM(balance) AS amount
       FROM bucketed
       GROUP BY GROUPING SETS ((class_name, bucket), (class_name))`,
      asOf,
      classId,
    );

    const bucketTotals: Record<AgingBucket, { amount: number; invoices: number }> = {
      '0-30': { amount: 0, invoices: 0 },
      '31-60': { amount: 0, invoices: 0 },
      '61-90': { amount: 0, invoices: 0 },
      '90+': { amount: 0, invoices: 0 },
    };
    for (const b of BUCKETS) {
      const first = rows.find((r) => r.bucket === b);
      if (first) {
        bucketTotals[b] = { amount: toMoney(first.bucket_total).toNumber(), invoices: parseInt(first.bucket_count, 10) };
      }
    }
    const totalOutstanding = toMoney(rows[0]?.grand_total ?? 0).toNumber();

    const byClass = new Map<string, Record<AgingBucket, number> & { total: number }>();
    for (const r of byClassRows) {
      const classKey = r.class_name ?? 'Unassigned';
      let c = byClass.get(classKey);
      if (!c) {
        c = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 };
        byClass.set(classKey, c);
      }
      const amount = toMoney(r.amount).toNumber();
      if (r.bucket === null) {
        c.total = amount; // GROUPING SETS' (class_name)-only row: the real SQL SUM, not a JS addition
      } else {
        c[r.bucket] = amount;
      }
    }

    return {
      asOf,
      buckets: BUCKETS.map((b) => ({ bucket: b, ...bucketTotals[b] })),
      totalOutstanding,
      byClass: [...byClass.entries()]
        .map(([className, v]) => ({ className, ...v }))
        .sort((a, b) => a.className.localeCompare(b.className)),
      invoices: rows.map((r) => ({
        bucket: r.bucket,
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        studentId: r.student_id,
        studentName: `${r.first_name} ${r.last_name}`,
        className: r.class_name,
        sectionName: r.section_name,
        dueDate: isoDate(r.due_date),
        daysPastDue: r.days_past_due,
        balance: toMoney(r.balance).toNumber(),
      })),
    };
  }
}
