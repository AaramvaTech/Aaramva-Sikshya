import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { isoDate, todayAdInNepal } from './report.util';
import { toMoney } from '../finance/entities/finance.entity';

/**
 * BILL-9 §3 — defaulters. B9-9: balance comes straight from
 * `student_account_balances` (the ledger's same-transaction cache), never a
 * bespoke re-derivation — a fully-settled student has balance <= 0 there and
 * is excluded by the WHERE, not by re-summing invoices. "Oldest unpaid
 * invoice age" is the one piece balance alone can't answer, so it's a
 * separate bill_invoices lookup (new-system rail, B9-7).
 */
const SORTS = ['balance', 'class', 'oldest'] as const;
type Sort = (typeof SORTS)[number];

// Fixed, whitelisted ORDER BY clauses only — `sort` is validated against
// SORTS before indexing this map, so no user input ever reaches the SQL text.
const ORDER_BY: Record<Sort, string> = {
  balance: 'sab.balance DESC',
  class: 's.class_name ASC NULLS LAST, s.section_name ASC NULLS LAST, sab.balance DESC',
  oldest: 'o.oldest_due_date ASC NULLS LAST, sab.balance DESC',
};

interface DefaulterRow {
  student_id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  class_name: string | null;
  section_name: string | null;
  balance: string;
  overdue_invoices: string;
  oldest_due_date: Date | string | null;
  total_outstanding: string;
  total_count: string;
}

@Injectable()
export class DefaultersReportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getDefaulters(params: { classId?: string; minBalance?: string; sort?: string }) {
    const sort: Sort = (SORTS as readonly string[]).includes(params.sort ?? '') ? (params.sort as Sort) : 'balance';

    let minBalance: number | null = null;
    if (params.minBalance !== undefined && params.minBalance !== '') {
      minBalance = Number(params.minBalance);
      if (!Number.isFinite(minBalance) || minBalance < 0) {
        throw new BadRequestException('minBalance must be a non-negative number.');
      }
    }

    // total_outstanding/total_count via window functions — the same SQL
    // SUM that produces each row's balance also produces the grand total,
    // in the one round trip (B9-6).
    const rows = await this.tenantPrisma.query<DefaulterRow>(
      `WITH oldest AS (
         SELECT bi.student_id, MIN(bi.due_date) AS oldest_due_date, COUNT(*) AS overdue_invoices
         FROM bill_invoices bi
         WHERE bi.deleted_at IS NULL AND bi.status IN ('POSTED', 'PARTIALLY_PAID')
         GROUP BY bi.student_id
       )
       SELECT s.id AS student_id, s.student_id AS admission_number, s.first_name, s.last_name,
              s.class_id, s.class_name, s.section_name,
              sab.balance,
              COALESCE(o.overdue_invoices, 0) AS overdue_invoices,
              o.oldest_due_date,
              SUM(sab.balance) OVER () AS total_outstanding,
              COUNT(*) OVER () AS total_count
       FROM student_account_balances sab
       JOIN students s ON s.id = sab.student_id AND s.deleted_at IS NULL
       LEFT JOIN oldest o ON o.student_id = sab.student_id
       WHERE sab.balance > 0
         AND ($1::uuid IS NULL OR s.class_id = $1::uuid)
         AND ($2::numeric IS NULL OR sab.balance >= $2::numeric)
       ORDER BY ${ORDER_BY[sort]}`,
      params.classId ?? null,
      minBalance,
    );

    return {
      asOf: todayAdInNepal(),
      totalDefaulters: rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0,
      totalOutstanding: rows.length > 0 ? toMoney(rows[0].total_outstanding).toNumber() : 0,
      students: rows.map((r) => ({
        studentId: r.student_id,
        admissionNumber: r.admission_number,
        fullName: `${r.first_name} ${r.last_name}`,
        classId: r.class_id,
        className: r.class_name,
        sectionName: r.section_name,
        balance: toMoney(r.balance).toNumber(),
        overdueInvoices: parseInt(r.overdue_invoices, 10),
        oldestDueDate: r.oldest_due_date ? isoDate(r.oldest_due_date) : null,
      })),
    };
  }
}
