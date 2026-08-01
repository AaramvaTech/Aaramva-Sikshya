import { BadRequestException, Injectable } from '@nestjs/common';
import { bsToAd, todayBs } from 'bs-calendar';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { toMoney } from '../finance/entities/finance.entity';
import { formatLocalDate } from '../common/utils/date.util';

/**
 * BILL-9 §3 — daybook: "what happened today" ledger view. Sources
 * student_ledger_entries directly (new-system-only by construction, B9-7 —
 * old-rail invoices/payments never post ledger entries, per BILL-3's own
 * "purely additive" migration comment) rather than reconstructing the day
 * from bill_invoices/bill_payments separately.
 *
 * Every ledger row already carries its own entry_bs_year/month/day (BILL-3's
 * insertEntry always computes it from entry_date via bsOf()) — filtering on
 * those columns directly means no BS<->AD range conversion is needed here at
 * all, unlike the other BILL-9 reports.
 *
 * A PENDING cheque has NO ledger entry until it clears (BillPaymentService
 * only calls postEntryInTx once status is CLEARED), so the daybook already
 * excludes uncleared cheques by construction — same "cheques count as
 * collection only when CLEARED" rule as the rest of BILL-9, enforced here by
 * the ledger's own write path rather than a WHERE clause.
 */
const BS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface DaybookEntryRow {
  id: string;
  entry_type: string;
  debit: string;
  credit: string;
  created_at: Date | string;
  student_id: string;
  first_name: string;
  last_name: string;
  admission_number: string;
  narration: string | null;
  invoice_number: string | null;
  payment_method: string | null;
  receipt_number: string | null;
}

interface MethodTotalRow {
  method: string;
  total: string;
}

interface TotalsRow {
  total_invoiced: string;
  total_collected: string;
  total_refunded: string;
  net_movement: string;
}

@Injectable()
export class DaybookReportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getDaybook(params: { bsDate?: string }) {
    let bs: { year: number; month: number; day: number };
    if (params.bsDate) {
      if (!BS_DATE_RE.test(params.bsDate)) {
        throw new BadRequestException('bsDate must be a BS date in YYYY-MM-DD form.');
      }
      const [year, month, day] = params.bsDate.split('-').map(Number);
      bs = { year, month, day };
    } else {
      bs = todayBs();
    }

    const entries = await this.tenantPrisma.query<DaybookEntryRow>(
      `SELECT sle.id, sle.entry_type, sle.debit, sle.credit, sle.created_at, sle.narration,
              s.id AS student_id, s.first_name, s.last_name, s.student_id AS admission_number,
              bi.invoice_number, bp.method AS payment_method, bp.receipt_number
       FROM student_ledger_entries sle
       JOIN students s ON s.id = sle.student_id
       LEFT JOIN bill_payments bp ON sle.ref_doc_type = 'bill_payment' AND bp.id = sle.ref_doc_id
       LEFT JOIN bill_invoices bi ON sle.ref_doc_type = 'bill_invoice' AND bi.id = sle.ref_doc_id
       WHERE sle.entry_bs_year = $1 AND sle.entry_bs_month = $2 AND sle.entry_bs_day = $3
       ORDER BY sle.created_at`,
      bs.year,
      bs.month,
      bs.day,
    );

    const byMethod = await this.tenantPrisma.query<MethodTotalRow>(
      `SELECT bp.method, SUM(sle.credit) AS total
       FROM student_ledger_entries sle
       JOIN bill_payments bp ON bp.id = sle.ref_doc_id AND sle.ref_doc_type = 'bill_payment'
       WHERE sle.entry_bs_year = $1 AND sle.entry_bs_month = $2 AND sle.entry_bs_day = $3
         AND sle.entry_type IN ('PAYMENT', 'DEPOSIT')
       GROUP BY bp.method`,
      bs.year,
      bs.month,
      bs.day,
    );

    const [totalsRow] = await this.tenantPrisma.query<TotalsRow>(
      `SELECT
         COALESCE(SUM(debit) FILTER (WHERE entry_type = 'INVOICE'), 0) AS total_invoiced,
         COALESCE(SUM(credit) FILTER (WHERE entry_type IN ('PAYMENT', 'DEPOSIT')), 0) AS total_collected,
         COALESCE(SUM(debit) FILTER (WHERE entry_type = 'REFUND'), 0) AS total_refunded,
         COALESCE(SUM(credit) - SUM(debit), 0) AS net_movement
       FROM student_ledger_entries
       WHERE entry_bs_year = $1 AND entry_bs_month = $2 AND entry_bs_day = $3`,
      bs.year,
      bs.month,
      bs.day,
    );

    return {
      bsDate: bs,
      adDate: formatLocalDate(bsToAd(bs)),
      entries: entries.map((r) => ({
        id: r.id,
        time: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        entryType: r.entry_type,
        studentId: r.student_id,
        studentName: `${r.first_name} ${r.last_name}`,
        admissionNumber: r.admission_number,
        debit: toMoney(r.debit).toNumber(),
        credit: toMoney(r.credit).toNumber(),
        narration: r.narration,
        invoiceNumber: r.invoice_number,
        paymentMethod: r.payment_method,
        receiptNumber: r.receipt_number,
      })),
      byMethod: byMethod.map((r) => ({ method: r.method, total: toMoney(r.total).toNumber() })),
      totals: {
        totalInvoiced: toMoney(totalsRow?.total_invoiced ?? 0).toNumber(),
        totalCollected: toMoney(totalsRow?.total_collected ?? 0).toNumber(),
        totalRefunded: toMoney(totalsRow?.total_refunded ?? 0).toNumber(),
        // ΣCredit − ΣDebit for the day, SQL-side: positive = collections
        // outweighed new invoicing + refunds that day, negative = the
        // opposite. Computed as one SQL expression, not a JS subtraction of
        // the two totals above.
        netMovement: toMoney(totalsRow?.net_movement ?? 0).toNumber(),
      },
    };
  }
}
