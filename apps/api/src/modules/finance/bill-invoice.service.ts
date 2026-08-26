import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../tenant/tenant-prisma.service';
import { Role } from '../common/enums/role.enum';
import { BillInvoiceQueryDto } from './dto/bill-invoice.dto';
import {
  BillInvoiceRow, BillInvoiceItemRow, BillInvoiceResponseDto,
  toBillInvoiceResponse,
} from './entities/bill-invoice.entity';
import { toMoney } from './entities/finance.entity';
import { GuardianScopeService } from '../student/guardian-scope.service';
import {
  OWN_BALANCE_EXPR, CLEARED_ALLOCATIONS_JOIN, clampOwnBalance,
} from './bill-own-balance.util';

/**
 * BILL-4-SPEC.md §5 read endpoints: list, single (parent object-scoped),
 * per-student (parent object-scoped). Read-only — never touches
 * bill_invoices/bill_invoice_items beyond SELECT; posting stays exclusively
 * BillRunPostRunnerService's job.
 */
@Injectable()
export class BillInvoiceService {
  private readonly logger = new Logger(BillInvoiceService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly guardianScope: GuardianScopeService,
  ) {}

  async findAll(query: BillInvoiceQueryDto): Promise<{
    data: BillInvoiceResponseDto[];
    meta: { page: number; limit: number; total: number };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = ['bi.deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;
    if (query.studentId) { conditions.push(`bi.student_id = $${idx++}::uuid`); params.push(query.studentId); }
    if (query.classId) { conditions.push(`s.class_id = $${idx++}::uuid`); params.push(query.classId); }
    if (query.academicYearId) { conditions.push(`bi.academic_year_id = $${idx++}::uuid`); params.push(query.academicYearId); }
    if (query.bsYear) { conditions.push(`bi.bs_year = $${idx++}`); params.push(query.bsYear); }
    if (query.bsMonth) { conditions.push(`bi.bs_month = $${idx++}`); params.push(query.bsMonth); }
    if (query.status) { conditions.push(`bi.status = $${idx++}`); params.push(query.status); }

    params.push(limit, offset);
    const rows = await this.tenantPrisma.query<BillInvoiceRow>(
      `SELECT bi.*, s.first_name || ' ' || s.last_name AS student_name,
              s.student_id AS admission_number, c.name AS class_name,
              COALESCE(SUM(bpa.amount), 0) AS paid_amount,
              -- D15-REPOINT: this invoice's OWN outstanding — net_amount less
              -- its cleared allocations, never total_receivable. A balance
              -- built from total_receivable restates every earlier unpaid
              -- month on this row, so listing a student's invoices shows the
              -- same arrears once per month they have been outstanding. Same
              -- rule apps/web/lib/invoice-totals.ts's docblock already states
              -- for the web side: "netAmount ... never totalReceivable ...
              -- summing totalReceivable across a student's invoices
              -- double-counts every carried balance."
              ${OWN_BALANCE_EXPR} AS balance,
              -- BILL-CHECKOUT-1: names only, so a list card can say what its
              -- amount covers. A correlated subquery rather than a second
              -- round trip per row (N+1) or a third join whose fan-out the
              -- SUM(bpa.amount) above would have to be de-duplicated against.
              (SELECT ARRAY_AGG(bii.item_name ORDER BY bii.created_at)
                 FROM bill_invoice_items bii WHERE bii.bill_invoice_id = bi.id) AS item_names,
              COUNT(*) OVER() AS total_count
       FROM bill_invoices bi
       JOIN students s ON s.id = bi.student_id
       LEFT JOIN classes c ON c.id = s.class_id
       ${CLEARED_ALLOCATIONS_JOIN}
       WHERE ${conditions.join(' AND ')}
       GROUP BY bi.id, s.first_name, s.last_name, s.student_id, c.name
       ORDER BY bi.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      ...params,
    );

    const total = rows[0]?.total_count ? parseInt(rows[0].total_count, 10) : 0;
    return { data: rows.map((r) => toBillInvoiceResponse(this.clampBalance(r))), meta: { page, limit, total } };
  }

  async findOne(id: string, callerId?: string, callerRole?: Role): Promise<BillInvoiceResponseDto> {
    const rows = await this.tenantPrisma.query<BillInvoiceRow>(
      // BILL-PRINT-1: section, roll and primary guardian join the SELECT for
      // the print stationery's party block. All three columns already existed
      // — nothing here is a schema change. Grouping by s.id (the students PK)
      // makes every s.* column and the correlated guardian subquery legal
      // without enumerating them.
      `SELECT bi.*, s.first_name || ' ' || s.last_name AS student_name,
              s.student_id AS admission_number, c.name AS class_name,
              sec.name AS section_name, s.roll_number,
              (SELECT g.first_name || COALESCE(' ' || g.last_name, '')
                 FROM guardians g WHERE g.student_id = s.id
                ORDER BY g.is_primary DESC, g.created_at LIMIT 1) AS guardian_name,
              COALESCE(SUM(bpa.amount), 0) AS paid_amount,
              -- D15-REPOINT: own outstanding, not total_receivable — see the
              -- same expression in findAll above for why.
              ${OWN_BALANCE_EXPR} AS balance
       FROM bill_invoices bi
       JOIN students s ON s.id = bi.student_id
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN sections sec ON sec.id = s.section_id
       ${CLEARED_ALLOCATIONS_JOIN}
       WHERE bi.id = $1::uuid AND bi.deleted_at IS NULL
       GROUP BY bi.id, s.id, c.name, sec.name`,
      id,
    );
    if (!rows[0]) throw new NotFoundException(`Invoice ${id} not found`);

    if (callerRole === Role.PARENT && callerId) {
      await this.guardianScope.assertOwnsStudent(callerId, rows[0].student_id);
    }

    const items = await this.tenantPrisma.query<BillInvoiceItemRow>(
      `SELECT * FROM bill_invoice_items WHERE bill_invoice_id = $1::uuid ORDER BY created_at`,
      id,
    );
    return toBillInvoiceResponse(this.clampBalance(rows[0]), items);
  }

  /**
   * A negative own balance means this invoice's cleared allocations exceed
   * its own charge — it breaches the allocation cap (ALLOCATION-CAP-1 /
   * BILLING-CALC-AUDIT-1 Ruling 3; 8 such invoices existed at the census and
   * are corrected forward, not rewritten, so they are still out there). Show
   * 0.00 rather than a negative "balance", and log it, because clamping
   * silently would discard the one signal that says so.
   */
  private clampBalance(row: BillInvoiceRow): BillInvoiceRow {
    if (row.balance === undefined || row.balance === null) return row;
    // invoice_number is nullable on the row type (a draft has none yet); the
    // id is the fallback so the WARN can always name something a human can
    // look up.
    const ref = row.invoice_number ?? row.id;
    return { ...row, balance: clampOwnBalance(toMoney(row.balance), ref, this.logger).toDb() };
  }

  async findByStudent(
    studentId: string,
    query: BillInvoiceQueryDto,
    callerId?: string,
    callerRole?: Role,
  ): Promise<{ data: BillInvoiceResponseDto[]; meta: { page: number; limit: number; total: number } }> {
    if (callerRole === Role.PARENT && callerId) {
      await this.guardianScope.assertOwnsStudent(callerId, studentId);
    }
    return this.findAll({ ...query, studentId });
  }
}
