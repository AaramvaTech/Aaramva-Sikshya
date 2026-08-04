import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { resolveRange, isoDate } from './report.util';
import { Money } from '../../common/money/money';
import { toMoney } from '../finance/entities/finance.entity';

interface FineRow {
  id: string;
  accrued_through: Date | string;
  days_overdue: number;
  delta_posted: string;
  rule_type_snapshot: string | null;
  rule_value_snapshot: string | null;
  invoice_id: string;
  invoice_number: string;
  student_id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  class_name: string | null;
  section_name: string | null;
  reversed: boolean;
}

/**
 * BILL-7-SPEC.md §5/§7 Checkpoint B — "which invoices accrued fines, how
 * much, under which rule, over a BS range." Mounted under the existing
 * REP-1 ReportsController at GET /reports/finance/fines, not
 * GET /finance/reports/fines as the spec literally names it — same
 * precedent as BILL-9 Checkpoint A (BILL-9-CKPTA-DEVIATION-1): reusing the
 * one finance-reports home avoids a second, parallel reports surface.
 *
 * `reversed` mirrors BillFineService.processInvoice's own already_posted
 * exclusion (a reversed fine's ledger_entry_id has a mirror row with
 * reverses_entry_id pointing at it) — totalFined is NET of reversals (what
 * students actually still owe from fines), while each row still shows its
 * full historical delta_posted plus a reversed flag, so a reversed-but-
 * still-visible fine is never silently hidden from the audit view.
 */
@Injectable()
export class FinesReportService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getFines(params: { from?: string; to?: string; classId?: string }) {
    const { from, to } = resolveRange(params.from, params.to);

    const rows = await this.tenantPrisma.query<FineRow>(
      `SELECT bfa.id, bfa.accrued_through, bfa.days_overdue, bfa.delta_posted,
              bfa.rule_type_snapshot, bfa.rule_value_snapshot,
              bi.id AS invoice_id, bi.invoice_number,
              s.id AS student_id, s.student_id AS admission_number, s.first_name, s.last_name,
              s.class_id, s.class_name, s.section_name,
              EXISTS (
                SELECT 1 FROM student_ledger_entries sle WHERE sle.reverses_entry_id = bfa.ledger_entry_id
              ) AS reversed
       FROM bill_fine_accruals bfa
       JOIN bill_invoices bi ON bi.id = bfa.bill_invoice_id
       JOIN students s ON s.id = bfa.student_id
       WHERE bfa.accrued_through BETWEEN $1::date AND $2::date
         AND ($3::uuid IS NULL OR s.class_id = $3::uuid)
       ORDER BY bfa.accrued_through DESC, bfa.created_at DESC`,
      from,
      to,
      params.classId ?? null,
    );

    let totalFined = Money.zero();
    for (const r of rows) {
      if (!r.reversed) totalFined = totalFined.add(toMoney(r.delta_posted));
    }

    return {
      range: { from, to },
      count: rows.length,
      totalFined: totalFined.toNumber(),
      accruals: rows.map((r) => ({
        id: r.id,
        accruedThrough: isoDate(r.accrued_through),
        daysOverdue: r.days_overdue,
        amount: toMoney(r.delta_posted).toNumber(),
        ruleType: r.rule_type_snapshot,
        ruleValue: r.rule_value_snapshot != null ? toMoney(r.rule_value_snapshot).toNumber() : null,
        reversed: r.reversed,
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        studentId: r.student_id,
        admissionNumber: r.admission_number,
        fullName: `${r.first_name} ${r.last_name}`,
        classId: r.class_id,
        className: r.class_name,
        sectionName: r.section_name,
      })),
    };
  }
}
